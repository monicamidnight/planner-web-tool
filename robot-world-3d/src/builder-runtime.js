const api=window.RW3D_INTERNAL;
if(!api)throw new Error('RW3D builder: runtime bridge missing');
const {THREE,camera,exterior,mats,C,box,cyl,glowPad,colliders,state}=api;

const STORAGE='robot-world-3d:builder:v1';
const root=document.body;
const entry=document.getElementById('entry');
const hud=document.getElementById('hud');
const promptEl=document.getElementById('prompt');
const viewport=document.getElementById('viewport');

const structural={brick:mats.brick,green:mats.green,brown:mats.brown,plaster:mats.plaster};
const accentColors={pink:C.pink,amber:C.amber,green:C.green,teal:C.teal};
const raycaster=new THREE.Raycaster();
const mouse=new THREE.Vector2();
const ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const hit=new THREE.Vector3();
const buildKeys=new Set();
let rightDrag=false,lastX=0,lastY=0,selected=null,selector=null,buildView=null;
let layout=loadLayout();

function loadLayout(){
  try{return {...{objects:[],baseOverrides:{}},...JSON.parse(localStorage.getItem(STORAGE)||'{}')};}
  catch{return {objects:[],baseOverrides:{}};}
}
function saveLayout(){localStorage.setItem(STORAGE,JSON.stringify(layout));status('SAVED');rebuildBuilderColliders();}
function uid(){return 'custom.'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function snap(v,g){return Math.round(v/g)*g;}
function num(id,fallback){const n=Number(document.getElementById(id)?.value);return Number.isFinite(n)?n:fallback;}
function val(id,fallback){return document.getElementById(id)?.value||fallback;}

const style=document.createElement('style');
style.textContent=`
#rwModeBar{position:fixed;right:66px;top:14px;z-index:40;display:flex;border:1px solid rgba(255,215,101,.45);background:rgba(8,7,10,.9)}
#rwModeBar button{padding:9px 14px;border:0;border-right:1px solid rgba(255,255,255,.12);background:transparent;color:#f4eadb;font:800 11px ui-monospace,monospace;letter-spacing:.08em;cursor:pointer}#rwModeBar button:last-child{border-right:0}#rwModeBar button.on{background:#ffd765;color:#151016}
#rwBuilder{position:fixed;right:14px;top:64px;z-index:39;width:260px;max-height:calc(100vh - 80px);overflow:auto;padding:12px;border:1px solid rgba(255,215,101,.48);background:rgba(10,8,12,.94);color:#f4eadb;font:11px ui-monospace,monospace;display:none}
body.rw-build #rwBuilder{display:block}body.rw-build #hud{opacity:.16}body.rw-build #prompt{display:none}body.rw-build #reset{display:none}
#rwBuilder h3{margin:0 0 10px;color:#ffd765;font-size:12px;letter-spacing:.09em}#rwBuilder label{display:block;margin:8px 0 3px;color:#bdb4bf}#rwBuilder select,#rwBuilder input,#rwBuilder button{width:100%;padding:7px;border:1px solid rgba(255,255,255,.16);background:#16131a;color:#f4eadb;font:11px ui-monospace,monospace}#rwBuilder .row{display:grid;grid-template-columns:1fr 1fr;gap:6px}#rwBuilder .triple{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}#rwBuilder button{cursor:pointer;margin-top:6px}#rwBuilder button.hot{border-color:rgba(255,74,163,.65);color:#ff8bc1}#rwBuilder button.go{border-color:rgba(131,219,117,.65);color:#aef1a5}#rwBuilder .hint{margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.1);line-height:1.45;color:#938b97}#rwBuilderStatus{margin-top:8px;color:#83db75;min-height:14px}#rwSelected{color:#ffcf59;word-break:break-all}
`;
document.head.appendChild(style);

const mode=document.createElement('div');mode.id='rwModeBar';mode.innerHTML='<button id="rwPlay" class="on">PLAY</button><button id="rwBuild">BUILD</button>';root.appendChild(mode);
const panel=document.createElement('div');panel.id='rwBuilder';panel.innerHTML=`
<h3>WORLD BUILDER</h3>
<div>SELECTED: <span id="rwSelected">NONE</span></div>
<label>TOOL</label><select id="rwTool"><option value="select">SELECT</option><option value="building">BUILDING</option><option value="bench">BENCH</option><option value="lamp">LAMP</option><option value="crate">CRATE</option></select>
<div class="row"><div><label>GRID</label><select id="rwGrid"><option>.5</option><option selected>1</option><option>2</option></select></div><div><label>MATERIAL</label><select id="rwMat"><option>brick</option><option>green</option><option>brown</option><option>plaster</option></select></div></div>
<label>ACCENT</label><select id="rwAccent"><option>pink</option><option>amber</option><option>green</option><option>teal</option></select>
<label>BUILDING SIZE</label><div class="triple"><input id="rwW" type="number" min="2" max="20" step="1" value="6"><input id="rwD" type="number" min="2" max="24" step="1" value="8"><input id="rwH" type="number" min="2" max="18" step="1" value="5"></div>
<button id="rwApply" class="go">APPLY MATERIAL</button>
<div class="row"><button id="rwRotL">ROTATE -15°</button><button id="rwRotR">ROTATE +15°</button></div>
<div class="row"><button id="rwDup">DUPLICATE</button><button id="rwDelete" class="hot">DELETE</button></div>
<button id="rwClear" class="hot">CLEAR CUSTOM BUILD</button>
<div id="rwBuilderStatus"></div>
<div class="hint">LEFT CLICK: select / place<br>RIGHT DRAG: look<br>WASD: fly · Q/E: down/up · SHIFT: fast<br>Base façades: material cleanup only.<br>Custom objects: move/rotate/delete and collide in PLAY.</div>`;root.appendChild(panel);

const $=id=>document.getElementById(id);
function status(t){$('rwBuilderStatus').textContent=t;clearTimeout(status.t);status.t=setTimeout(()=>{if($('rwBuilderStatus').textContent===t)$('rwBuilderStatus').textContent='';},1200);}

function makeCustom(data){
  const g=new THREE.Group();g.userData.builderId=data.id;g.userData.builderCustom=true;g.userData.kind=data.kind;exterior.add(g);
  const mat=structural[data.material]||mats.brick, accent=accentColors[data.accent]||C.pink;
  if(data.kind==='building'){
    box(data.w,data.h,data.d,mat,0,data.h/2,0,g);
    box(data.w+.2,.16,data.d+.2,mats.dark,0,data.h+.08,0,g);
    const fx=-data.w/2-.01;
    for(let z=-data.d*.32;z<=data.d*.32;z+=Math.max(1.8,data.d*.26))box(.12,.72,.9,mats.dark,fx,data.h*.62,z,g),box(.13,.52,.7,mats.amber,fx-.03,data.h*.62,z,g);
    box(.22,.12,data.d*.82,mats.pink,fx-.08,2.45,0,g);glowPad(g,fx-1.2,0,accent,3.4,data.d*.78,.08);
  }else if(data.kind==='bench'){
    box(1.55,.14,.45,mats.rust,0,.5,0,g);box(1.55,.62,.11,mats.rust,0,.84,.17,g);box(.1,.48,.1,mats.steel,-.58,.24,0,g);box(.1,.48,.1,mats.steel,.58,.24,0,g);
  }else if(data.kind==='lamp'){
    box(.12,2.6,.12,mats.steel,0,1.3,0,g);box(.45,.34,.45,mats.dark,0,2.7,0,g);box(.28,.22,.28,mats.amber,0,2.72,0,g);glowPad(g,0,0,accent,3,5,.08);
  }else{
    box(.8,.8,.8,mats.rust,0,.4,0,g);box(.86,.08,.08,mats.amber,0,.43,.42,g);
  }
  g.position.set(data.x,data.y||0,data.z);g.rotation.y=data.ry||0;g.userData.builderData=data;return g;
}

function allBuilderGroups(){const out=[];exterior.traverse(o=>{if(o.userData?.builderId)out.push(o)});return out;}
function findGroup(obj){let o=obj;while(o&&o!==exterior){if(o.userData?.builderId)return o;o=o.parent;}return null;}
function baseGroups(){return allBuilderGroups().filter(g=>g.userData.builderBase);}
function customGroups(){return allBuilderGroups().filter(g=>g.userData.builderCustom);}

function applyMaterial(group,key){
  const target=structural[key]||mats.brick;
  const sourceSet=new Set(Object.values(structural));
  group.traverse(o=>{if(o.isMesh&&sourceSet.has(o.material))o.material=target;});
}
function applyBaseOverrides(){
  for(const g of baseGroups()){
    const ov=layout.baseOverrides[g.userData.builderId];
    if(ov?.material)applyMaterial(g,ov.material);
  }
}
function loadCustom(){for(const d of layout.objects)makeCustom(d);}
function dataFor(group){return group?.userData?.builderData||null;}

function rebuildBuilderColliders(){
  const list=colliders['loc.conveyor_club.exterior'];
  for(let i=list.length-1;i>=0;i--)if(list[i].builderId)list.splice(i,1);
  for(const g of customGroups()){
    const d=dataFor(g);if(!d||d.kind!=='building')continue;
    const c=Math.abs(Math.cos(g.rotation.y)),s=Math.abs(Math.sin(g.rotation.y));
    const aw=d.w*c+d.d*s,ad=d.w*s+d.d*c;
    list.push({minX:g.position.x-aw/2,maxX:g.position.x+aw/2,minZ:g.position.z-ad/2,maxZ:g.position.z+ad/2,builderId:d.id});
  }
}

function select(group){selected=group;if(selector){exterior.remove(selector);selector.geometry?.dispose?.();selector.material?.dispose?.();selector=null;}if(group){selector=new THREE.BoxHelper(group,0xffd765);exterior.add(selector);$('rwSelected').textContent=group.userData.builderId+(group.userData.builderBase?' [BASE]':'');}else $('rwSelected').textContent='NONE';}
function updateSelector(){if(selector&&selected)selector.update();}

function groundPoint(ev){const r=viewport.getBoundingClientRect();mouse.x=((ev.clientX-r.left)/r.width)*2-1;mouse.y=-((ev.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(mouse,camera);return raycaster.ray.intersectPlane(ground,hit)?hit.clone():null;}
function pick(ev){const r=viewport.getBoundingClientRect();mouse.x=((ev.clientX-r.left)/r.width)*2-1;mouse.y=-((ev.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(mouse,camera);const meshes=[];exterior.traverse(o=>{if(o.isMesh&&findGroup(o))meshes.push(o)});const hits=raycaster.intersectObjects(meshes,false);return hits.length?findGroup(hits[0].object):null;}

function place(kind,p){
  const grid=num('rwGrid',1),id=uid();const data={id,kind,x:snap(p.x,grid),y:0,z:snap(p.z,grid),ry:0,w:num('rwW',6),d:num('rwD',8),h:num('rwH',5),material:val('rwMat','brick'),accent:val('rwAccent','pink')};
  layout.objects.push(data);const g=makeCustom(data);saveLayout();select(g);status('PLACED '+kind.toUpperCase());
}
function selectedRecord(){return selected?.userData?.builderCustom?layout.objects.find(o=>o.id===selected.userData.builderId):null;}
function rotateSelected(dir){if(!selected)return;if(selected.userData.builderBase){status('BASE: MATERIAL ONLY');return;}const d=selectedRecord();d.ry=(d.ry||0)+dir*Math.PI/12;selected.rotation.y=d.ry;saveLayout();updateSelector();}
function deleteSelected(){if(!selected)return;if(selected.userData.builderBase){status('BASE CANNOT BE DELETED YET');return;}const id=selected.userData.builderId;layout.objects=layout.objects.filter(o=>o.id!==id);exterior.remove(selected);select(null);saveLayout();}
function duplicateSelected(){const d=selectedRecord();if(!d){status('SELECT CUSTOM OBJECT');return;}const copy={...d,id:uid(),x:d.x+num('rwGrid',1)*2,z:d.z+num('rwGrid',1)*2};layout.objects.push(copy);const g=makeCustom(copy);saveLayout();select(g);}
function applySelectedMaterial(){if(!selected){status('SELECT SOMETHING');return;}const key=val('rwMat','brick');if(selected.userData.builderBase){layout.baseOverrides[selected.userData.builderId]={...(layout.baseOverrides[selected.userData.builderId]||{}),material:key};applyMaterial(selected,key);saveLayout();status('BASE MATERIAL UPDATED');return;}const d=selectedRecord();if(!d)return;d.material=key;const old=selected;exterior.remove(old);const g=makeCustom(d);select(g);saveLayout();}

function enterBuild(){
  if(window.RW3D_BUILDER_ACTIVE)return;window.RW3D_BUILDER_ACTIVE=true;document.exitPointerLock?.();buildView={position:camera.position.clone(),rotation:camera.rotation.clone()};camera.position.y=Math.max(camera.position.y+5,7);camera.rotation.x=-.35;root.classList.add('rw-build');$('rwPlay').classList.remove('on');$('rwBuild').classList.add('on');setTimeout(()=>entry.classList.add('hidden'),30);status('BUILD MODE');
}
function enterPlay(){
  if(!window.RW3D_BUILDER_ACTIVE)return;window.RW3D_BUILDER_ACTIVE=false;root.classList.remove('rw-build');$('rwBuild').classList.remove('on');$('rwPlay').classList.add('on');select(null);const p=state.player.position;camera.position.set(p.x,p.y,p.z);camera.rotation.set(state.player.pitch||0,state.player.yaw||0,0);entry.classList.remove('hidden');status('PLAY MODE');
}

$('rwBuild').onclick=enterBuild;$('rwPlay').onclick=enterPlay;$('rwRotL').onclick=()=>rotateSelected(-1);$('rwRotR').onclick=()=>rotateSelected(1);$('rwDelete').onclick=deleteSelected;$('rwDup').onclick=duplicateSelected;$('rwApply').onclick=applySelectedMaterial;$('rwClear').onclick=()=>{if(!confirm('Delete every custom builder object?'))return;for(const g of customGroups())exterior.remove(g);layout.objects=[];select(null);saveLayout();};

document.addEventListener('pointerlockchange',()=>{if(window.RW3D_BUILDER_ACTIVE)setTimeout(()=>entry.classList.add('hidden'),0);});
viewport.addEventListener('mousedown',ev=>{
  if(!window.RW3D_BUILDER_ACTIVE)return;
  if(ev.button===2){rightDrag=true;lastX=ev.clientX;lastY=ev.clientY;ev.preventDefault();return;}
  if(ev.button!==0)return;
  const tool=val('rwTool','select');if(tool==='select')select(pick(ev));else{const p=groundPoint(ev);if(p)place(tool,p);}ev.preventDefault();
},true);
window.addEventListener('mouseup',ev=>{if(ev.button===2)rightDrag=false;});
window.addEventListener('mousemove',ev=>{if(!window.RW3D_BUILDER_ACTIVE||!rightDrag)return;const dx=ev.clientX-lastX,dy=ev.clientY-lastY;lastX=ev.clientX;lastY=ev.clientY;camera.rotation.order='YXZ';camera.rotation.y-=dx*.004;camera.rotation.x-=dy*.004;camera.rotation.x=Math.max(-1.35,Math.min(1.2,camera.rotation.x));});
window.addEventListener('keydown',ev=>{if(window.RW3D_BUILDER_ACTIVE){buildKeys.add(ev.code);if(ev.code==='Delete')deleteSelected();}});
window.addEventListener('keyup',ev=>buildKeys.delete(ev.code));
viewport.addEventListener('wheel',ev=>{if(!window.RW3D_BUILDER_ACTIVE)return;const f=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);camera.position.addScaledVector(f,ev.deltaY>0?-1.2:1.2);ev.preventDefault();},{passive:false});

function builderLoop(){requestAnimationFrame(builderLoop);if(!window.RW3D_BUILDER_ACTIVE)return;const dt=.016,speed=(buildKeys.has('ShiftLeft')||buildKeys.has('ShiftRight'))?12:5;const f=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);f.y=0;f.normalize();const r=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);r.y=0;r.normalize();if(buildKeys.has('KeyW'))camera.position.addScaledVector(f,speed*dt);if(buildKeys.has('KeyS'))camera.position.addScaledVector(f,-speed*dt);if(buildKeys.has('KeyA'))camera.position.addScaledVector(r,-speed*dt);if(buildKeys.has('KeyD'))camera.position.addScaledVector(r,speed*dt);if(buildKeys.has('KeyE'))camera.position.y+=speed*dt;if(buildKeys.has('KeyQ'))camera.position.y=Math.max(1,camera.position.y-speed*dt);updateSelector();}

window.__RW3D_FACADE_SEQ=window.__RW3D_FACADE_SEQ||0;
loadCustom();applyBaseOverrides();rebuildBuilderColliders();builderLoop();
window.RW3D_BUILDER={enterBuild,enterPlay,layout,saveLayout};
