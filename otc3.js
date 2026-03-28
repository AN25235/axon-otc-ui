/* otc3.js — Part 3: Buy, Sell, MyOrders, Notify, Tabs — Safety Hardened */

// ===== TAB =====
function switchTab(t,btn){
  document.querySelectorAll('.tab').forEach(function(el){el.classList.remove('active');});
  if(btn)btn.classList.add('active');
  ['Buy','Sell','Myorders','History','Notify'].forEach(function(n){
    var el=document.getElementById('tab'+n);
    if(el)el.style.display=n.toLowerCase()===t?'block':'none';
  });
  if(t==='myorders')loadMyOrders();
}

// ===== BUY =====
async function buyOrder(orderId){
  var statusEl=document.getElementById('buyStatus');
  statusEl.className='status';statusEl.style.display='none';
  var btn=document.getElementById('buyConfirmBtn');
  btn.disabled=false;btn.textContent='确认购买';
  try{
    var ctrl=new AbortController();
    var timer=setTimeout(function(){ctrl.abort();},10000);
    var r=await fetch(KEEPER+'/order/'+orderId,{signal:ctrl.signal});
    clearTimeout(timer);
    var o=await r.json();
    if(o.status&&o.status!=='Active'&&o.status!=='CancelPending'){
      alert('订单状态: '+o.status+'，无法购买');return;
    }
    pendingOrder=o;
    var pmt=o.payment||{};
    var totalVal=parseFloat(pmt.amount||o.total)||0;
    document.getElementById('buyInfo').innerHTML=''
      +'<div><span class="label">订单号</span><span class="val">#'+o.id+'</span></div>'
      +'<div><span class="label">数量</span><span class="val">'+(parseFloat(o.amount)||0).toFixed(2)+' AXON</span></div>'
      +'<div><span class="label">单价</span><span class="val" style="color:var(--cyan)">$'+(o.price||0).toFixed(4)+'</span></div>'
      +'<div><span class="label">总价</span><span class="val" style="color:var(--yellow)">'+totalVal.toFixed(4)+' '+(pmt.token||'USDT')+'</span></div>'
      +'<div><span class="label">付款链</span><span class="val">'+(pmt.chain_name||CHAIN_NAMES[o.chain_id]||'BSC')+'</span></div>'
      +'<div><span class="label">付款地址</span><span class="val" style="font-size:9px;word-break:break-all">'+(pmt.address||o.payment_address||'')+'</span></div>';
    document.getElementById('buyChainName').textContent=pmt.chain_name||CHAIN_NAMES[o.chain_id]||'BSC';
    document.getElementById('buyTokenName').textContent=pmt.token||o.token||'USDT';
    document.getElementById('buyModal').classList.add('show');
  }catch(e){
    if(e.name==='AbortError')alert('请求超时，请重试');
    else alert('获取失败: '+e.message);
  }
}
function closeBuyModal(){document.getElementById('buyModal').classList.remove('show');pendingOrder=null;_buying=false;}

