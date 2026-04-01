/* AXON /U — otc.js — Core Data & Wallet & Theme */

// ===== PLATFORM CONFIG =====
async function loadConfig(){
  try{
    var r=await fetch('https://ai-colony.top/otc/config.json?t='+Date.now());
    var cfg=await r.json();
    // Maintenance mode
    var overlay=document.getElementById('maintenanceOverlay');
    if(cfg.enabled===false&&overlay){
      overlay.style.display='flex';
      var msg=document.getElementById('maintenanceMsg');
      if(msg&&cfg.maintenance_msg)msg.textContent=cfg.maintenance_msg;
      return false;
    }else if(overlay){overlay.style.display='none';}
    // Notice bar
    var bar=document.getElementById('noticeBar');
    if(bar){
      if(cfg.notice&&cfg.notice.length>0){
        bar.textContent=cfg.notice;
        bar.className='notice-bar '+(cfg.notice_type||'warn');
        bar.style.display='block';
      }else{bar.style.display='none';}
    }
    return true;
  }catch(e){return true;}
}

// ===== THEME =====

// HTML entity escape — sanitize all external data before innerHTML
function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toggleTheme(){
  var html=document.documentElement;
  var cur=html.getAttribute('data-theme')||'dark';
  var next=cur==='dark'?'light':'dark';
  html.setAttribute('data-theme',next);
  localStorage.setItem('otc-theme',next);
  var btn=document.getElementById('themeBtn');
  btn.style.transition='transform .4s ease';
  btn.style.transform='rotate(360deg) scale(1.1)';
  setTimeout(function(){
    btn.textContent=next==='dark'?'🌙':'☀️';
    btn.style.transform='';
  },200);
}
(function(){
  var saved=localStorage.getItem('otc-theme');
  if(saved){
    document.documentElement.setAttribute('data-theme',saved);
    var btn=document.getElementById('themeBtn');
    if(btn)btn.textContent=saved==='dark'?'🌙':'☀️';
  }
})();

var KEEPER='https://axonotc.com';
var AXON_RPC='https://mainnet-rpc.axonchain.ai/';
var AXON_RPC_FALLBACK='https://ai-colony.top/axon-rpc/';
async function rpcFetch(body,opts){
  var b=typeof body==='string'?body:JSON.stringify(body);
  var base={method:'POST',headers:{'Content-Type':'application/json'},body:b};
  try{
    var r=await Promise.any([
      fetch(AXON_RPC,Object.assign({},base,opts||{})).then(function(r){if(!r.ok)throw r;return r;}),
      fetch(AXON_RPC_FALLBACK,Object.assign({},base,opts||{})).then(function(r){if(!r.ok)throw r;return r;})
    ]);
    return r;
  }catch(e){
    return fetch(AXON_RPC_FALLBACK,Object.assign({},base,opts||{}));
  }
}
var CHAIN_NAMES={56:'BSC',42161:'Arbitrum'};
var CHAIN_HEX={56:'0x38',42161:'0xa4b1'};
var TOKENS={56:{USDT:'0x55d398326f99059fF775485246999027B3197955',USDC:'0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'},42161:{USDT:'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',USDC:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831'}};
var CHAIN_CFG={56:{chainId:'0x38',chainName:'BNB Smart Chain',nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:['https://bsc-dataseed.binance.org/'],blockExplorerUrls:['https://bscscan.com']},42161:{chainId:'0xa4b1',chainName:'Arbitrum One',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:['https://arb1.arbitrum.io/rpc'],blockExplorerUrls:['https://arbiscan.io']}};
var EXPLORER={56:'https://bscscan.com/tx/',42161:'https://arbiscan.io/tx/'};
var TOKEN_DECIMALS={56:{USDT:18,USDC:18},42161:{USDT:6,USDC:6}};

var orders=[];
var orderTimes={}; // {orderId: {created, cancel_requested, cancelled, fulfilled, ...}}
var _provider=null;
function getProvider(){
  if(_provider)return _provider;
  if(window.okxwallet)return window.okxwallet;
  if(window.ethereum)return window.ethereum;
  return null;
}
var AXON_CHAIN={chainId:'0x2012',chainName:'Axon Mainnet',nativeCurrency:{name:'AXON',symbol:'AXON',decimals:18},rpcUrls:['https://mainnet-rpc.axonchain.ai/'],blockExplorerUrls:['https://axon-explorer.axonchain.ai/']};
var trades=[];
var walletAddr=null;
var pendingOrder=null;
var detailOrderId=null;
var alertEnabled=false;
var alertPrice=0;
var tradeAlertEnabled=false;
var myPrevOrders=[];
var _buying=false; // prevent double-click buy
var _selling=false; // prevent double-click sell
var _buyStart=0; // timestamp for stuck detection
var _sellStart=0;
var _switchStart=0;
var _switchingChain=false; // chain switch lock

// ===== INIT =====
window.addEventListener('load', init);

async function init(){
  var ok=await loadConfig();
  if(!ok)return; // maintenance mode
  checkKeeper();
  var wp=getProvider();
  if(wp){
    try{
      var accs=await wp.request({method:'eth_accounts'});
      if(accs&&accs[0]){walletAddr=accs[0];_provider=wp;showWallet();}
    }catch(e){}
    if(wp.on){
      wp.on('accountsChanged',function(a){
        walletAddr=a&&a[0]?a[0]:null;
        showWallet();
        if(!walletAddr) onDisconnect();
        else loadMyOrders();
      });
      wp.on('chainChanged',function(chainId){
        // just update UI, no reload needed
      });
      wp.on('disconnect',function(){
        onDisconnect();
      });
    }
  }
  await loadOrders();
  updateSellCmd();
  setInterval(loadOrders,15000); // 挂单快刷
  setInterval(loadConfig,60000); // 配置慢刷
}

function onDisconnect(){
  walletAddr=null;
  _provider=null;
  _buying=false;
  _selling=false;
  showWallet();
  document.getElementById('myAddr').textContent='未连接';
  document.getElementById('myBal').textContent='';
}

async function checkKeeper(){
  var el=document.getElementById('keeperStatus');
  try{
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ctrl.abort();},8000);
    var r=await fetch(KEEPER+'/health',{signal:ctrl.signal});
    clearTimeout(timer);
    var d=await r.json();
    el.textContent='Keeper '+(d.version||'OK');
    el.style.color='var(--green)';
  }catch(e){
    el.textContent='Keeper离线';
    el.style.color='var(--red)';
  }
}

