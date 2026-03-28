/* otc2.js — Part 2: Render & Charts */

// ===== DIFF UPDATE HELPER =====
// Only update innerHTML if content actually changed — prevents DOM thrashing & layout jumps
function diffUpdate(el,html){
  if(el._lastHtml===html)return false;
  el._lastHtml=html;
  el.innerHTML=html;
  return true;
}
// Only update textContent if changed
function diffText(el,text){
  if(el.textContent===text)return;
  el.textContent=text;
}

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

  if(!sorted.length){diffUpdate(el,'<div class="loading">暂无匹配卖单</div>');return;}
  var h='';
  sorted.forEach(function(o){
    var s=esc(o.seller||'');
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
  diffUpdate(el,h);
}

// ===== RENDER TRADES =====
function renderTrades(){
  var el=document.getElementById('tradeList');
  if(!trades.length){diffUpdate(el,'<div class="loading">暂无成交记录</div>');return;}
  var h='';
  trades.forEach(function(t){
    var s=esc(t.seller||'');
    var ss=s?s.slice(0,6)+'...'+s.slice(-4):'';
    h+='<div class="order row-buy trade" onclick="showDetail('+t.id+')">'
      +'<span class="id">#'+t.id+'</span>'
      +'<span class="amount">'+(parseFloat(t.amount)||0).toFixed(2)+'</span>'
      +'<span class="price" style="color:var(--green)">$'+t.price.toFixed(3)+'</span>'
      +'<span class="total">$'+(t.total||0).toFixed(2)+'</span>'
      +'<span class="chain-tag">'+(t.chain||'BSC')+'</span>'
      +'<span class="seller-s">'+ss+'</span>'
      +'<span style="font-size:11px;color:var(--dim)">'+(t.time||'')+'</span>'
      +'</div>';
  });
  diffUpdate(el,h);
}

function renderSideTrades(){
  var el=document.getElementById('sideTradeList');
  if(!el)return;
  if(!trades.length){diffUpdate(el,'<div class="loading" style="font-size:12px">暂无成交</div>');return;}
  var h='';
  var show=trades.slice(0,20);
  show.forEach(function(t){
    h+='<div class="side-trade">'
      +'<span class="st-amount">'+(parseFloat(t.amount)||0).toFixed(1)+' <span style="color:var(--dim);font-size:11px">AXON</span></span>'
      +'<span class="st-price">$'+(t.price||0).toFixed(3)+'</span>'
      +'<span class="st-time">'+(t.time||'')+'</span>'
      +'</div>';
  });
  diffUpdate(el,h);
}

function drawSidePriceChart(){}

// ===== CHARTS (pure canvas, no lib) =====
var _lastChartKey='';
function drawCharts(){
  // skip redraw if data unchanged
  var key=orders.map(function(o){return o.id+':'+o.price+':'+o.amount;}).join('|')
    +'||'+trades.map(function(t){return t.id;}).join(',');
  if(key===_lastChartKey)return;
  _lastChartKey=key;
  drawPriceChart();
  drawDepthChart();
}

function drawPriceChart(){
  var canvas=document.getElementById('priceChart');
  if(!canvas)return;
  var chartRow=canvas.closest('.chart-row');
  if(trades.length<2){if(chartRow)chartRow.style.display='none';return;}
  if(chartRow)chartRow.style.display='';

  var dpr=window.devicePixelRatio||1;
  var W=canvas.parentElement.clientWidth-12;
  var H=160;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  var ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  var isDark=document.documentElement.getAttribute('data-theme')!=='light';
  var pts=trades.slice().reverse();
  var prices=pts.map(function(t){return t.price;});
  var mn=Math.min.apply(null,prices);
  var mx=Math.max.apply(null,prices);
  var range=mx-mn;
  if(range<0.001)range=0.01;
  mn-=range*0.1;mx+=range*0.1;
  var padL=52,padR=12,padT=20,padB=32;
  var cW=W-padL-padR,cH=H-padT-padB;

  function xPos(i){return padL+i*cW/(pts.length-1);}
  function yPos(p){return padT+(1-(p-mn)/(mx-mn))*cH;}

  // grid lines
  var gridC=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)';
  var textC=isDark?'#64748b':'#94a3b8';
  ctx.font='12px -apple-system,system-ui,sans-serif';
  for(var g=0;g<5;g++){
    var gy=padT+cH*(g/4);
    var gp=mx-(mx-mn)*(g/4);
    ctx.strokeStyle=gridC;ctx.lineWidth=1;
    ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.moveTo(padL,gy);ctx.lineTo(W-padR,gy);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=textC;ctx.textAlign='right';
    ctx.fillText('$'+gp.toFixed(3),padL-6,gy+3);
  }

  // time labels
  ctx.textAlign='center';ctx.fillStyle=textC;ctx.font='11px -apple-system,system-ui,sans-serif';
  var step=Math.max(1,Math.floor(pts.length/5));
  for(var t=0;t<pts.length;t+=step){
    ctx.fillText(pts[t].time||'',xPos(t),H-8);
  }
  if(pts.length>1){ctx.fillText(pts[pts.length-1].time||'',xPos(pts.length-1),H-8);}

  // smooth curve (Catmull-Rom → Bezier)
  function catmull(p0,p1,p2,p3){
    return{
      cp1x:p1.x+(p2.x-p0.x)/6, cp1y:p1.y+(p2.y-p0.y)/6,
      cp2x:p2.x-(p3.x-p1.x)/6, cp2y:p2.y-(p3.y-p1.y)/6
    };
  }
  var points=pts.map(function(t,i){return{x:xPos(i),y:yPos(t.price)};});

  // gradient fill under curve
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(var i=0;i<points.length-1;i++){
    var p0=points[Math.max(0,i-1)];
    var p1=points[i];var p2=points[i+1];
    var p3=points[Math.min(points.length-1,i+2)];
    var cp=catmull(p0,p1,p2,p3);
    ctx.bezierCurveTo(cp.cp1x,cp.cp1y,cp.cp2x,cp.cp2y,p2.x,p2.y);
  }
  ctx.lineTo(points[points.length-1].x,padT+cH);
  ctx.lineTo(points[0].x,padT+cH);ctx.closePath();
  var fillGrad=ctx.createLinearGradient(0,padT,0,padT+cH);
  fillGrad.addColorStop(0,isDark?'rgba(0,212,255,0.18)':'rgba(59,130,246,0.12)');
  fillGrad.addColorStop(0.6,isDark?'rgba(0,212,255,0.05)':'rgba(59,130,246,0.03)');
  fillGrad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=fillGrad;ctx.fill();

  // line with glow
  ctx.save();
  ctx.shadowColor=isDark?'rgba(0,212,255,0.5)':'rgba(59,130,246,0.4)';
  ctx.shadowBlur=8;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
  for(var i=0;i<points.length-1;i++){
    var p0=points[Math.max(0,i-1)];
    var p1=points[i];var p2=points[i+1];
    var p3=points[Math.min(points.length-1,i+2)];
    var cp=catmull(p0,p1,p2,p3);
    ctx.bezierCurveTo(cp.cp1x,cp.cp1y,cp.cp2x,cp.cp2y,p2.x,p2.y);
  }
  var lineGrad=ctx.createLinearGradient(padL,0,W-padR,0);
  lineGrad.addColorStop(0,isDark?'#00b4d8':'#3b82f6');
  lineGrad.addColorStop(1,isDark?'#00e5ff':'#60a5fa');
  ctx.strokeStyle=lineGrad;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.stroke();
  ctx.restore();

  // data points
  points.forEach(function(p,i){
    // outer glow
    ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);
    ctx.fillStyle=isDark?'rgba(0,212,255,0.15)':'rgba(59,130,246,0.1)';ctx.fill();
    // outer ring
    ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);
    ctx.fillStyle=isDark?'rgba(2,6,23,0.8)':'rgba(255,255,255,0.9)';ctx.fill();
    ctx.strokeStyle=isDark?'#00e5ff':'#3b82f6';ctx.lineWidth=2;ctx.stroke();
    // inner dot
    ctx.beginPath();ctx.arc(p.x,p.y,2,0,Math.PI*2);
    ctx.fillStyle=isDark?'#00e5ff':'#3b82f6';ctx.fill();
  });

  // latest price tag — placed ABOVE the line to avoid overlap
  var lastP=points[points.length-1];
  var lastPrice=pts[pts.length-1].price;
  ctx.save();
  var tagW=66,tagH=24,tagR=5;
  var tagX=lastP.x-tagW/2,tagY=lastP.y-tagH-12;
  if(tagX<padL)tagX=padL+4;
  if(tagX+tagW>W-padR)tagX=W-padR-tagW-4;
  if(tagY<padT)tagY=lastP.y+10;
  // tag bg
  ctx.shadowColor=isDark?'rgba(0,212,255,0.3)':'rgba(59,130,246,0.2)';ctx.shadowBlur=6;
  ctx.fillStyle=isDark?'rgba(0,212,255,0.15)':'rgba(59,130,246,0.1)';
  ctx.beginPath();
  ctx.moveTo(tagX+tagR,tagY);ctx.lineTo(tagX+tagW-tagR,tagY);
  ctx.quadraticCurveTo(tagX+tagW,tagY,tagX+tagW,tagY+tagR);
  ctx.lineTo(tagX+tagW,tagY+tagH-tagR);
  ctx.quadraticCurveTo(tagX+tagW,tagY+tagH,tagX+tagW-tagR,tagY+tagH);
  ctx.lineTo(tagX+tagR,tagY+tagH);
  ctx.quadraticCurveTo(tagX,tagY+tagH,tagX,tagY+tagH-tagR);
  ctx.lineTo(tagX,tagY+tagR);
  ctx.quadraticCurveTo(tagX,tagY,tagX+tagR,tagY);
  ctx.closePath();ctx.fill();
  ctx.strokeStyle=isDark?'rgba(0,212,255,0.4)':'rgba(59,130,246,0.3)';ctx.lineWidth=1;ctx.stroke();
  ctx.shadowBlur=0;
  ctx.fillStyle=isDark?'#00e5ff':'#3b82f6';
  ctx.font='bold 12px -apple-system,system-ui,sans-serif';ctx.textAlign='center';
  ctx.fillText('$'+lastPrice.toFixed(3),tagX+tagW/2,tagY+16);
  ctx.restore();
}

