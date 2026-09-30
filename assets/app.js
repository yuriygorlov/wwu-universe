(() => {
  const root = document.getElementById('wwu-universe');
  const canvas = root.querySelector('#wwu-canvas');
  const ctx = canvas.getContext('2d');
  const nodeSelect = root.querySelector('#wwu-node');
  const linkSelect = root.querySelector('#wwu-link');
  const detail = root.querySelector('#wwu-detail');
  const probe = root.querySelector('#wwu-color-probe');
  // Geography: Natural Earth land via world-atlas 2.0.2, land-110m.
  const land = window.WWU_LAND;
  const rad = Math.PI / 180;
  const nodes = window.WWU_MODEL.nodes.map(n => Object.assign({}, n));
  const byId = nodes.reduce((map, n) => { map[n.id] = n; return map; }, {});
  const research = nodes.filter(n => n.kind === 'research' || n.kind === 'hypothesis');
  const businesses = nodes.filter(n => n.kind === 'business');
  // Positions describe the conceptual architecture, not geographic business locations.
  const researchPlaces = window.WWU_MODEL.researchPlaces;
  const businessPlaces = window.WWU_MODEL.businessPlaces;
  research.forEach((n,i)=>{n.lon=researchPlaces[i][0];n.lat=researchPlaces[i][1];n.radius=.62;});
  businesses.forEach((n,i)=>{n.lon=businessPlaces[i][0];n.lat=businessPlaces[i][1];n.radius=1.22;});
  byId.science.radius=0;byId.science.lon=0;byId.science.lat=0;
  function spherical(lon,lat,r=1){ const a=lon*rad,b=lat*rad;return [r*Math.cos(b)*Math.sin(a),r*Math.sin(b),r*Math.cos(b)*Math.cos(a)]; }
  nodes.forEach(n=>n.xyz=spherical(n.lon,n.lat,n.radius));
  const edges=[];
  function edge(a,b,text){edges.push({id:'e'+edges.length,a,b,text,hypothesis:a==='hypotheses'||b==='hypotheses'});}
  research.forEach(n=>edge('science',n.id,n.id==='hypotheses' ? 'Идеи и гипотезы → Наука: точное определение, проверяемое предположение и эксперимент.' : n.name+' → Наука: наблюдения, измерения и проверяемые знания.'));
  window.WWU_MODEL.relationships.forEach(x=>edge(...x));
  edges.forEach(e=>{
    const a=byId[e.a].xyz,b=byId[e.b].xyz;
    const both=byId[e.a].kind==='business'&&byId[e.b].kind==='business';
    let c=a.map((v,i)=>(v+b[i])*.5);
    if(both){const length=Math.hypot(...c)||1;c=c.map(v=>v/length*1.48);}
    else c=[c[0]*1.1,c[1]*1.1,c[2]*1.1];
    e.points=Array.from({length:29},(_,i)=>{const t=i/28,u=1-t;return a.map((v,j)=>u*u*v+2*u*t*c[j]+t*t*b[j]);});
  });
  const allOption=document.createElement('option');allOption.value='all';allOption.textContent='Вся система';nodeSelect.append(allOption);
  for(const [label,list] of [['Центр',[byId.science]],['Исследования',research],['Применение',businesses]]){
    const group=document.createElement('optgroup');group.label=label;
    list.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.name;group.append(o);});nodeSelect.append(group);
  }
  let selected='all',selectedEdge=null,yaw=-18,pitch=-15,zoom=1,w=600,h=560,scale=175;
  let colors,rotation,projected=[],edgeHits=[],labelHits=[],frameRequested=false;
  let generation=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const coarse=matchMedia('(pointer: coarse)');
  const html=document.documentElement;
  const controls=root.querySelector('#wwu-controls');
  let autoRotate=false,autoFrame=0,lastAutoTime=0,lastAutoDraw=0,statusTimer=0;
  let tvMode=html.classList.contains('tv-mode'),menuOpen=false;
  function color(v){probe.style.color='var('+v+')';return getComputedStyle(probe).color;}
  function palette(){colors={bg:color('--background'),fg:color('--foreground'),muted:color('--muted-foreground'),grid:color('--border'),science:color('--viz-series-1'),business:color('--viz-series-2')};schedule();}
  function alpha(c,a){const v=d3.color(c);if(!v)return c;v.opacity=a;return v.formatRgb();}
  function transform(p){
    const a=yaw*rad,b=pitch*rad,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
    const x=p[0]*ca+p[2]*sa,z=p[2]*ca-p[0]*sa;
    return [x,p[1]*cb+z*sb,z*cb-p[1]*sb];
  }
  function project(p){const q=transform(p);return{x:w/2+q[0]*scale,y:h/2-q[1]*scale,z:q[2]};}
  function sphereMesh(){
    const t=(1+Math.sqrt(5))/2;
    const vertices=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v=>{const l=Math.hypot(...v);return v.map(x=>x/l);});
    let faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
    const cache=new Map();function mid(a,b){const k=Math.min(a,b)+':'+Math.max(a,b);if(cache.has(k))return cache.get(k);const v=vertices[a].map((x,j)=>(x+vertices[b][j])/2),l=Math.hypot(...v),id=vertices.length;vertices.push(v.map(x=>x/l));cache.set(k,id);return id;}
    for(let q=0;q<2;q++){const next=[];for(const[a,b,c]of faces){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}faces=next;}
    const seen=new Set(),segments=[];
    faces.forEach(f=>f.forEach((a,j)=>{const b=f[(j+1)%3],k=Math.min(a,b)+':'+Math.max(a,b);if(!seen.has(k)){seen.add(k);segments.push([vertices[a],vertices[b]]);}}));
    return {vertices,segments};
  }
  const mesh=sphereMesh();
  function fit(){const box=canvas.getBoundingClientRect();w=box.width;h=box.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);schedule();}
  function schedule(){if(!frameRequested){frameRequested=true;requestAnimationFrame(()=>{frameRequested=false;draw();});}}
  function strokePath(points,col,width,dash=[]){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=col;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  function lineVisible(e){if(selectedEdge)return selectedEdge.id===e.id;return selected==='all'||e.a===selected||e.b===selected;}
  function draw(){
    if(!colors||!w||!h)return;
    scale=Math.min(w*.333,h*.365)*zoom;
    ctx.clearRect(0,0,w,h);ctx.lineCap='round';ctx.lineJoin='round';
    const projection=d3.geoOrthographic().translate([w/2,h/2]).scale(scale*.96).rotate([yaw,pitch]).clipAngle(90).precision(.45);
    const path=d3.geoPath(projection,ctx);
    const globe=ctx.createRadialGradient(w/2-scale*.25,h/2-scale*.25,scale*.05,w/2,h/2,scale);
    globe.addColorStop(0,alpha(colors.science,.018));globe.addColorStop(.75,alpha(colors.science,.03));globe.addColorStop(1,alpha(colors.science,.095));
    ctx.fillStyle=globe;ctx.beginPath();ctx.arc(w/2,h/2,scale,0,Math.PI*2);ctx.fill();
    // Back wire cage is lighter; the globe remains translucent.
    const m=mesh.segments.map(([a,b])=>[project(a),project(b)]);
    for(const [a,b] of m){const front=(a.z+b.z)>0;strokePath([a,b],alpha(front?colors.science:colors.muted,front?.20:.06),front?.8:.65);}
    ctx.beginPath();path(land);ctx.fillStyle=alpha(colors.science,.13);ctx.fill();ctx.strokeStyle=alpha(colors.science,.44);ctx.lineWidth=.7;ctx.stroke();
    // A few radial rays reproduce the reference's open mesh silhouette.
    mesh.vertices.filter((_,i)=>i%13===0).forEach(p=>{const a=project(p),b=project(p.map(v=>v*1.15));strokePath([a,b],alpha(colors.science,a.z>0?.16:.06),.8);});
    edgeHits=[];
    const sorted=edges.map(e=>({e,points:e.points.map(project)})).sort((a,b)=>a.points[14].z-b.points[14].z);
    sorted.sort((a,b)=>Number(lineVisible(a.e))-Number(lineVisible(b.e)));
    for(const {e,points} of sorted){
      const active=lineVisible(e),all=selected==='all';
      const business=byId[e.a].kind==='business'&&byId[e.b].kind==='business';
      const col=business?colors.business:colors.science;
      const opacity=all?(business?.27:.34):(active?.93:.035);
      strokePath(points,alpha(col,opacity),all?1.1:(active?2.1:.7),e.hypothesis?[4,5]:[]);
      if(active)edgeHits.push({e,points});
    }
    const related=new Set(selected==='all'?nodes.map(n=>n.id):[selected]);
    edges.filter(lineVisible).forEach(e=>{related.add(e.a);related.add(e.b);});
    const glow=ctx.createRadialGradient(w/2,h/2,1,w/2,h/2,scale*.27);glow.addColorStop(0,alpha(colors.science,.3));glow.addColorStop(1,alpha(colors.science,0));
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(w/2,h/2,scale*.27,0,Math.PI*2);ctx.fill();
    projected=nodes.map(n=>({...project(n.xyz),node:n})).sort((a,b)=>a.z-b.z);
    for(const p of projected){
      const n=p.node,isCore=n.kind==='core',active=related.has(n.id),r=isCore?13:n.kind==='business'?7:5;
      p.hit=coarse.matches?22:15;p.r=r;
      ctx.globalAlpha=active?1:.25;
      const col=n.kind==='business'?colors.business:colors.science;
      if(n.id===selected||selectedEdge&&(selectedEdge.a===n.id||selectedEdge.b===n.id)){
        ctx.beginPath();ctx.arc(p.x,p.y,r+7,0,Math.PI*2);ctx.fillStyle=alpha(col,.13);ctx.fill();
      }
      ctx.beginPath();
      if(n.kind==='business'){ctx.moveTo(p.x,p.y-r-1);ctx.lineTo(p.x+r+1,p.y);ctx.lineTo(p.x,p.y+r+1);ctx.lineTo(p.x-r-1,p.y);ctx.closePath();}
      else ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.fillStyle=n.kind==='hypothesis'?colors.bg:col;ctx.fill();ctx.strokeStyle=n.kind==='hypothesis'?col:colors.bg;ctx.lineWidth=1.4;ctx.setLineDash(n.kind==='hypothesis'?[2,3]:[]);ctx.stroke();ctx.setLineDash([]);
      if(isCore){ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fillStyle=colors.bg;ctx.fill();}
      ctx.globalAlpha=1;
    }
    drawLabels(related);
    root.dataset.selection=selected;root.dataset.edge=selectedEdge?selectedEdge.id:'';root.dataset.yaw=yaw.toFixed(2);root.dataset.pitch=pitch.toFixed(2);root.dataset.zoom=zoom.toFixed(2);
    root.dataset.ready='true';
  }
  function drawLabels(related){
    const base=parseFloat(getComputedStyle(root).fontSize)||14,font=Math.max(12,base*.94),line=font*1.24;
    const family=getComputedStyle(root).fontFamily;ctx.font='400 '+font+'px '+family;
    const candidates=projected.filter(p=>p.node.kind==='core'||related.has(p.node.id))
      .map(p=>({...p,priority:p.node.id===selected?100:selectedEdge&&(selectedEdge.a===p.node.id||selectedEdge.b===p.node.id)?95:p.node.kind==='core'?90:p.node.kind==='business'?60:40+p.z*10}))
      .sort((a,b)=>b.priority-a.priority);
    const boxes=[];labelHits=[];
    for(const p of candidates){
      if(selected==='all'&&p.node.kind!=='core'&&p.node.kind!=='business'&&p.z<0)continue;
      const lines=p.node.lines||[p.node.kind==='core'?'НАУКА':p.node.name];
      const tw=Math.max(...lines.map(s=>ctx.measureText(s).width)),bh=lines.length*line+6,bw=tw+10;
      if(p.x < -20||p.x>w+20||p.y< -20||p.y>h+20)continue;
      const offsets=p.node.kind==='core'?[[0,28],[0,-32],[64,0],[-64,0],[0,49],[0,-53]]:[[0,-22],[0,23],[bw/2+12,0],[-bw/2-12,0],[0,-43],[0,44],[bw/2+12,-26],[-bw/2-12,26],[0,-64],[0,65]];
      let box=null;
      for(const[dx,dy]of offsets){const b={x:Math.max(3,Math.min(w-bw-3,p.x+dx-bw/2)),y:Math.max(4,Math.min(h-bh-4,p.y+dy-bh/2)),w:bw,h:bh};
        const overlaps=boxes.some(o=>b.x<o.x+o.w+5&&b.x+b.w+5>o.x&&b.y<o.y+o.h+5&&b.y+b.h+5>o.y);
        const covers=projected.some(q=>q.node.id!==p.node.id&&q.x>b.x-4&&q.x<b.x+b.w+4&&q.y>b.y-4&&q.y<b.y+b.h+4&&related.has(q.node.id));
        if(!overlaps&&!covers){box=b;break;}
      }
      if(!box)continue;
      boxes.push(box);labelHits.push({...box,node:p.node});
      const cx=box.x+box.w/2,cy=box.y+box.h/2;
      if(Math.hypot(cx-p.x,cy-p.y)>30)strokePath([{x:p.x,y:p.y},{x:cx,y:cy}],alpha(colors.muted,.35),.7);
      ctx.fillStyle=alpha(colors.bg,.88);ctx.fillRect(box.x,box.y,box.w,box.h);
      ctx.fillStyle=colors.fg;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=(p.node.kind==='core'||p.node.id===selected?'500 ':'400 ')+font+'px '+family;
      lines.forEach((s,i)=>ctx.fillText(s,cx,box.y+3+line*(i+.5)));
      ctx.font='400 '+font+'px '+family;
    }
  }
  function choose(id,focus=false){
    setAuto(false);
    selected=id;selectedEdge=null;nodeSelect.value=id;
    linkSelect.innerHTML = '';
    const first=document.createElement('option');first.value='';first.textContent=id==='all'?'Выберите направление':'Все пересечения';linkSelect.append(first);linkSelect.disabled=id==='all';
    edges.filter(e=>e.a===id||e.b===id).forEach(e=>{const o=document.createElement('option');o.value=e.id;o.textContent=byId[e.a===id?e.b:e.a].name;linkSelect.append(o);});
    detail.textContent=id==='all'?'Все связи WWU':byId[id].name+': '+byId[id].text;
    if(focus&&id!=='all'&&id!=='science')focusNode(byId[id]);else schedule();
  }
  function chooseEdge(e){
    if(selected==='all'||(selected!==e.a&&selected!==e.b))choose(e.a);
    selectedEdge=e;linkSelect.value=e.id;detail.textContent=e.text;schedule();
  }
  function focusNode(n){
    generation++;const token=generation,startYaw=yaw,startPitch=pitch;
    let delta=(-n.lon-yaw)%360;if(delta>180)delta-=360;if(delta< -180)delta+=360;
    const targetPitch=-n.lat;
    if(reduced.matches){yaw+=delta;pitch=targetPitch;schedule();return;}
    const start=performance.now();function step(now){if(token!==generation)return;const t=Math.min(1,(now-start)/420),v=1-Math.pow(1-t,3);yaw=startYaw+delta*v;pitch=startPitch+(targetPitch-startPitch)*v;schedule();if(t<1)requestAnimationFrame(step);}requestAnimationFrame(step);
  }
  nodeSelect.addEventListener('change',()=>choose(nodeSelect.value,true));
  linkSelect.addEventListener('change',()=>{const e=edges.find(e=>e.id===linkSelect.value);if(e)chooseEdge(e);else{selectedEdge=null;detail.textContent=byId[selected].name+': '+byId[selected].text;schedule();}});
  const pointers=new Map();let drag=null,pinch=null;
  function relative(e){const b=canvas.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
  canvas.addEventListener('pointerdown',e=>{
    setAuto(false);generation++;const p=relative(e);pointers.set(e.pointerId,p);if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);
    if(pointers.size===1)drag={x:p.x,y:p.y,lastX:p.x,lastY:p.y,moved:false};
    if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};if(drag)drag.moved=true;}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;const p=relative(e);pointers.set(e.pointerId,p);
    if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()];zoom=Math.max(.65,Math.min(1.85,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance)));schedule();return;}
    if(drag&&pointers.size===1){if(Math.hypot(p.x-drag.x,p.y-drag.y)>5)drag.moved=true;yaw+=(p.x-drag.lastX)*.36;pitch=Math.max(-89,Math.min(89,pitch-(p.y-drag.lastY)*.36));drag.lastX=p.x;drag.lastY=p.y;schedule();}
  });
  function pointDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
  function pick(p){
    const label=labelHits.find(b=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);if(label){choose(label.node.id);return;}
    const hits=projected.map(n=>({n,d:Math.hypot(n.x-p.x,n.y-p.y)})).filter(q=>q.d<q.n.hit).sort((a,b)=>a.d-b.d);if(hits.length){choose(hits[0].n.node.id);return;}
    let best=null,min=coarse.matches?11:7;for(const hit of edgeHits)for(let i=1;i<hit.points.length;i++){const d=pointDistance(p,hit.points[i-1],hit.points[i]);if(d<min){min=d;best=hit.e;}}if(best)chooseEdge(best);
  }
  canvas.addEventListener('pointerup',e=>{const p=relative(e),tap=drag&&!drag.moved&&pointers.size===1;pointers.delete(e.pointerId);if(tap)pick(p);pinch=null;if(pointers.size){const q=[...pointers.values()][0];drag={x:q.x,y:q.y,lastX:q.x,lastY:q.y,moved:true};}else drag=null;});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinch=null;drag=null;});
  canvas.addEventListener('wheel',e=>{e.preventDefault();setAuto(false);zoom=Math.max(.65,Math.min(1.85,zoom*Math.exp(-e.deltaY*.0013)));schedule();},{passive:false});
  root.querySelector('#wwu-left').addEventListener('click',()=>{setAuto(false);generation++;yaw-=20;schedule();});
  root.querySelector('#wwu-right').addEventListener('click',()=>{setAuto(false);generation++;yaw+=20;schedule();});
  root.querySelector('#wwu-plus').addEventListener('click',()=>{zoom=Math.min(1.85,zoom*1.15);schedule();});
  root.querySelector('#wwu-minus').addEventListener('click',()=>{zoom=Math.max(.65,zoom/1.15);schedule();});
  function setAuto(value){
    autoRotate=!!value;lastAutoTime=0;lastAutoDraw=0;
    root.querySelector('#wwu-auto').setAttribute('aria-pressed',String(autoRotate));
    root.querySelector('#wwu-auto').textContent=autoRotate?'Остановить вращение':'Автовращение';
    root.dataset.auto=String(autoRotate);
    if(autoFrame)cancelAnimationFrame(autoFrame);autoFrame=0;
    if(autoRotate)autoFrame=requestAnimationFrame(animate);
  }
  function animate(now){
    if(!autoRotate)return;
    const delta=lastAutoTime?Math.min(now-lastAutoTime,100):0;lastAutoTime=now;
    if(!document.hidden&&!menuOpen){yaw=(yaw+delta*.005)%360;if(now-lastAutoDraw>32){lastAutoDraw=now;schedule();}}
    autoFrame=requestAnimationFrame(animate);
  }
  function notify(text){
    const status=root.querySelector('#wwu-status');status.textContent=text;clearTimeout(statusTimer);statusTimer=setTimeout(()=>{status.textContent='';},6000);
  }
  function focusCanvas(){try{canvas.focus({preventScroll:true});}catch(_){canvas.focus();}}
  function showMenu(value){
    menuOpen=tvMode&&value;html.classList.toggle('tv-controls-open',menuOpen);
    controls.setAttribute('aria-label',menuOpen?'Меню управления моделью':'Выбор направления');
    root.querySelector('#wwu-menu').setAttribute('aria-expanded',String(menuOpen));
    if(menuOpen){setAuto(false);nodeSelect.focus();}else if(tvMode)focusCanvas();
    root.dataset.menu=String(menuOpen);schedule();
  }
  function setTV(value,updateURL){
    tvMode=!!value;html.classList.toggle('tv-mode',tvMode);showMenu(false);
    root.querySelector('#wwu-tv').setAttribute('aria-pressed',String(tvMode));
    root.querySelector('#wwu-tv').textContent=tvMode?'Обычный режим':'Режим ТВ';
    root.querySelector('#wwu-help').textContent=tvMode?'Стрелки: вращение · OK: меню · Back: к модели':'Вращайте мышью или пальцем · Масштаб: колесо / щипок';
    root.dataset.tv=String(tvMode);
    if(updateURL&&window.URL&&history.replaceState){try{const u=new URL(location.href);if(tvMode)u.searchParams.set('tv','1');else u.searchParams.delete('tv');history.replaceState(null,'',u.href);}catch(_){}}
    palette();requestAnimationFrame(fit);
    if(tvMode)focusCanvas();
  }
  function fullscreen(){
    const active=document.fullscreenElement||document.webkitFullscreenElement;
    const method=active?(document.exitFullscreen||document.webkitExitFullscreen):(html.requestFullscreen||html.webkitRequestFullscreen);
    if(!method){setTV(true,true);notify('Режим ТВ включён. Полный экран можно выбрать в меню браузера.');return;}
    try{const result=method.call(active?document:html);if(result&&result.catch)result.catch(()=>notify('Браузер не разрешил полный экран. Используйте его меню полного экрана.'));}catch(_){notify('Полный экран можно выбрать в меню браузера.');}
  }
  function fullscreenChanged(){root.querySelector('#wwu-fullscreen').textContent=(document.fullscreenElement||document.webkitFullscreenElement)?'Выйти из полного экрана':'Полный экран';fit();}
  root.querySelector('#wwu-auto').addEventListener('click',()=>setAuto(!autoRotate));
  root.querySelector('#wwu-tv').addEventListener('click',()=>setTV(!tvMode,true));
  root.querySelector('#wwu-fullscreen').addEventListener('click',fullscreen);
  root.querySelector('#wwu-menu').addEventListener('click',()=>showMenu(!menuOpen));
  root.querySelector('#wwu-close-menu').addEventListener('click',()=>showMenu(false));
  root.querySelector('#wwu-home').addEventListener('click',()=>{generation++;yaw=-18;pitch=-15;zoom=1;choose('all');showMenu(false);});
  document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);
  function menuFocus(direction){
    const items=Array.from(root.querySelectorAll('button,select')).filter(el=>!el.disabled&&el.getBoundingClientRect().width&&el.getBoundingClientRect().height);
    const current=document.activeElement,box=current.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
    let best=null,score=Infinity;
    for(const el of items){if(el===current)continue;const b=el.getBoundingClientRect(),dx=b.left+b.width/2-x,dy=b.top+b.height/2-y;
      const along=direction==='ArrowLeft'?-dx:direction==='ArrowRight'?dx:direction==='ArrowUp'?-dy:dy;
      const across=(direction==='ArrowLeft'||direction==='ArrowRight')?Math.abs(dy):Math.abs(dx);
      if(along>5&&along+across*2<score){score=along+across*2;best=el;}
    }
    if(best)best.focus();
  }
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    const codes={37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',13:'Enter',27:'Escape',8:'Backspace',10009:'Back',461:'Back'};
    const key=(e.key&&e.key!=='Unidentified')?e.key:codes[e.keyCode];
    const back=key==='Escape'||key==='Backspace'||key==='Back'||e.keyCode===10009||e.keyCode===461;
    if(tvMode&&menuOpen){
      if(back){e.preventDefault();showMenu(false);return;}
      if(key&&key.indexOf('Arrow')===0){
        if(e.target.tagName==='SELECT'&&(key==='ArrowUp'||key==='ArrowDown'))return;
        if(e.target===nodeSelect&&key==='ArrowRight'&&!linkSelect.disabled){e.preventDefault();linkSelect.focus();return;}
        if(e.target===linkSelect&&key==='ArrowLeft'){e.preventDefault();nodeSelect.focus();return;}
        e.preventDefault();menuFocus(key);return;
      }
      if(key==='Tab'){
        const items=Array.from(root.querySelectorAll('button,select')).filter(el=>!el.disabled&&el.getBoundingClientRect().width&&el.getBoundingClientRect().height);
        const i=items.indexOf(document.activeElement);e.preventDefault();items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus();
      }
      return;
    }
    const sceneActive=tvMode||e.target===canvas||e.target===document.body;
    if(!sceneActive)return;
    if(key&&key.indexOf('Arrow')===0){
      e.preventDefault();setAuto(false);generation++;
      if(key==='ArrowLeft')yaw-=6;if(key==='ArrowRight')yaw+=6;
      if(key==='ArrowUp')pitch=Math.min(89,pitch+6);if(key==='ArrowDown')pitch=Math.max(-89,pitch-6);
      schedule();return;
    }
    if(key==='Enter'&&tvMode){e.preventDefault();showMenu(true);return;}
    if(key==='Enter'&&!tvMode){e.preventDefault();nodeSelect.focus();return;}
    if(key===' '||key==='Spacebar'){e.preventDefault();setAuto(!autoRotate);return;}
    if(key==='+'||key==='='){e.preventDefault();zoom=Math.min(1.85,zoom*1.15);schedule();}
    if(key==='-'){e.preventDefault();zoom=Math.max(.65,zoom/1.15);schedule();}
    if(key==='f'||key==='F'){e.preventDefault();fullscreen();}
  });
  if(window.ResizeObserver)new ResizeObserver(fit).observe(canvas);else window.addEventListener('resize',fit);
  new MutationObserver(palette).observe(document.documentElement,{attributes:true,attributeFilter:['style','class','data-theme']});
  const motionChanged=()=>{if(reduced.matches)setAuto(false);};
  if(reduced.addEventListener)reduced.addEventListener('change',motionChanged);else if(reduced.addListener)reduced.addListener(motionChanged);
  setTV(tvMode,false);palette();fit();setAuto(tvMode&&!reduced.matches);
})();