// ===== WALLET =====
async function connectWallet(){
  var wp=window.okxwallet||window.ethereum;
  if(!wp){
    alert('请安装 OKX Web3 钱包 或 MetaMask');
    window.open('https://www.okx.com/web3','_blank');
    return;
  }
  var btn=document.getElementById('walletBtn');
  btn.textContent='连接中...';btn.disabled=true;
  try{
    _provider=wp;
    var a=await wp.request({method:'eth_requestAccounts'});
    walletAddr=a[0];showWallet();
    loadAxonBalance();
  }catch(e){
    if(e.code===4001){
      // user rejected — silent
    }else{
      alert('连接失败: '+e.message);
    }
  }finally{
    btn.disabled=false;
    if(!walletAddr)btn.textContent='连接钱包';
  }
}

function showWallet(){
  var btn=document.getElementById('walletBtn');
  var dis=document.getElementById('disconnectBtn');
  if(walletAddr){
    var icon=window.okxwallet?'⬡ ':'🦊 ';
    btn.textContent=icon+walletAddr.slice(0,6)+'...'+walletAddr.slice(-4);
    btn.style.borderColor='var(--green)';
    btn.style.color='var(--green)';
    if(dis)dis.style.display='';
    loadAxonBalance();
  }else{
    btn.textContent='连接钱包';
    btn.style.borderColor='';
    btn.style.color='';
    if(dis)dis.style.display='none';
    document.getElementById('balTag').style.display='none';
  }
}

function disconnectWallet(){
  if(!confirm('断开钱包连接？'))return;
  onDisconnect();
}

async function loadAxonBalance(){
  if(!walletAddr)return;
  try{
    var body=JSON.stringify({jsonrpc:'2.0',method:'eth_getBalance',params:[walletAddr,'latest'],id:1});
    var r=await rpcFetch(body);
    var d=await r.json();
    if(d.result){
      var bal=(parseInt(d.result,16)/1e18).toFixed(2);
      document.getElementById('axonBal').textContent=bal;
      document.getElementById('balTag').style.display='';
      document.getElementById('myBal').textContent=bal+' AXON';
    }
  }catch(e){}
}