function drawDepthChart(){
  var canvas=document.getElementById('depthChart');
  if(!canvas||!canvas.parentElement)return;

  var dpr=window.devicePixelRatio||1;
  var W=canvas.parentElement.clientWidth-20;
  var H=180;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  var ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  var isDark=document.documentElement.getAttribute('data-theme')!=='light';
  var textC=isDark?'#64748b':'#94a3b8';

  if(orders.length<1){
    ctx.fillStyle=textC;ctx.font='13px Inter,system-ui,sans-serif';
    ctx.textAlign='center';ctx.fillText('暂无挂单数据',W/2,H/2);return;
  }

  // group by price bucket
  var buckets={};
  orders.forEach(function(o){
    var key=o.price.toFixed(3);
    buckets[key]=(buckets[key]||0)+o.amount;
  });
  var keys=Object.keys(buckets).sort(function(a,b){return parseFloat(a)-parseFloat(b);});

  // limit to max 12 buckets — merge if too many
  if(keys.length>12){
    var step=Math.ceil(keys.length/12);
    var merged={};
    for(var i=0;i<keys.length;i++){
      var gi=Math.floor(i/step);
      var gKeys=keys.slice(gi*step,Math.min((gi+1)*step,keys.length));
      var gKey=gKeys[0]; // use lowest price as label
      if(!merged[gKey])merged[gKey]=0;
      merged[gKey]+=buckets[keys[i]];
    }
    buckets=merged;
    keys=Object.keys(buckets).sort(function(a,b){return parseFloat(a)-parseFloat(b);});
  }

  var maxAmt=Math.max.apply(null,keys.map(function(k){return buckets[k];}));
  if(maxAmt===0)maxAmt=1;

  var padL=44,padR=16,padT=16,padB=44;
  var cW=W-padL-padR,cH=H-padT-padB;
  var gap=Math.max(2,Math.min(6,cW/keys.length*0.15));
  var barW=Math.max(16,Math.min(48,(cW/keys.length)-gap));
  var totalBarsW=keys.length*(barW+gap)-gap;
  var offsetX=padL+(cW-totalBarsW)/2;

  // Y-axis
  ctx.font='10px JetBrains Mono,monospace';ctx.fillStyle=textC;ctx.textAlign='right';
  for(var y=0;y<4;y++){
    var vy=Math.round(maxAmt*(1-y/3));
    var yy=padT+cH*(y/3);
    ctx.fillText(vy,padL-6,yy+4);
    ctx.strokeStyle=isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)';
    ctx.setLineDash([2,4]);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(padL,yy);ctx.lineTo(W-padR,yy);ctx.stroke();
    ctx.setLineDash([]);
  }

  // bars
  keys.forEach(function(k,i){
    var x=offsetX+i*(barW+gap);
    var val=buckets[k];
    var h=Math.max(2,(val/maxAmt)*cH);
    var y=padT+cH-h;
    var r=Math.min(3,barW/4);

    // gradient
    var grad=ctx.createLinearGradient(x,y,x,padT+cH);
    grad.addColorStop(0,isDark?'#3b82f6':'#2563eb');
    grad.addColorStop(1,isDark?'#1e40af':'#1e3a8a');
    ctx.fillStyle=grad;

    // rounded top
    ctx.beginPath();
    ctx.moveTo(x,padT+cH);ctx.lineTo(x,y+r);
    ctx.quadraticCurveTo(x,y,x+r,y);ctx.lineTo(x+barW-r,y);
    ctx.quadraticCurveTo(x+barW,y,x+barW,y+r);ctx.lineTo(x+barW,padT+cH);
    ctx.closePath();ctx.fill();

    // amount label — only if bar tall enough
    if(h>24){
      ctx.fillStyle=isDark?'#e2e8f0':'#1e293b';
      ctx.font='bold 10px JetBrains Mono,monospace';
      ctx.textAlign='center';
      ctx.fillText(Math.round(val),x+barW/2,y-5);
    }

    // price label — rotate if many bars
    ctx.fillStyle=textC;
    ctx.font='10px JetBrains Mono,monospace';
    ctx.textAlign='center';
    ctx.save();
    ctx.translate(x+barW/2,padT+cH+12);
    if(keys.length>6)ctx.rotate(-0.5);
    ctx.fillText('$'+parseFloat(k).toFixed(2),0,0);
    ctx.restore();
  });

  // cumulative depth line
  if(keys.length>2){
    var cum=0;var totalCum=0;
    keys.forEach(function(k){totalCum+=buckets[k];});
    var cumPts=keys.map(function(k,i){
      cum+=buckets[k];
      return{x:offsetX+i*(barW+gap)+barW/2, y:padT+(1-cum/totalCum)*cH*0.85+cH*0.05};
    });
    ctx.beginPath();ctx.moveTo(cumPts[0].x,cumPts[0].y);
    for(var i=1;i<cumPts.length;i++)ctx.lineTo(cumPts[i].x,cumPts[i].y);
    ctx.strokeStyle=isDark?'rgba(34,211,238,0.5)':'rgba(8,145,178,0.4)';
    ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
  }
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
      +'<div><span class="label">付款地址</span><span class="val" style="font-size:11px;word-break:break-all">'+(pmt.address||o.payment_address||'—')+'</span></div>'
      +'<div><span class="label">卖家</span><span class="val" style="font-size:11px;word-break:break-all">'+esc(o.seller||'—')+'</span></div>'
      +'<div><span class="label">状态</span><span class="val">'+statusText+'</span></div>';
    if(o.status==='Disputed'){
      info.innerHTML+='<div style="margin-top:8px;padding:8px;background:#ff525215;border-radius:6px;font-size:12px;color:#ff8a80">⚠️ 订单争议中，请通过官方渠道联系管理员处理。</div>';
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
        +'<div><span class="label">卖家</span><span class="val" style="font-size:11px">'+esc(found.seller||'')+'</span></div>'
        +'<div><span class="label">状态</span><span class="val">'+(found.status||'—')+'</span></div>';
    }else{
      info.innerHTML='<div class="loading">无法获取详情</div>';
    }
  }
}

function closeDetail(){
  document.getElementById('detailModal').classList.remove('show');
}

// ===== SELL PAGE MARKET INFO =====
function updateSellMarketInfo(){
  var el;
  el=document.getElementById('mktFloor');
  if(el){
    if(orders.length>0)el.textContent='$'+orders[0].price.toFixed(4);
    else el.textContent='—';
  }
  el=document.getElementById('mktLast');
  if(el){
    if(trades.length>0)el.textContent='$'+trades[0].price.toFixed(4);
    else el.textContent='—';
  }
  el=document.getElementById('mktActive');
  if(el)el.textContent=orders.length;
  el=document.getElementById('mktDepth');
  if(el){
    var total=0;orders.forEach(function(o){total+=o.amount||0;});
    el.textContent=total.toFixed(0)+' AXON';
  }
  el=document.getElementById('mktVol');
  if(el)el.textContent=document.getElementById('sVol')?document.getElementById('sVol').textContent:'—';
  el=document.getElementById('mktTrades');
  if(el)el.textContent=document.getElementById('sTrades')?document.getElementById('sTrades').textContent:'—';

  // draw depth chart in sell panel
  if(document.getElementById('depthChart'))drawDepthChart();
}
