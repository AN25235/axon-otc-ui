/* otc2.js — Part 2: Render & Charts */

// ===== RENDER ORDERS =====
function renderOrders(){
  var el=document.getElementById('orderList');
  var sorted=orders.slice();
  var dir=document.getElementById('filterSort').value;
  var maxP=parseFloat(document.getElementById('filterMax').value);
  var minP=parseFloat(document.getElementById('filterMin').value);
  if(!isNaN(maxP))sorted=sorted.filter(function(o){return o.price<=maxP;});
  if(!isNaN(minP))sorted=sorted.filter(function(o){return o.price>=minP;});
  if(dir==='desc')sorted.sort(function(a,b){return b.price-a.price;});
  else if(dir==='amount')sorted.sort(function(a,b){return b.amount-a.amount;});
  else sorted.sort(function(a,b){return a.price-b.price;});

  if(!sorted.length){el.innerHTML='<div class="loading">暂无匹配卖单</div>';return;}
  var h='';
  sorted.forEach(function(o){
    var s=o.seller||'';
    var ss=s?s.slice(0,6)+'...'+s.slice(-4):'';
    h+='<div class="order row-buy" onclick="showDetail('+o.id+')">'
      +'<span class="id">#'+o.id+'</span>'
      +'<span class="amount">'+(parseFloat(o.amount)||0).toFixed(2)+'</span>'
      +'<span class="price">$'+o.price.toFixed(3)+'</span>'
      +'<span class="total">$'+(o.total||o.amount*o.price).toFixed(2)+'</span>'
      +'<span class="chain-tag">'+(o.chain||CHAIN_NAMES[o.chain_id]||'')+'</span>'
      +'<span class="seller-s">'+ss+'</span>'
      +'<span><button class="btn-buy" onclick="event.stopPropagation();buyOrder('+o.id+')">购买</button></span>'
      +'</div>';
  });
  el.innerHTML=h;
}

// ===== RENDER TRADES =====
function renderTrades(){
  var el=document.getElementById('tradeList');
  if(!trades.length){el.innerHTML='<div class="loading">暂无成交记录</div>';return;}
  var h='';
  trades.forEach(function(t){
    var s=t.seller||'';
    var ss=s?s.slice(0,6)+'...'+s.slice(-4):'';
    h+='<div class="order row-buy trade" onclick="showDetail('+t.id+')">'
      +'<span class="id">#'+t.id+'</span>'
      +'<span class="amount">'+(parseFloat(t.amount)||0).toFixed(2)+'</span>'
      +'<span class="price" style="color:var(--green)">$'+t.price.toFixed(3)+'</span>'
      +'<span class="total">$'+(t.total||0).toFixed(2)+'</span>'
      +'<span class="chain-tag">'+(t.chain||'BSC')+'</span>'
      +'<span class="seller-s">'+ss+'</span>'
      +'<span style="font-size:9px;color:var(--dim)">'+(t.time||'')+'</span>'
      +'</div>';
  });
  el.innerHTML=h;
}

function renderSideTrades(){
  var el=document.getElementById('sideTradeList');
  if(!el)return;
  if(!trades.length){el.innerHTML='<div class="loading" style="font-size:10px">暂无成交</div>';return;}
  var h='';
  var show=trades.slice(0,20);
  show.forEach(function(t){
    h+='<div class="side-trade">'
      +'<span class="st-amount">'+(parseFloat(t.amount)||0).toFixed(1)+' <span style="color:var(--dim);font-size:9px">AXON</span></span>'
      +'<span class="st-price">$'+(t.price||0).toFixed(3)+'</span>'
      +'<span class="st-time">'+(t.time||'')+'</span>'
      +'</div>';
  });
  el.innerHTML=h;
}

function drawSidePriceChart(){}

// ===== CHARTS (pure canvas, no lib) =====
function drawCharts(){
  drawPriceChart();
  drawDepthChart();
}