async function executeBuy(){
  if(!pendingOrder)return;
  if(_buying){return;} // prevent double click
  _buying=true;
  var o=pendingOrder;
  var pmt=o.payment||{};
  var statusEl=document.getElementById('buyStatus');
  var btn=document.getElementById('buyConfirmBtn');
  var wp=getProvider();
  if(!wp){alert('请安装钱包');_buying=false;return;}

  // self-buy check
  if(walletAddr&&o.seller&&walletAddr.toLowerCase()===o.seller.toLowerCase()){
    alert('不能购买自己的订单');_buying=false;return;
  }

  var totalVal=parseFloat(pmt.amount||o.total)||0;
  var tokenName=pmt.token||o.token||'USDT';
  var chainId=pmt.chain_id||o.chain_id||56;

  // amount sanity check
  if(totalVal<=0){alert('订单金额异常');_buying=false;return;}
  if(totalVal>10000){
    if(!confirm('⚠️ 大额交易警告\n\n付款金额: '+totalVal.toFixed(2)+' '+tokenName+'\n\n确认继续？')){
      _buying=false;return;
    }
  }

  btn.disabled=true;btn.textContent='处理中...';
  try{
    // connect wallet if needed
    if(!walletAddr){
      var a=await wp.request({method:'eth_requestAccounts'});
      walletAddr=a[0];_provider=wp;showWallet();
    }

    // switch chain with safety verification
    var targetHex=CHAIN_HEX[chainId];
    if(!targetHex){alert('不支持的链: '+chainId);throw new Error('unsupported chain');}
    statusEl.className='status show pending';
    statusEl.textContent='切换到 '+(CHAIN_NAMES[chainId]||chainId)+'...';
    await safeChainSwitch(wp,targetHex,chainId);

    // verify payment address is valid
    var payAddr=pmt.address||o.payment_address;
    if(!payAddr||!/^0x[0-9a-fA-F]{40}$/.test(payAddr)){
      throw new Error('付款地址无效: '+(payAddr||'空'));
    }

    // verify token contract address
    var tokenAddr=pmt.token_address||(TOKENS[chainId]||{})[tokenName];
    if(!tokenAddr||!/^0x[0-9a-fA-F]{40}$/.test(tokenAddr)){
      throw new Error('Token合约地址无效');
    }

    statusEl.textContent='发送 '+totalVal.toFixed(4)+' '+tokenName+'...';

    var decimals=pmt.decimals||((TOKEN_DECIMALS[chainId]||{})[tokenName])||18;
    // safe BigInt conversion — avoid floating point issues
    var amtStr=totalVal.toFixed(decimals);
    var parts=amtStr.split('.');
    var whole=parts[0]||'0';
    var frac=(parts[1]||'').padEnd(decimals,'0').slice(0,decimals);
    var rawStr=whole+frac;
    // remove leading zeros but keep at least '0'
    rawStr=rawStr.replace(/^0+/,'')||'0';
    var rawAmount=BigInt(rawStr);

    if(rawAmount<=BigInt(0)){throw new Error('计算金额为0，请检查订单');}

    var toHex=payAddr.replace('0x','').toLowerCase().padStart(64,'0');
    var amtHex=rawAmount.toString(16).padStart(64,'0');
    var txData='0xa9059cbb'+toHex+amtHex;

    // send transaction
    var txHash=await wp.request({method:'eth_sendTransaction',params:[{from:walletAddr,to:tokenAddr,data:txData,value:'0x0'}]});

    var exp=EXPLORER[chainId]||'https://bscscan.com/tx/';
    statusEl.className='status show ok';
    statusEl.innerHTML='✅ 发送成功! <a href="'+exp+txHash+'" target="_blank" style="color:var(--green)">查看交易</a><br>Keeper 30-60秒自动放币';
    btn.textContent='已发送';

    // save buy record
    try{
      var buys=JSON.parse(localStorage.getItem('otc_my_buys')||'[]');
      buys.push({id:o.id,amount:o.amount,price:o.price,total:totalVal,token:tokenName,chain_id:chainId,seller:o.seller,buyer:walletAddr,txHash:txHash,status:'Completed',time:new Date().toISOString()});
      localStorage.setItem('otc_my_buys',JSON.stringify(buys));
    }catch(e){}

    // auto refresh after 30s
    setTimeout(loadOrders,30000);
  }catch(e){
    statusEl.className='status show err';
    var msg=e.message||'交易失败';
    if(e.code===4001)msg='用户取消了交易';
    else if(e.code===-32603)msg='交易执行失败，请检查余额和授权';
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
    if(!walletAddr){el.innerHTML='<div class="loading">请先连接钱包</div>';return;}
  }
  document.getElementById('myAddr').textContent=walletAddr.slice(0,8)+'...'+walletAddr.slice(-6);
  el.innerHTML='<div class="loading">加载中...</div>';
  myAllOrders=[];
  var seen={};
  var addr=walletAddr.toLowerCase();

  try{
    var r2=await fetch(KEEPER+'/orders');
    var d2=await r2.json();
    (d2.orders||d2).forEach(function(o){
      if(!seen[o.id]){
        seen[o.id]=1;
        if(o.seller&&o.seller.toLowerCase()===addr){
          o.status='Active';o.role='sell';myAllOrders.push(o);
        }
      }
    });
  }catch(e){}

  try{
    var r=await fetch('/explorer/otc.json?t='+Date.now());
    var otc=await r.json();
    var all=(otc.otc_active_orders||[]).concat(otc.otc_recent_trades||[]);
    all.forEach(function(o){
      if(!seen[o.id]){
        seen[o.id]=1;
        if(o.seller&&o.seller.toLowerCase()===addr){o.role='sell';myAllOrders.push(o);}
        if(o.buyer&&o.buyer.toLowerCase()===addr){o.role='buy';o.status=o.status||'Completed';myAllOrders.push(o);}
      }else{
        if(o.buyer&&o.buyer.toLowerCase()===addr&&!myAllOrders.some(function(m){return m.id===o.id&&m.role==='buy';})){
          var copy=JSON.parse(JSON.stringify(o));
          copy.role='buy';copy.status=copy.status||'Completed';
          myAllOrders.push(copy);
        }
      }
    });
  }catch(e){}

  try{
    var local=JSON.parse(localStorage.getItem('otc_my_buys')||'[]');
    local.forEach(function(o){
      if(!myAllOrders.some(function(m){return m.id===o.id&&m.role==='buy';})){
        o.role='buy';o.status=o.status||'Completed';myAllOrders.push(o);
      }
    });
  }catch(e){}

  myAllOrders.sort(function(a,b){return b.id-a.id;});
  renderMyOrders();
}

