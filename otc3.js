/* otc3.js — Part 3: Buy, Sell, MyOrders, Notify, Tabs — Safety Hardened */

// ===== BUY SUCCESS TOAST =====
function showBuySuccess(o, txHash, exp, totalVal, tokenName){
  var toast=document.createElement('div');
  toast.className='buy-toast';
  toast.innerHTML='<div class="bt-icon">✅</div>'
    +'<div class="bt-body">'
    +'<div class="bt-title">付款已发送！</div>'
    +'<div class="bt-info">订单 #'+o.id+' · '+(o.amount||0)+' AXON · '+totalVal.toFixed(2)+' '+tokenName+'</div>'
    +'<div class="bt-info">⏱️ Keeper将在30-60秒内释放AXON到你的钱包</div>'
    +'<a href="'+exp+txHash+'" target="_blank" class="bt-link">查看交易 ↗</a>'
    +'</div>'
    +'<button class="bt-close" onclick="this.parentElement.remove()">✕</button>';
  document.body.appendChild(toast);
  setTimeout(function(){toast.classList.add('show');},10);
  setTimeout(function(){toast.classList.remove('show');setTimeout(function(){toast.remove();},400);},15000);
}

// ===== TAB =====
function switchTab(t,btn){
  document.querySelectorAll('.tab').forEach(function(el){el.classList.remove('active');});
  if(btn)btn.classList.add('active');
  ['Buy','Sell','Myorders','History','Notify'].forEach(function(n){
    var el=document.getElementById('tab'+n);
    if(el)el.style.display=n.toLowerCase()===t?'block':'none';
  });
  if(t==='myorders')loadMyOrders();
  if(t==='sell')updateSellMarketInfo();
}

// ===== BUY =====
async function buyOrder(orderId){
  var statusEl=document.getElementById('buyStatus');
  statusEl.className='status';statusEl.style.display='none';
  var btn=document.getElementById('buyConfirmBtn');
  btn.disabled=false;btn.textContent='确认购买';

  // ALWAYS fetch fresh order data from Keeper before showing buy modal
  var o=null;
  try{
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ctrl.abort();},8000);
    var r=await fetch(KEEPER+'/orders',{signal:ctrl.signal});
    clearTimeout(timer);
    var d=await r.json();
    var fresh=(d.orders||d);
    for(var i=0;i<fresh.length;i++){if(fresh[i].id===orderId){o=fresh[i];break;}}
    if(!o){alert('订单 #'+orderId+' 已成交或已取消，请刷新页面');loadOrders();return;}
  }catch(e){}

  // Fallback to cached only if Keeper is down (but never use cached payment_address)
  var fromCache=false;
  if(!o){
    for(var i=0;i<orders.length;i++){if(orders[i].id===orderId){o=orders[i];fromCache=true;break;}}
    if(!o){alert('订单不存在或已成交，请刷新');return;}
  }

  // CRITICAL: payment_address must come from fresh Keeper data, never cache
  var payAddr=o.payment_address||'';
  if(fromCache||!payAddr){
    alert('⚠️ 无法获取最新付款地址，请刷新页面后重试');
    loadOrders();return;
  }

  // Build payment info — payAddr already validated above
  var chainId=o.chain_id||56;
  var tokenName=o.token||'USDT';
  var totalVal=parseFloat(o.total)||(o.amount*o.price);
  pendingOrder={
    id:o.id, amount:o.amount, price:o.price, total:totalVal,
    seller:o.seller, chain_id:chainId, token:tokenName,
    payment:{
      address:payAddr,
      amount:totalVal.toFixed(4),
      token:tokenName,
      token_address:(TOKENS[chainId]||{})[tokenName]||'',
      chain_id:chainId,
      chain_name:CHAIN_NAMES[chainId]||'BSC',
      decimals:((TOKEN_DECIMALS[chainId]||{})[tokenName])||18
    }
  };
  document.getElementById('buyInfo').innerHTML=''
    +'<div><span class="label">订单号</span><span class="val">#'+o.id+'</span></div>'
    +'<div><span class="label">数量</span><span class="val">'+parseFloat(o.amount).toFixed(2)+' AXON</span></div>'
    +'<div><span class="label">单价</span><span class="val" style="color:var(--cyan)">$'+(o.price||0).toFixed(4)+'</span></div>'
    +'<div><span class="label">总价</span><span class="val" style="color:var(--yellow)">'+totalVal.toFixed(4)+' '+tokenName+'</span></div>'
    +'<div><span class="label">付款链</span><span class="val">'+(CHAIN_NAMES[chainId]||'BSC')+'</span></div>'
    +'<div><span class="label">付款地址</span><span class="val" style="font-size:11px;word-break:break-all">'+esc(payAddr)+'</span></div>';
  document.getElementById('buyChainName').textContent=CHAIN_NAMES[chainId]||'BSC';
  document.getElementById('buyTokenName').textContent=tokenName;
  document.getElementById('buyModal').classList.add('show');
}
function closeBuyModal(){document.getElementById('buyModal').classList.remove('show');pendingOrder=null;_buying=false;}