function drawPriceChart(){
  var canvas=document.getElementById('priceChart');
  if(!canvas)return;
  var chartRow=canvas.closest('.chart-row');
  if(trades.length<2){if(chartRow)chartRow.style.display='none';return;}
  if(chartRow)chartRow.style.display='';
  var ctx=canvas.getContext('2d');
  var W=canvas.parentElement.clientWidth-24;
  var H=120;
  canvas.width=W;canvas.height=H;
  ctx.clearRect(0,0,W,H);

  var pts=trades.slice().reverse();
  var prices=pts.map(function(t){return t.price;});
  var mn=Math.min.apply(null,prices)*0.95;
  var mx=Math.max.apply(null,prices)*1.05;
  if(mx===mn)mx=mn+0.01;
  var pad=20;

  // grid
  ctx.strokeStyle='#1e293b';ctx.lineWidth=0.5;
  for(var g=0;g<4;g++){
    var gy=pad+(H-pad*2)*(g/3);
    ctx.beginPath();ctx.moveTo(pad,gy);ctx.lineTo(W-5,gy);ctx.stroke();
    ctx.fillStyle='#475569';ctx.font='9px monospace';
    ctx.fillText('$'+(mx-(mx-mn)*(g/3)).toFixed(3),0,gy+3);
  }

  // line
  ctx.beginPath();
  ctx.strokeStyle='#00d4ff';ctx.lineWidth=2;
  pts.forEach(function(t,i){
    var x=pad+i*(W-pad-5)/(pts.length-1);
    var y=pad+(1-(t.price-mn)/(mx-mn))*(H-pad*2);
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // gradient fill
  var last=pts[pts.length-1];
  var lx=pad+(pts.length-1)*(W-pad-5)/(pts.length-1);
  var ly=pad+(1-(last.price-mn)/(mx-mn))*(H-pad*2);
  ctx.lineTo(lx,H-pad);ctx.lineTo(pad,H-pad);ctx.closePath();
  var grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,'rgba(0,212,255,0.15)');
  grad.addColorStop(1,'rgba(0,212,255,0)');
  ctx.fillStyle=grad;ctx.fill();

  // dots
  pts.forEach(function(t,i){
    var x=pad+i*(W-pad-5)/(pts.length-1);
    var y=pad+(1-(t.price-mn)/(mx-mn))*(H-pad*2);
    ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle='#00d4ff';ctx.fill();
  });
}

function drawDepthChart(){
  var canvas=document.getElementById('depthChart');
  if(!canvas)return;
  var ctx=canvas.getContext('2d');
  var W=canvas.parentElement.clientWidth-24;
  var H=120;
  canvas.width=W;canvas.height=H;
  ctx.clearRect(0,0,W,H);

  if(orders.length<1){
    ctx.fillStyle='#64748b';ctx.font='12px sans-serif';
    ctx.fillText('暂无数据',W/2-20,H/2);return;
  }

  // group by price bucket
  var buckets={};
  orders.forEach(function(o){
    var key=o.price.toFixed(2);
    buckets[key]=(buckets[key]||0)+o.amount;
  });
  var keys=Object.keys(buckets).sort(function(a,b){return parseFloat(a)-parseFloat(b);});
  var maxAmt=Math.max.apply(null,keys.map(function(k){return buckets[k];}));
  if(maxAmt===0)maxAmt=1;
  var pad=25;
  var barW=Math.max(8,Math.min(30,(W-pad*2)/keys.length-2));

  keys.forEach(function(k,i){
    var x=pad+i*(barW+2);
    var h=(buckets[k]/maxAmt)*(H-pad-10);
    var y=H-pad-h;

    var grad=ctx.createLinearGradient(x,y,x,H-pad);
    grad.addColorStop(0,'#a855f7');
    grad.addColorStop(1,'#3b82f6');
    ctx.fillStyle=grad;
    ctx.fillRect(x,y,barW,h);

    // label
    ctx.fillStyle='#475569';ctx.font='8px monospace';
    ctx.save();ctx.translate(x+barW/2,H-pad+10);ctx.rotate(-0.5);
    ctx.fillText('$'+k,0,0);ctx.restore();

    // amount on top
    if(h>15){
      ctx.fillStyle='#e2e8f0';ctx.font='9px monospace';
      ctx.fillText(Math.round(buckets[k]),x+1,y-3);
    }
  });
}

// ===== DETAIL MODAL =====
async function showDetail(orderId){
  detailOrderId=orderId;
  var info=document.getElementById('detailInfo');
  info.innerHTML='<div class="loading">加载中...</div>';
  document.getElementById('detailModal').classList.add('show');
  document.getElementById('detailBuyBtn').style.display='none';

  try{
    var r=await fetch(KEEPER+'/order/'+orderId);
    var o=await r.json();
    var pmt=o.payment||{};
    var isActive=!o.status||o.status==='Active'||o.status==='CancelPending';
    var statusMap={Active:'🟢 挂单中',CancelPending:'🟡 取消冷却中(买方仍可购买)',Completed:'🔵 已成交',Cancelled:'⚫ 已取消',Disputed:'🔴 争议中'};
    var statusText=statusMap[o.status]||o.status||'🟢 挂单中';
    info.innerHTML=''
      +'<div><span class="label">订单号</span><span class="val">#'+o.id+'</span></div>'
      +'<div><span class="label">数量</span><span class="val">'+(parseFloat(o.amount)||0).toFixed(2)+' AXON</span></div>'
      +'<div><span class="label">单价</span><span class="val" style="color:var(--cyan)">$'+(o.price||0).toFixed(4)+'</span></div>'
      +'<div><span class="label">总价</span><span class="val" style="color:var(--yellow)">'+(pmt.amount||o.total||'')+' '+(pmt.token||o.token||'USDT')+'</span></div>'
      +'<div><span class="label">付款链</span><span class="val">'+(pmt.chain_name||CHAIN_NAMES[o.chain_id]||'BSC')+'</span></div>'
      +'<div><span class="label">付款地址</span><span class="val" style="font-size:9px;word-break:break-all">'+(pmt.address||o.payment_address||'—')+'</span></div>'
      +'<div><span class="label">卖家</span><span class="val" style="font-size:9px;word-break:break-all">'+(o.seller||'—')+'</span></div>'
      +'<div><span class="label">状态</span><span class="val">'+statusText+'</span></div>';
    if(o.status==='Disputed'){
      info.innerHTML+='<div style="margin-top:8px;padding:8px;background:#ff525215;border-radius:6px;font-size:10px;color:#ff8a80">⚠️ 订单争议中，请通过官方渠道联系管理员处理。</div>';
    }
    if(isActive&&o.status!=='CancelPending'){
      document.getElementById('detailBuyBtn').style.display='';
    }
  }catch(e){
    // try from otc.json
    var found=null;
    trades.forEach(function(t){if(t.id===orderId)found=t;});
    orders.forEach(function(o){if(o.id===orderId)found=o;});
    if(found){
      info.innerHTML='<div><span class="label">订单号</span><span class="val">#'+found.id+'</span></div>'
        +'<div><span class="label">数量</span><span class="val">'+(parseFloat(found.amount)||0).toFixed(2)+' AXON</span></div>'
        +'<div><span class="label">单价</span><span class="val">$'+(found.price||0).toFixed(4)+'</span></div>'
        +'<div><span class="label">卖家</span><span class="val" style="font-size:9px">'+(found.seller||'')+'</span></div>'
        +'<div><span class="label">状态</span><span class="val">'+(found.status||'—')+'</span></div>';
    }else{
      info.innerHTML='<div class="loading">无法获取详情</div>';
    }
  }
}

function closeDetail(){
  document.getElementById('detailModal').classList.remove('show');
}