function renderMyOrders(){
  var el=document.getElementById('myOrderList');
  var statsEl=document.getElementById('myStats');
  if(!myAllOrders.length){el.innerHTML='<div class="loading">暂无订单</div>';statsEl.innerHTML='';return;}

  var countActive=0,countSold=0,countBought=0,countCancel=0,volSold=0,volBought=0;
  myAllOrders.forEach(function(o){
    if(o.role==='sell'&&o.status==='Active')countActive++;
    else if(o.role==='sell'&&o.status==='Completed'){countSold++;volSold+=(o.total||0);}
    else if(o.role==='buy'){countBought++;volBought+=(o.total||0);}
    else if(o.status==='Cancelled'||o.status==='CancelPending')countCancel++;
  });
  statsEl.innerHTML=''
    +'<div class="ms-item"><span class="ms-label">挂单中</span><span class="ms-val" style="color:var(--cyan)">'+countActive+'</span></div>'
    +'<div class="ms-item"><span class="ms-label">已卖出</span><span class="ms-val" style="color:var(--red)">'+countSold+'</span><span class="dim" style="font-size:10px">$'+volSold.toFixed(2)+'</span></div>'
    +'<div class="ms-item"><span class="ms-label">已买入</span><span class="ms-val" style="color:var(--green)">'+countBought+'</span><span class="dim" style="font-size:10px">$'+volBought.toFixed(2)+'</span></div>'
    +'<div class="ms-item"><span class="ms-label">已取消</span><span class="ms-val" style="color:var(--dim)">'+countCancel+'</span></div>';

  var filtered=myAllOrders.filter(function(o){
    if(myCurrentFilter==='all')return true;
    if(myCurrentFilter==='active')return o.role==='sell'&&(o.status==='Active'||o.status==='CancelPending');
    if(myCurrentFilter==='sold')return o.role==='sell'&&o.status==='Completed';
    if(myCurrentFilter==='bought')return o.role==='buy';
    if(myCurrentFilter==='cancelled')return o.status==='Cancelled';
    return true;
  });

  if(!filtered.length){el.innerHTML='<div class="loading">无匹配记录</div>';return;}

  var SC={Active:'var(--green)',Completed:'var(--blue)',CancelPending:'var(--yellow)',Cancelled:'var(--dim)',Disputed:'var(--red)'};
  var SN={Active:'挂单中',Completed:'已成交',CancelPending:'取消中',Cancelled:'已取消',Disputed:'争议中'};
  var h='';
  filtered.forEach(function(o){
    var st=o.status||'Active';
    var sc=SC[st]||'var(--dim)';
    var sn=SN[st]||st;
    var typeClass=o.role==='buy'?'type-buy':'type-sell';
    var typeText=o.role==='buy'?'买入':'卖出';
    var btn='';
    if(o.role==='sell'&&st==='Active')btn='<button onclick="event.stopPropagation();requestCancel('+o.id+')" style="padding:4px 10px;border-radius:6px;border:1px solid var(--red);background:transparent;color:var(--red);font-size:10px;cursor:pointer;font-weight:600">取消</button>';
    else if(st==='CancelPending')btn='<span style="font-size:10px;color:var(--yellow)">冷却中</span>';
    else if(st==='Disputed')btn='<span style="font-size:10px;color:var(--red)">争议中</span>';
    else btn='—';
    h+='<div class="order row-my" onclick="showDetail('+o.id+')">'
      +'<span class="id">#'+o.id+'</span>'
      +'<span class="'+typeClass+'">'+typeText+'</span>'
      +'<span class="amount">'+(parseFloat(o.amount)||0).toFixed(2)+'</span>'
      +'<span class="price">$'+(o.price||0).toFixed(3)+'</span>'
      +'<span class="total">$'+(o.total||0).toFixed(2)+'</span>'
      +'<span style="font-size:11px;font-weight:600;color:'+sc+'">'+sn+'</span>'
      +'<span>'+btn+'</span>'
      +'</div>';
  });
  el.innerHTML=h;
}