async function executeBuy(){
  if(!pendingOrder)return;
  if(_buying){
    // safety: if stuck for >60s, force unlock
    if(_buyStart && Date.now()-_buyStart>60000){_buying=false;}
    else{
      var statusEl2=document.getElementById('buyStatus');
      statusEl2.className='status show pending';statusEl2.textContent='⏳ 上笔交易仍在处理中，请稍候...';
      return;
    }
  }
  _buying=true;_buyStart=Date.now();
  var o=pendingOrder;
  var pmt=o.payment||{};
  var statusEl=document.getElementById('buyStatus');
  var btn=document.getElementById('buyConfirmBtn');
  var wp=getProvider();
  if(!wp){alert('⬡ 请先安装 MetaMask 或 OKX Web3 钱包');_buying=false;return;}

  // self-buy check
  if(walletAddr&&o.seller&&walletAddr.toLowerCase()===o.seller.toLowerCase()){
    alert('⚠️ 不能购买自己挂的订单');_buying=false;return;
  }

  var totalVal=parseFloat(pmt.amount||o.total)||0;
  var tokenName=pmt.token||o.token||'USDT';
  var chainId=pmt.chain_id||o.chain_id||56;

  // amount sanity check
  if(totalVal<=0){alert('⚠️ 订单金额异常，请刷新重试');_buying=false;return;}
  if(totalVal>10000){
    if(!confirm('⚠️ 大额交易警告\n\n付款金额: '+totalVal.toFixed(2)+' '+tokenName+'\n\n确认继续？')){
      _buying=false;return;
    }
  }

  btn.disabled=true;btn.textContent='处理中...';
  try{
    // connect wallet if needed
    if(!walletAddr){
      statusEl.className='status show pending';
      statusEl.textContent='🔌 连接钱包...';
      var a=await wp.request({method:'eth_requestAccounts'});
      walletAddr=a[0];_provider=wp;showWallet();
    }
    wp=getProvider(); // refresh provider reference

    // switch chain with safety verification
    var targetHex=CHAIN_HEX[chainId];
    if(!targetHex){alert('不支持的链: '+chainId);throw new Error('unsupported chain');}
    statusEl.className='status show pending';
    statusEl.textContent='🔗 切换到 '+(CHAIN_NAMES[chainId]||chainId)+' 网络...';
    await safeChainSwitch(wp,targetHex,chainId);

    // CRITICAL: re-fetch fresh payment address from Keeper right before sending
    statusEl.className='status show pending';
    statusEl.textContent='🔒 验证付款地址...';
    var freshAddr=null;
    try{
      var rc=new AbortController();
      var rt=setTimeout(function(){rc.abort();},8000);
      var rr=await fetch(KEEPER+'/orders',{signal:rc.signal});
      clearTimeout(rt);
      var rd=await rr.json();
      var fo=(rd.orders||rd);
      for(var fi=0;fi<fo.length;fi++){
        if(fo[fi].id===o.id){freshAddr=fo[fi].payment_address;break;}
      }
    }catch(e){}
    if(!freshAddr){
      throw new Error('无法验证付款地址，订单可能已成交，请刷新');
    }
    var payAddr=freshAddr;
    if(!/^0x[0-9a-fA-F]{40}$/.test(payAddr)){
      throw new Error('付款地址无效: '+(payAddr||'空'));
    }

    // verify token contract address
    // ALWAYS use local hardcoded token contract — NEVER trust Keeper
    var tokenAddr=(TOKENS[chainId]||{})[tokenName];
    if(!tokenAddr||!/^0x[0-9a-fA-F]{40}$/.test(tokenAddr)){
      throw new Error('Token合约地址无效');
    }

    statusEl.textContent='📤 发送 '+totalVal.toFixed(4)+' '+tokenName+'...';

    var decimals=pmt.decimals||((TOKEN_DECIMALS[chainId]||{})[tokenName])||18;
    // safe BigInt conversion — avoid floating point issues
    var amtStr=totalVal.toFixed(decimals);
    var parts=amtStr.split('.');
    var whole=parts[0]||'0';
    var frac=(parts[1]||'').padEnd(decimals,'0').slice(0,decimals);
    var rawStr=whole+frac;
    rawStr=rawStr.replace(/^0+/,'')||'0';
    var rawAmount=BigInt(rawStr);

    if(rawAmount<=BigInt(0)){throw new Error('计算金额为0，请检查订单');}

    var toHex=payAddr.replace('0x','').toLowerCase().padStart(64,'0');
    var amtHex=rawAmount.toString(16).padStart(64,'0');
    var txData='0xa9059cbb'+toHex+amtHex;

    // verify order still active (best-effort, non-blocking)
    statusEl.textContent='⏳ 准备交易...';
    var orderCheck=await Promise.race([
      fetch(KEEPER+'/order/'+o.id).then(function(r){return r.json();}).catch(function(){return null;}),
      new Promise(function(r){setTimeout(function(){r(null);},3000);})
    ]);
    // check if order was taken
    if(orderCheck&&orderCheck.status&&orderCheck.status!=='Active'&&orderCheck.status!=='CancelPending'){
      throw new Error('订单已'+orderCheck.status+'，请刷新页面');
    }

    statusEl.textContent='✍️ 请在钱包中确认...';
    var txHash=await wp.request({method:'eth_sendTransaction',params:[{from:walletAddr,to:tokenAddr,data:txData,value:'0x0'}]});

    var exp=EXPLORER[chainId]||'https://bscscan.com/tx/';
    // Close modal and show success via notice
    document.getElementById('buyModal').classList.remove('show');
    pendingOrder=null;
    showBuySuccess(o, txHash, exp, totalVal, tokenName);

    // save buy record
    try{
      var buys=JSON.parse(localStorage.getItem('otc_my_buys')||'[]');
      buys.push({id:o.id,amount:o.amount,price:o.price,total:totalVal,token:tokenName,chain_id:chainId,seller:o.seller,buyer:walletAddr,txHash:txHash,status:'Completed',time:new Date().toISOString()});
      localStorage.setItem('otc_my_buys',JSON.stringify(buys));
    }catch(e){}

        // refresh: immediate for my orders, 15s for order list (wait for Keeper)
    loadMyOrders();
    setTimeout(loadOrders,15000);
    setTimeout(loadOrders,30000);
  }catch(e){
    statusEl.className='status show err';
    var msg=e.message||'交易失败';
    if(e.code===4001)msg='🚫 已取消交易';
    else if(e.code===-32603)msg='❌ 交易执行失败，请检查余额和Token授权';
    else if(e.code===-32000||msg.indexOf('nonce')>=0)msg='🔄 Nonce冲突 — 请在钱包"设置→高级→重置账户"清除缓存后重试';
    console.error('executeBuy error:',e);
    statusEl.textContent=msg;
    btn.disabled=false;btn.textContent='确认购买';
  }finally{
    _buying=false;
  }
}