// ===== SAFE CHAIN SWITCH =====
async function safeChainSwitch(wp,targetHex,chainId){
  if(_switchingChain){
    if(_switchStart && Date.now()-_switchStart>30000){_switchingChain=false;}
    else throw new Error('链切换中，请稍候');
  }
  _switchingChain=true;_switchStart=Date.now();
  try{
    // skip if already on target chain
    var curChain=await wp.request({method:'eth_chainId'});
    var curDec=parseInt(curChain,16);
    var targetDec=parseInt(targetHex,16);
    if(curDec===targetDec){return;} // already there
    try{
      await wp.request({method:'wallet_switchEthereumChain',params:[{chainId:targetHex}]});
    }catch(sw){
      if(sw.code===4902||sw.code===-32603){
        var cfg=chainId===8210?AXON_CHAIN:(CHAIN_CFG[chainId]||null);
        if(!cfg)throw new Error('不支持的链: '+chainId);
        try{
          await wp.request({method:'wallet_addEthereumChain',params:[cfg]});
        }catch(addErr){
          if(addErr.code===4001)throw new Error('用户拒绝添加网络');
          throw addErr;
        }
      }else if(sw.code===4001){
        throw new Error('用户取消了链切换');
      }else{
        throw sw;
      }
    }
    // verify chain actually switched (with timeout)
    var cur=await Promise.race([
      wp.request({method:'eth_chainId'}),
      new Promise(function(_,rej){setTimeout(function(){rej(new Error('链验证超时'));},8000);})
    ]);
    var curDec=parseInt(cur,16);
    var targetDec=parseInt(targetHex,16);
    if(curDec!==targetDec){
      throw new Error('链切换未生效，当前链: '+cur+'，目标: '+targetHex);
    }
  }finally{
    _switchingChain=false;
  }
}

// ===== DATA LOAD =====
async function loadOrders(){
  var prevMyOrders=myPrevOrders.slice();
  try{
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ctrl.abort();},15000);
    var r=await fetch(KEEPER+'/orders',{signal:ctrl.signal});
    clearTimeout(timer);
    var d=await r.json();
    orders=(d.orders||d).slice();
  }catch(e){
    // keep old orders on fetch fail
    if(!orders.length)orders=[];
  }

  var otcData=null;
  try{
    var ctrl2=new AbortController();
    var timer2=setTimeout(function(){ctrl2.abort();},10000);
    var r2=await fetch('https://ai-colony.top/explorer/otc.json?t='+Date.now(),{signal:ctrl2.signal});
    clearTimeout(timer2);
    otcData=await r2.json();
    trades=(otcData.otc_recent_trades||[]).filter(function(t){return (t.total||0)>=1;});
    trades.sort(function(a,b){return b.id-a.id;});
    orderTimes=otcData.otc_order_times||{};
  }catch(e){}

  orders.sort(function(a,b){return a.price-b.price;});
  var totalAxon=0;
  orders.forEach(function(o){totalAxon+=(o.amount||0);});
  diffText(document.getElementById('sActive'),String(orders.length));
  diffText(document.getElementById('sDepth'),totalAxon.toFixed(0));
  if(orders.length>0) diffText(document.getElementById('sFloor'),'$'+orders[0].price.toFixed(3));
  if(otcData){
    if(otcData.otc_last_price) diffText(document.getElementById('sLast'),'$'+otcData.otc_last_price.toFixed(3));
    diffText(document.getElementById('sVol'),'$'+(otcData.otc_completed_volume_usd||0).toFixed(0));
    diffText(document.getElementById('sTrades'),String(otcData.otc_completed_count||0));
  }
  document.getElementById('updTime').textContent='更新 '+new Date().toLocaleTimeString('zh-CN');

  renderOrders();
  renderTrades();
  renderSideTrades();
  drawCharts();
  updateSellMarketInfo();
  // auto-refresh my orders if that tab is active
  if(document.getElementById('tabMyorders')&&document.getElementById('tabMyorders').style.display!=='none'){
    loadMyOrders();
  }

  if(alertEnabled&&orders.length>0&&orders[0].price<=alertPrice){
    notify('OTC价格提醒','最低价 $'+orders[0].price.toFixed(3)+' 已低于 $'+alertPrice);
  }

  if(tradeAlertEnabled&&walletAddr){
    myPrevOrders=orders.filter(function(o){return o.seller&&o.seller.toLowerCase()===walletAddr.toLowerCase();}).map(function(o){return o.id;});
    prevMyOrders.forEach(function(id){
      if(myPrevOrders.indexOf(id)<0){
        notify('OTC成交通知','你的订单 #'+id+' 已成交!');
      }
    });
  }
}

function notify(title,body){
  if(!('Notification' in window))return;
  if(Notification.permission==='granted'){
    new Notification(title,{body:body,icon:'/otc/favicon.png'});
  }
}

// ===== AUTO UPDATE =====
var _curVer=null;
(function autoUpdate(){
  var check=async function(){
    try{
      var r=await fetch('https://ai-colony.top/otc/version.json?t='+Date.now());
      var d=await r.json();
      if(!_curVer){_curVer=d.v;return;}
      if(d.v!==_curVer){
        _curVer=d.v;
        location.reload();
      }
    }catch(e){}
  };
  check();
  setInterval(check,30000);
})();