function requestCancel(id){
  if(!confirm('取消订单 #'+id+'？\n\n⚠️ 注意：\n• 冷却期15分钟，期间买方仍可购买\n• 冷却期后需执行finalize取回AXON\n• 系统每分钟自动检测finalize'))return;
  var cmd='# 取消卖单 #'+id+'\n'
    +'from web3 import Web3\nimport eth_abi, os\n\n'
    +'w3 = Web3(Web3.HTTPProvider("https://mainnet-rpc.axonchain.ai/"))\n'
    +'acct = w3.eth.account.from_key(os.environ["AXON_PRIVATE_KEY"])\n'
    +'OTC = "0x10063340374db851e2628D06F4732d5FF814eB34"\n\n'
    +'# Step 1: requestCancelOrder\n'
    +'sel = bytes.fromhex("0fb05223")  # requestCancelOrder(uint256)\n'
    +'data = sel + eth_abi.encode(["uint256"],['+id+'])\n'
    +'nonce = w3.eth.get_transaction_count(acct.address)\n'
    +'tx = w3.eth.account.sign_transaction({"from":acct.address,"to":OTC,"data":"0x"+data.hex(),\n'
    +'    "value":0,"gas":120000,"gasPrice":w3.eth.gas_price,"nonce":nonce,"chainId":8210},acct.key)\n'
    +'h = w3.eth.send_raw_transaction(tx.raw_transaction)\n'
    +'r = w3.eth.wait_for_transaction_receipt(h,timeout=60)\n'
    +'print(f"requestCancel TX: {h.hex()} status={r[\'status\']}")\n';
  var t=window.open('','_blank');
  if(t){
    t.document.write('<pre style="background:#020408;color:#00e676;padding:20px;font-size:12px;font-family:monospace">'+cmd+'</pre>');
  }else{
    // popup blocked, copy to clipboard
    navigator.clipboard.writeText(cmd).then(function(){alert('命令已复制到剪贴板');});
  }
}

// ===== ONE-CLICK SELL =====
async function executeSell(){
  if(_selling)return;
  _selling=true;
  var wp=getProvider();
  if(!wp){alert('请安装 OKX Web3 钱包 或 MetaMask');_selling=false;return;}
  var amount=parseFloat(document.getElementById('sellAmount').value)||0;
  var price=parseFloat(document.getElementById('sellPrice').value)||0;
  var chain=parseInt(document.getElementById('sellChain').value)||56;
  var token=document.getElementById('sellToken').value;

  // validation
  if(amount<=0||price<=0){alert('请填写正确的数量和价格');_selling=false;return;}
  if(amount>5000){
    if(!confirm('⚠️ 挂单数量 '+amount+' AXON 较大，确认继续？')){_selling=false;return;}
  }
  var warn=document.getElementById('priceWarn');
  if(warn&&(warn.className.indexOf('danger')>=0)){alert('请先修正价格问题');_selling=false;return;}

  var btn=document.getElementById('sellBtn');
  var statusEl=document.getElementById('sellStatus');
  btn.disabled=true;btn.textContent='处理中...';
  statusEl.className='status show pending';statusEl.textContent='连接钱包...';
  try{
    if(!walletAddr){
      var a=await wp.request({method:'eth_requestAccounts'});
      walletAddr=a[0];_provider=wp;showWallet();
    }
    // switch to Axon
    statusEl.textContent='切换到 Axon 链...';
    await safeChainSwitch(wp,'0x2012',8210);

    // check balance before sending
    statusEl.textContent='检查余额...';
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

    statusEl.textContent='签名挂单交易...';
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
      +aHex
      +'0000000000000000000000000000000000000000000000000000000000000080'
      +tokenLen
      +tokenHex;

    var txHash=await wp.request({method:'eth_sendTransaction',params:[{
      from:walletAddr,
      to:OTC,
      data:txData,
      value:amountWei,
      chainId:'0x2012'
    }]});
    statusEl.className='status show ok';
    statusEl.innerHTML='✅ 挂单成功! <a href="https://axon-explorer.axonchain.ai/tx/'+txHash+'" target="_blank" style="color:var(--green)">查看交易</a><br>等待Keeper上架，约30秒后刷新可见';
    btn.textContent='⬡ 一键挂单';btn.disabled=false;
    setTimeout(loadOrders,30000);
  }catch(e){
    statusEl.className='status show err';
    var msg=e.message||'交易失败';
    if(e.code===4001)msg='用户取消了操作';
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