// ===== MY ORDERS =====
var myAllOrders=[];
var myCurrentFilter='all';

function switchMyTab(filter,btn){
  myCurrentFilter=filter;
  document.querySelectorAll('.my-tab').forEach(function(el){el.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderMyOrders();
}

async function loadMyOrders(){
  var el=document.getElementById('myOrderList');
  if(!walletAddr){
    if(getProvider()){try{var a=await getProvider().request({method:'eth_requestAccounts'});walletAddr=a[0];showWallet();}catch(e){}}
    if(!walletAddr){diffUpdate(el,'<div class="loading">请先连接钱包</div>');return;}
  }
  diffText(document.getElementById('myAddr'),walletAddr.slice(0,8)+'...'+walletAddr.slice(-6));
  // 首次加载才显示loading，刷新时保持旧数据不闪
  if(!myAllOrders.length) el.innerHTML='<div class="loading">加载中...</div>';
  var newOrders=[];
  var addr=walletAddr.toLowerCase();

  // 1. Active sell orders from Keeper (check real status via /order/:id)
  try{
    var r2=await fetch(KEEPER+'/orders');
    var d2=await r2.json();
    var mySellerOrders=(d2.orders||d2).filter(function(o){return o.seller&&o.seller.toLowerCase()===addr;});
    // Batch check real status for each order
    var detailPromises=mySellerOrders.map(function(o){
      return fetch(KEEPER+'/order/'+o.id).then(function(r){return r.json();}).catch(function(){return null;});
    });
    var details=await Promise.all(detailPromises);
    details.forEach(function(d,i){
      if(!d)return;
      var o=Object.assign({},mySellerOrders[i],d);
      o.role='sell';
      o.status=d.status||'Active';
      // For CancelPending, try to extract cancel_time from detail
      if(o.status==='CancelPending'&&d.cancel_time){
        o.cancel_time=d.cancel_time;
      }
      newOrders.push(o);
    });
  }catch(e){}

  // 2. Completed trades from otc.json — match both seller and buyer
  var seenIds={};
  newOrders.forEach(function(o){seenIds['sell_'+o.id]=1;});
  try{
    var r=await fetch('/explorer/otc.json?t='+Date.now());
    var otc=await r.json();
    var trades=otc.otc_recent_trades||[];
    trades.forEach(function(o){
      // As seller (completed sale)
      if(o.seller&&o.seller.toLowerCase()===addr&&!seenIds['sell_'+o.id]){
        var copy=JSON.parse(JSON.stringify(o));
        copy.role='sell';copy.status=copy.status||'Completed';
        newOrders.push(copy);seenIds['sell_'+o.id]=1;
      }
      // As buyer
      if(o.buyer&&o.buyer.toLowerCase()===addr&&!seenIds['buy_'+o.id]){
        var copy=JSON.parse(JSON.stringify(o));
        copy.role='buy';copy.status=copy.status||'Completed';
        newOrders.push(copy);seenIds['buy_'+o.id]=1;
      }
    });
  }catch(e){}

  // 3. localStorage buy records as fallback (for orders not yet in otc.json)
  try{
    var local=JSON.parse(localStorage.getItem('otc_my_buys')||'[]');
    local.forEach(function(o){
      // Only show records matching current wallet
      if(o.buyer&&o.buyer.toLowerCase()===addr&&!seenIds['buy_'+o.id]){
        o.role='buy';o.status=o.status||'Pending';
        newOrders.push(o);seenIds['buy_'+o.id]=1;
      }
    });
  }catch(e){}

  // 4. Cancelled orders from localStorage
  try{
    var cancelled=JSON.parse(localStorage.getItem('otc_cancelled')||'[]');
    cancelled.forEach(function(c){
      if(!seenIds['sell_'+c.id]){
        newOrders.push({id:c.id,role:'sell',status:'Cancelled',amount:c.amount||0,price:c.price||0,total:c.total||0,time:c.time});
        seenIds['sell_'+c.id]=1;
      }else{
        // Update existing CancelPending → Cancelled if finalized
        newOrders.forEach(function(o){if(o.id===c.id&&o.status==='CancelPending')o.status='Cancelled';});
      }
    });
  }catch(e){}

  newOrders.sort(function(a,b){return b.id-a.id;});
  myAllOrders=newOrders;
  renderMyOrders();
}

function renderMyOrders(){
  var el=document.getElementById('myOrderList');
  var statsEl=document.getElementById('myStats');
  if(!myAllOrders.length){diffUpdate(el,'<div class="loading">暂无订单</div>');diffUpdate(statsEl,'');return;}

  var countActive=0,countSold=0,countBought=0,countCancel=0,volSold=0,volBought=0;
  myAllOrders.forEach(function(o){
    if(o.role==='sell'&&o.status==='Active')countActive++;
    else if(o.role==='sell'&&o.status==='Completed'){countSold++;volSold+=(o.total||0);}
    else if(o.role==='buy'){countBought++;volBought+=(o.total||0);}
    else if(o.status==='Cancelled'||o.status==='CancelPending')countCancel++;
  });
  diffUpdate(statsEl,''
    +'<div class="ms-item"><span class="ms-label">挂单中</span><span class="ms-val" style="color:var(--cyan)">'+countActive+'</span></div>'
    +'<div class="ms-item"><span class="ms-label">已卖出</span><span class="ms-val" style="color:var(--red)">'+countSold+'</span><span class="dim" style="font-size:12px">$'+volSold.toFixed(2)+'</span></div>'
    +'<div class="ms-item"><span class="ms-label">已买入</span><span class="ms-val" style="color:var(--green)">'+countBought+'</span><span class="dim" style="font-size:12px">$'+volBought.toFixed(2)+'</span></div>'
    +'<div class="ms-item"><span class="ms-label">已取消</span><span class="ms-val" style="color:var(--dim)">'+countCancel+'</span></div>');

  var filtered=myAllOrders.filter(function(o){
    if(myCurrentFilter==='all')return true;
    if(myCurrentFilter==='active')return o.role==='sell'&&(o.status==='Active'||o.status==='CancelPending');
    if(myCurrentFilter==='sold')return o.role==='sell'&&o.status==='Completed';
    if(myCurrentFilter==='bought')return o.role==='buy';
    if(myCurrentFilter==='cancelled')return o.status==='Cancelled';
    return true;
  });

  if(!filtered.length){diffUpdate(el,'<div class="loading">无匹配记录</div>');return;}

  var SC={Active:'var(--green)',Completed:'var(--blue)',CancelPending:'var(--yellow)',Cancelled:'var(--dim)',Disputed:'var(--red)'};
  var SN={Active:'挂单中',Completed:'已成交',CancelPending:'取消中',Cancelled:'已取消',Disputed:'争议中'};
  var h='';
  filtered.forEach(function(o){
    var st=o.status||'Active';
    var sc=SC[st]||'var(--dim)';
    var sn=SN[st]||st;
    var typeClass=o.role==='buy'?'type-buy':'type-sell';
    var typeText=o.role==='buy'?'买入':'卖出';
    // Time display based on status
    var ot=orderTimes[String(o.id)]||{};
    var timeStr='';
    if(st==='Active') timeStr=ot.created||o.created_time||'';
    else if(st==='Completed') timeStr=(ot.fulfilled||o.time||'');
    else if(st==='CancelPending') timeStr=(ot.cancel_requested||'');
    else if(st==='Cancelled') timeStr=(ot.cancelled||'');
    if(!timeStr&&o.time) timeStr=o.time;
    var btn='';
    if(o.role==='sell'&&st==='Active')btn='<button onclick="event.stopPropagation();requestCancel('+o.id+')" style="padding:4px 10px;border-radius:6px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:12px;cursor:pointer;font-weight:600">取消</button>';
    else if(st==='CancelPending')btn='<span class="cancel-countdown" data-oid="'+o.id+'" style="font-size:12px;color:var(--yellow)">冷却中</span>';
    else if(st==='Cancelled')btn='<span style="font-size:12px;color:var(--dim)">已退回</span>';
    else if(st==='Disputed')btn='<span style="font-size:12px;color:var(--red)">争议中</span>';
    else btn='—';
    h+='<div class="order row-my" onclick="showDetail('+o.id+')">'
      +'<span class="id">#'+o.id+'</span>'
      +'<span class="'+typeClass+'">'+typeText+'</span>'
      +'<span class="amount">'+(parseFloat(o.amount)||0).toFixed(2)+'</span>'
      +'<span class="price">$'+(o.price||0).toFixed(3)+'</span>'
      +'<span class="total">$'+(o.total||0).toFixed(2)+'</span>'
      +'<span style="font-size:11px;font-weight:600;color:'+sc+'">'+sn+'</span>'
      +'<span class="time-s">'+timeStr+'</span>'
      +'<span>'+btn+'</span>'
      +'</div>';
  });
  diffUpdate(el,h);
}

var _cancelling=false,_cancelStart=0;
async function requestCancel(id){
  if(!confirm('取消订单 #'+id+'？\n\n⚠️ 注意：\n• 冷却期15分钟，期间买方仍可购买\n• 冷却期后系统自动finalize取回AXON'))return;
  if(_cancelling){
    if(_cancelStart&&Date.now()-_cancelStart>60000){_cancelling=false;}
    else{alert('取消操作进行中，请稍候');return;}
  }
  _cancelling=true;_cancelStart=Date.now();

  if(!walletAddr){
    if(getProvider()){try{var a=await getProvider().request({method:'eth_requestAccounts'});walletAddr=a[0];showWallet();}catch(e){}}
    if(!walletAddr){alert('请先连接钱包');_cancelling=false;return;}
  }

  // Switch to Axon chain
  try{await safeChainSwitch(getProvider(),'0x2012',8210);}catch(e){alert('请切换到Axon链');_cancelling=false;return;}

  try{
    // requestCancelOrder(uint256) selector: 0x0fb05223
    var data='0x0fb05223'+id.toString(16).padStart(64,'0');
    var gasPrice;
    try{gasPrice=await getProvider().request({method:'eth_gasPrice'});}catch(e){gasPrice='0x430e2340';}

    var txHash=await getProvider().request({method:'eth_sendTransaction',params:[{
      from:walletAddr,
      to:'0x10063340374db851e2628D06F4732d5FF814eB34',
      data:data,
      value:'0x0',
      gas:'0x1e848',
      gasPrice:gasPrice,
      chainId:'0x2012'
    }]});
    alert('✅ 取消请求已发送!\nTX: '+txHash+'\n\n⏱️ 15分钟冷却倒计时开始\n倒计时结束后请在"我的订单"中点击"取回 AXON"按钮领取退款');
    // Save cancel time to localStorage for countdown
    try{
      var cancels=JSON.parse(localStorage.getItem('otc_cancel_times')||'{}');
      cancels[id]=Date.now();
      localStorage.setItem('otc_cancel_times',JSON.stringify(cancels));
    }catch(e){}
    loadMyOrders();
    startCancelCountdowns();
  }catch(e){
    var msg=e.message||'取消失败';
    if(e.code===4001)msg='已取消操作';
    alert('❌ '+msg);
  }finally{
    _cancelling=false;
  }
}

// ===== CANCEL COUNTDOWN + AUTO FINALIZE =====
var _cancelTimerInterval=null;

function startCancelCountdowns(){
  if(_cancelTimerInterval)clearInterval(_cancelTimerInterval);
  _cancelTimerInterval=setInterval(updateCancelCountdowns,1000);
  updateCancelCountdowns();
}

function updateCancelCountdowns(){
  var cancels={};
  try{cancels=JSON.parse(localStorage.getItem('otc_cancel_times')||'{}');}catch(e){}
  var spans=document.querySelectorAll('.cancel-countdown');
  if(!spans.length){return;}

  var now=Date.now();
  var COOLDOWN=15*60*1000; // 15 min

  spans.forEach(function(span){
    var oid=span.getAttribute('data-oid');
    var cancelTime=cancels[oid];
    if(!cancelTime){
      span.textContent='冷却中';
      span.style.color='var(--yellow)';
      return;
    }
    var elapsed=now-cancelTime;
    var remaining=COOLDOWN-elapsed;

    if(remaining>0){
      var min=Math.floor(remaining/60000);
      var sec=Math.floor((remaining%60000)/1000);
      span.textContent='⏱️ '+min+':'+String(sec).padStart(2,'0');
      span.style.color='var(--yellow)';
    }else{
      // Cooldown expired — show finalize button
      span.innerHTML='<button onclick="event.stopPropagation();doFinalize('+oid+')" style="padding:4px 10px;border-radius:6px;border:1px solid var(--green);background:transparent;color:var(--green);font-size:12px;cursor:pointer;font-weight:600;animation:pulse 1.5s infinite">取回 AXON</button>';
    }
  });
}

var _finalizing=false;
async function doFinalize(id){
  if(_finalizing){return;}
  _finalizing=true;

  if(!walletAddr){
    if(getProvider()){try{var a=await getProvider().request({method:'eth_requestAccounts'});walletAddr=a[0];showWallet();}catch(e){}}
    if(!walletAddr){alert('请先连接钱包');_finalizing=false;return;}
  }

  try{await safeChainSwitch(getProvider(),'0x2012',8210);}catch(e){alert('请切换到Axon链');_finalizing=false;return;}

  try{
    // finalizeCancelOrder(uint256) selector
    var sel='0x24f9d60b';
    var data=sel+id.toString(16).padStart(64,'0');
    var gasPrice;
    try{gasPrice=await getProvider().request({method:'eth_gasPrice'});}catch(e){gasPrice='0x430e2340';}

    var txHash=await getProvider().request({method:'eth_sendTransaction',params:[{
      from:walletAddr,
      to:'0x10063340374db851e2628D06F4732d5FF814eB34',
      data:data,
      value:'0x0',
      gas:'0x30d40',
      gasPrice:gasPrice,
      chainId:'0x2012'
    }]});
    alert('✅ AXON已退回钱包!\nTX: '+txHash);
    // Clean up localStorage
    try{
      var cancels=JSON.parse(localStorage.getItem('otc_cancel_times')||'{}');
      delete cancels[id];
      localStorage.setItem('otc_cancel_times',JSON.stringify(cancels));
      // Record in cancelled list
      var cancelled=JSON.parse(localStorage.getItem('otc_cancelled')||'[]');
      cancelled.push({id:id,time:new Date().toISOString(),txHash:txHash});
      localStorage.setItem('otc_cancelled',JSON.stringify(cancelled));
    }catch(e){}
    loadMyOrders();
    loadOrders();
  }catch(e){
    var msg=e.message||'finalize失败';
    if(e.code===4001)msg='已取消操作';
    if(msg.indexOf('cooldown')>-1||msg.indexOf('not ready')>-1)msg='冷却期未到，请稍后再试';
    alert('❌ '+msg);
  }finally{
    _finalizing=false;
  }
}

// Start countdowns on page load (if my orders tab is shown)
setTimeout(startCancelCountdowns,2000);
async function executeSell(){
  var statusEl=document.getElementById('sellStatus');
  var btn=document.getElementById('sellBtn');
  if(_selling){
    if(_sellStart && Date.now()-_sellStart>60000){_selling=false;}
    else{
      statusEl.className='status show pending';statusEl.textContent='⏳ 上笔交易仍在处理中，请稍候...';
      return;
    }
  }
  _selling=true;_sellStart=Date.now();
  var wp=getProvider();
  if(!wp){alert('请安装 OKX Web3 钱包 或 MetaMask');_selling=false;return;}
  var amount=parseFloat(document.getElementById('sellAmount').value)||0;
  var price=parseFloat(document.getElementById('sellPrice').value)||0;
  var chain=parseInt(document.getElementById('sellChain').value)||56;
  var token=document.getElementById('sellToken').value;

  // validation
  if(amount<=0||price<=0){alert('⚠️ 请填写有效的数量和价格');_selling=false;return;}
  if(amount>5000){
    if(!confirm('⚠️ 挂单数量 '+amount+' AXON 较大，确认继续？')){_selling=false;return;}
  }
  var warn=document.getElementById('priceWarn');
  if(warn&&(warn.className.indexOf('danger')>=0)){alert('⚠️ 请先修正价格警告后再挂单');_selling=false;return;}

  btn.disabled=true;btn.textContent='处理中...';
  statusEl.className='status show pending';statusEl.textContent='🔌 连接钱包...';
  try{
    if(!walletAddr){
      var a=await wp.request({method:'eth_requestAccounts'});
      walletAddr=a[0];_provider=wp;showWallet();
    }
    wp=getProvider(); // refresh provider reference
    // switch to Axon
    statusEl.textContent='🔗 切换到 Axon 主网...';
    await safeChainSwitch(wp,'0x2012',8210);

    // check balance
    statusEl.textContent='💰 检查余额...';
    var balRes=await wp.request({method:'eth_getBalance',params:[walletAddr,'latest']});
    var balAxon=parseInt(balRes,16)/1e18;
    if(balAxon<amount){
      throw new Error('余额不足: '+balAxon.toFixed(2)+' AXON < '+amount+' AXON');
    }

    // confirm
    var total=(amount*price).toFixed(2);
    if(!confirm('确认挂单？\n\n数量: '+amount+' AXON\n单价: $'+price.toFixed(4)+'\n总价: $'+total+' '+token+'\n付款链: '+(CHAIN_NAMES[chain]||chain)+'\n\n挂单后AXON将锁入合约')){
      throw {code:4001,message:'用户取消'};
    }

    statusEl.textContent='⏳ 准备交易...';
    var OTC='0x10063340374db851e2628D06F4732d5FF814eB34';
    var price6=Math.round(price*1e6);
    var amountWei='0x'+BigInt(Math.round(amount*1e18)).toString(16);

    // ABI encode: createSellOrder(uint256 priceUsd, uint256 paymentChainId, address sellerPaymentAddr, string paymentToken)
    var pHex=BigInt(price6).toString(16).padStart(64,'0');
    var cHex=BigInt(chain).toString(16).padStart(64,'0');
    var aHex=walletAddr.replace('0x','').toLowerCase().padStart(64,'0');
    var tokenBytes=[];
    for(var i=0;i<token.length;i++) tokenBytes.push(token.charCodeAt(i).toString(16).padStart(2,'0'));
    var tokenHex=tokenBytes.join('').padEnd(64,'0');
    var tokenLen=BigInt(token.length).toString(16).padStart(64,'0');

    var txData='0x41e113aa'
      +pHex
      +cHex
      +'0000000000000000000000000000000000000000000000000000000000000080'
      +aHex
      +tokenLen
      +tokenHex;

    // fetch gasPrice — try public RPC, fallback to hardcoded
    var gasPrice='0x430e2340'; // ~1.125 Gwei default
    try{
      var gpR=await rpcFetch({jsonrpc:'2.0',method:'eth_gasPrice',params:[],id:1});
      var gpJ=await gpR.json();
      if(gpJ.result)gasPrice=gpJ.result;
    }catch(e){}

    statusEl.textContent='✍️ 请在钱包中确认交易...';
    var txHash=await wp.request({method:'eth_sendTransaction',params:[{
      from:walletAddr,
      to:OTC,
      data:txData,
      value:amountWei,
      gas:'0x493e0',
      gasPrice:gasPrice,
      chainId:'0x2012'
    }]});
    statusEl.className='status show ok';
    statusEl.innerHTML='✅ 挂单成功! <a href="https://axon-explorer.axonchain.ai/tx/'+txHash+'" target="_blank" style="color:var(--green)">查看交易</a><br>⏱️ Keeper将在30秒内上架，届时自动刷新';
    btn.textContent='⬡ 一键挂单';btn.disabled=false;
    loadMyOrders();
    setTimeout(loadOrders,15000);
    setTimeout(loadOrders,30000);
  }catch(e){
    statusEl.className='status show err';
    var msg=e.message||'交易失败';
    if(e.code===4001)msg='🚫 已取消操作';
    else if(e.code===-32000||msg.indexOf('nonce')>=0||msg.indexOf('NONCE')>=0)msg='🔄 Nonce冲突 — 请在钱包"设置→高级→重置账户"清除缓存后重试';
    else if(e.code===-32603)msg='❌ 交易失败，请检查AXON余额是否充足';
    console.error('executeSell error:',e);
    statusEl.textContent=msg;
    btn.textContent='⬡ 一键挂单';btn.disabled=false;
  }finally{
    _selling=false;
  }
}

// ===== SELL CMD =====
function updateSellCmd(){
  var amount=parseFloat(document.getElementById('sellAmount').value)||0;
  var price=parseFloat(document.getElementById('sellPrice').value)||0;
  var chain=parseInt(document.getElementById('sellChain').value)||56;
  var token=document.getElementById('sellToken').value;
  var total=(amount*price).toFixed(2);
  document.getElementById('sellTotal').textContent='$'+total;
  var priceInput=document.getElementById('sellPrice');
  var amountInput=document.getElementById('sellAmount');
  var warn=document.getElementById('priceWarn');
  var floor=orders.length?Math.min.apply(null,orders.map(function(o){return o.price;})):0;
  priceInput.className='';amountInput.className='';
  warn.className='price-warn';warn.textContent='';
  if(price<=0){
    priceInput.className='input-danger';
    warn.className='price-warn danger';warn.textContent='\u26d4 单价不能为0或负数';
  }else if(amount<=0){
    amountInput.className='input-danger';
    warn.className='price-warn danger';warn.textContent='\u26d4 数量不能为0或负数';
  }else if(price>=1.0){
    priceInput.className='input-warn';
    warn.className='price-warn warn';warn.textContent='\u26a0\ufe0f 单价 $'+price.toFixed(3)+' 很高，当前最低 $'+(floor?floor.toFixed(3):'\u2014')+'，确认没输错？';
  }else if(floor>0&&price<floor*0.5){
    priceInput.className='input-warn';
    warn.className='price-warn warn';warn.textContent='\u26a0\ufe0f 单价 $'+price.toFixed(3)+' 不到市场最低 $'+floor.toFixed(3)+' 的一半，确认要亏卖？';
  }else if(floor>0&&price>floor*3){
    priceInput.className='input-warn';
    warn.className='price-warn warn';warn.textContent='\u26a0\ufe0f 单价是最低价的'+Math.round(price/floor)+'倍，可能难成交';
  }else if(amount>1000){
    amountInput.className='input-warn';
    warn.className='price-warn warn';warn.textContent='\u26a0\ufe0f 数量 '+amount+' AXON 较大，请确认余额充足';
  }
  var price6=Math.round(price*1e6);
  var chainName={56:'BSC',42161:'Arbitrum'}[chain]||chain;
  var nl='\n';
  var cmd='# pip install web3 eth-abi'+nl
    +'from web3 import Web3'+nl+'import eth_abi, os'+nl+nl
    +'w3 = Web3(Web3.HTTPProvider("https://mainnet-rpc.axonchain.ai/"))'+nl
    +'acct = w3.eth.account.from_key(os.environ["AXON_PRIVATE_KEY"])'+nl
    +'OTC = "0x10063340374db851e2628D06F4732d5FF814eB34"'+nl+nl
    +'AMOUNT = '+amount+'  # AXON'+nl
    +'PRICE  = '+price6+'  # $'+price.toFixed(4)+nl
    +'CHAIN  = '+chain+'  # '+chainName+nl
    +'TOKEN  = "'+token+'"'+nl+nl
    +'sel = bytes.fromhex("41e113aa")'+nl
    +'data = sel + eth_abi.encode(["uint256","uint256","string","address"],'+nl
    +'    [PRICE, CHAIN, TOKEN, acct.address])'+nl+nl
    +'tx_p = {"from":acct.address,"to":OTC,"data":"0x"+data.hex(),'+nl
    +'    "value":int(AMOUNT*1e18),"gas":300000,'+nl
    +'    "gasPrice":w3.eth.gas_price,'+nl
    +'    "nonce":w3.eth.get_transaction_count(acct.address),"chainId":8210}'+nl
    +'tx_p["gas"] = int(w3.eth.estimate_gas(tx_p)*1.3)'+nl
    +'tx = w3.eth.account.sign_transaction(tx_p, acct.key)'+nl
    +'h = w3.eth.send_raw_transaction(tx.raw_transaction)'+nl
    +'r = w3.eth.wait_for_transaction_receipt(h, timeout=60)'+nl
    +'print(f"OK TX:{h.hex()}") if r["status"]==1 else print("FAIL")'+nl
    +'# >>> '+amount+' AXON @ $'+price.toFixed(4)+' = $'+total+' '+token+nl;
  document.getElementById('sellCmdText').textContent=cmd;
}

function toggleBatch(){
  var s=document.getElementById('batchSection');
  s.style.display=s.style.display==='none'?'block':'none';
}

function genBatchCmd(){
  var start=parseFloat(document.getElementById('batchStart').value)||0.10;
  var step=parseFloat(document.getElementById('batchStep').value)||0.01;
  var amt=parseInt(document.getElementById('batchAmount').value)||50;
  var count=parseInt(document.getElementById('batchCount').value)||3;
  if(count>10)count=10;
  var chain=document.getElementById('sellChain').value;
  var token=document.getElementById('sellToken').value;
  var cmd='# 批量挂单: '+count+'档\nfrom web3 import Web3\nimport eth_abi, os, time\n\n'
    +'w3 = Web3(Web3.HTTPProvider("https://mainnet-rpc.axonchain.ai/"))\n'
    +'acct = w3.eth.account.from_key(os.environ["AXON_PRIVATE_KEY"])\n'
    +'OTC = "0x10063340374db851e2628D06F4732d5FF814eB34"\n'
    +'sel = bytes.fromhex("41e113aa")\n'
    +'nonce = w3.eth.get_transaction_count(acct.address)\n\n'
    +'orders = [\n';
  for(var i=0;i<count;i++){
    var p=(start+step*i).toFixed(4);
    cmd+='    ('+amt+', '+p+'),  # $'+(amt*parseFloat(p)).toFixed(2)+' '+token+'\n';
  }
  cmd+=']\n\nfor amount, price in orders:\n'
    +'    data = sel + eth_abi.encode(["uint256","uint256","string","address"],\n'
    +'        [int(price*1e6), '+chain+', "'+token+'", acct.address])\n'
    +'    gas = w3.eth.estimate_gas({"from":acct.address,"to":OTC,"data":data.hex(),"value":int(amount*1e18)})\n'
    +'    tx = w3.eth.account.sign_transaction({"from":acct.address,"to":OTC,"data":data.hex(),\n'
    +'        "value":int(amount*1e18),"gas":int(gas*1.3),"gasPrice":w3.eth.gas_price,\n'
    +'        "nonce":nonce,"chainId":8210}, acct.key)\n'
    +'    h = w3.eth.send_raw_transaction(tx.raw_transaction)\n'
    +'    w3.eth.wait_for_transaction_receipt(h, timeout=60)\n'
    +'    print(f"#{nonce} {amount} AXON @ ${price}")\n'
    +'    nonce += 1\n'
    +'    time.sleep(1)\n';
  document.getElementById('sellCmdText').textContent=cmd;
}

function copyCmd(btn){
  var text=document.getElementById('sellCmdText').textContent;
  navigator.clipboard.writeText(text).then(function(){
    btn.textContent='✅ 已复制';
    setTimeout(function(){btn.textContent='📋 复制';},1500);
  });
}

// ===== NOTIFY =====
function toggleAlert(){
  alertEnabled=!alertEnabled;
  alertPrice=parseFloat(document.getElementById('alertPrice').value)||0;
  var btn=document.getElementById('alertBtn');
  var st=document.getElementById('alertStatus');
  if(alertEnabled){
    if('Notification' in window&&Notification.permission!=='granted'){Notification.requestPermission();}
    btn.textContent='关闭提醒';btn.style.background='var(--red)';
    st.textContent='已开启: 低于 $'+alertPrice.toFixed(3)+' 时通知';
  }else{
    btn.textContent='开启提醒';btn.style.background='var(--green)';
    st.textContent='未开启';
  }
}

function toggleTradeAlert(){
  tradeAlertEnabled=!tradeAlertEnabled;
  var btn=document.getElementById('tradeAlertBtn');
  var st=document.getElementById('tradeAlertStatus');
  if(tradeAlertEnabled){
    if('Notification' in window&&Notification.permission!=='granted'){Notification.requestPermission();}
    myPrevOrders=orders.filter(function(o){return walletAddr&&o.seller&&o.seller.toLowerCase()===walletAddr.toLowerCase();}).map(function(o){return o.id;});
    btn.textContent='关闭通知';btn.style.background='var(--red)';
    st.textContent='已开启 (监控 '+myPrevOrders.length+' 个订单)';
  }else{
    btn.textContent='开启成交通知';btn.style.background='var(--blue)';
    st.textContent='未开启';
  }
}
