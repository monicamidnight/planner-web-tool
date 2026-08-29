import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import {loadWorldState,saveWorldState,resetWorldState,transact,giveItem,hasItem} from './world-state.js';

const $=id=>document.getElementById(id);
const canvas=$('world'),viewport=$('viewport'),entry=$('entry'),enter=$('enter');
const promptEl=$('prompt'),toastEl=$('toast'),dialogueEl=$('dialogue'),speakerEl=$('speaker'),dialogueTextEl=$('dialogueText');
const locationEl=$('location'),objectiveEl=$('objective'),inventoryEl=$('inventory');

let state=loadWorldState();
let dialogue=null;
let toastTimer=0;
let lastSave=performance.now();

const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.06;
renderer.shadowMap.enabled=false;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x120c14);
scene.fog=new THREE.Fog(0x190f1a,14,72);

const camera=new THREE.PerspectiveCamera(67,16/9,.05,140);
camera.rotation.order='YXZ';
camera.position.set(state.player.position.x,state.player.position.y,state.player.position.z);
camera.rotation.y=state.player.yaw||0;
camera.rotation.x=state.player.pitch||0;

scene.add(new THREE.HemisphereLight(0x7a5c72,0x111014,1.05));
const warm=new THREE.DirectionalLight(0xffd18a,.75);warm.position.set(-8,14,9);scene.add(warm);
const fill=new THREE.DirectionalLight(0x6cbf8a,.34);fill.position.set(10,7,-12);scene.add(fill);

const GEO_BOX=new THREE.BoxGeometry(1,1,1);
const GEO_PLANE=new THREE.PlaneGeometry(1,1);
const GEO_CYL=new THREE.CylinderGeometry(.5,.5,1,8,1,false);
const C={black:0x08090b,charcoal:0x1a191f,steel:0x34333b,grey:0x656168,off:0xf0e7d7,amber:0xffcf59,pink:0xff3e97,green:0x75d169,rust:0xb25a38,wine:0x7f274f,plum:0x321626,petrol:0x123129,teal:0x2ca88f,cream:0xffe3a4,orange:0xe7793c};

function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingEnabled=false;draw(g,w,h);const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;return t;}
function pixelTexture(base,seam='#0c0b0e',accent='#544b58'){
  return canvasTexture(64,64,(g,w,h)=>{g.fillStyle=seam;g.fillRect(0,0,w,h);for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){const n=((x+y)/4)%4;g.fillStyle=n===0?accent:base;g.globalAlpha=n===0?.42:1;g.fillRect(x+1,y+1,3,3);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(x+1,y+1,3,1);}g.globalAlpha=1;});
}
function lambert(color,map=null){return new THREE.MeshLambertMaterial({color,map,fog:true});}
function basic(color,opacity=1){return new THREE.MeshBasicMaterial({color,fog:true,transparent:opacity<1,opacity,depthWrite:opacity>=1});}
const mats={
  road:lambert(0xffffff,pixelTexture('#111217','#050609','#24252d')),
  walk:lambert(0xffffff,pixelTexture('#4c4850','#211f25','#716b76')),
  brick:lambert(0xffffff,pixelTexture('#29151f','#0e0a0f','#6b2847')),
  green:lambert(0xffffff,pixelTexture('#14251f','#09100d','#346a58')),
  brown:lambert(0xffffff,pixelTexture('#291a15','#0f0b09','#70402b')),
  plaster:lambert(0xffffff,pixelTexture('#2a252d','#121015','#514957')),
  dark:lambert(C.charcoal),steel:lambert(C.steel),off:lambert(C.off),rust:lambert(C.rust),wine:lambert(C.wine),
  amber:basic(C.amber),pink:basic(C.pink),greenGlow:basic(C.green),cream:basic(C.cream),black:lambert(C.black)
};
function box(w,h,d,mat,x,y,z,parent){const m=new THREE.Mesh(GEO_BOX,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;}
function plane(w,h,mat,x,y,z,rx=0,ry=0,rz=0,parent){const m=new THREE.Mesh(GEO_PLANE,mat);m.scale.set(w,h,1);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);return m;}
function cyl(r,h,mat,x,y,z,parent){const m=new THREE.Mesh(GEO_CYL,mat);m.scale.set(r*2,h,r*2);m.position.set(x,y,z);parent.add(m);return m;}

const exterior=new THREE.Group(),interior=new THREE.Group();scene.add(exterior,interior);
const colliders={
  'loc.conveyor_club.exterior':[],
  'loc.conveyor_club.interior':[]
};
function collider(loc,minX,maxX,minZ,maxZ){colliders[loc].push({minX,maxX,minZ,maxZ});}
function building(parent,x,z,w,d,h,mat){box(w,h,d,mat,x,h/2,z,parent);return {x,z,w,d,h};}
function windowBlock(parent,x,y,z,color,ry=0){const m=box(.12,.62,.78,basic(color),x,y,z,parent);m.rotation.y=ry;return m;}
function glowPad(parent,x,z,color,w=3,d=4){const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.07,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});return plane(w,d,mat,x,.015,z,-Math.PI/2,0,0,parent);}
function lamp(parent,x,z){box(.12,2.5,.12,mats.steel,x,1.25,z,parent);box(.4,.32,.4,mats.dark,x,2.62,z,parent);box(.25,.18,.25,mats.cream,x,2.62,z,parent);glowPad(parent,x,z,C.amber,2.2,3.5);}
function bench(parent,x,z,ry=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;parent.add(g);box(1.5,.14,.42,mats.rust,0,.48,0,g);box(1.5,.6,.1,mats.rust,0,.82,.16,g);box(.09,.46,.09,mats.steel,-.55,.23,0,g);box(.09,.46,.09,mats.steel,.55,.23,0,g);}
function busShelter(parent,x,z){const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);for(const sx of [-1.35,1.35])box(.09,2.2,.09,mats.steel,sx,1.1,0,g);box(3,.12,1.3,mats.dark,0,2.2,0,g);box(2.75,.05,1.05,basic(0xffd15a,.75),0,2.1,0,g);bench(g,0,.1,0);}
function lowCar(parent,color){const g=new THREE.Group();parent.add(g);box(1.7,.45,2.8,lambert(color),0,.4,0,g);box(1.35,.42,1.35,mats.dark,0,.82,-.05,g);for(const sx of [-.84,.84])for(const sz of [-.92,.92])box(.2,.38,.48,mats.black,sx,.3,sz,g);box(.22,.16,.12,mats.amber,-.52,.48,-1.46,g);box(.22,.16,.12,mats.amber,.52,.48,-1.46,g);return g;}

function buildExterior(){
  box(12,.08,88,mats.road,0,-.04,0,exterior);
  box(88,.08,12,mats.road,0,-.035,-8,exterior);
  box(4,.12,88,mats.walk,-8,.02,0,exterior);box(4,.12,88,mats.walk,8,.02,0,exterior);
  box(88,.12,4,mats.walk,0,.025,-16,exterior);box(88,.12,4,mats.walk,0,.025,0,exterior);
  for(let z=-38;z<40;z+=8)box(.12,.02,3,mats.cream,0,.02,z,exterior);
  for(let x=-36;x<38;x+=8)box(3,.02,.12,mats.cream,x,.02,-8,exterior);
  for(let x=-5;x<=5;x+=2)box(1.1,.025,3,mats.off,x,.03,-7.9,exterior);

  building(exterior,-11,-5.8,6,17,6.4,mats.brick);
  collider('loc.conveyor_club.exterior',-14.1,-8.25,-14.2,2.7);
  box(.35,3.1,2.3,mats.dark,-8.08,1.55,-4.0,exterior);
  box(.18,2.65,1.75,basic(0x3f2b38,.62),-7.86,1.45,-4.0,exterior);
  windowBlock(exterior,-7.78,4.45,-8.6,C.pink,Math.PI/2);windowBlock(exterior,-7.78,4.45,-5.8,C.amber,Math.PI/2);windowBlock(exterior,-7.78,4.45,-2.9,C.green,Math.PI/2);
  box(1.05,.12,16,mats.pink,-7.9,2.65,-5.7,exterior);glowPad(exterior,-6.1,-5.8,C.pink,4.2,12);

  building(exterior,12,-7,6,15,5.6,mats.green);
  collider('loc.conveyor_club.exterior',8.3,15.2,-14.5,.8);
  windowBlock(exterior,8.2,3.9,-10,C.amber,-Math.PI/2);windowBlock(exterior,8.2,3.9,-6.8,C.green,-Math.PI/2);windowBlock(exterior,8.2,3.9,-3.7,C.amber,-Math.PI/2);
  box(1.05,.12,14.6,mats.amber,7.9,2.5,-7,exterior);glowPad(exterior,6.1,-7,C.amber,4,11);

  for(const z of [11,22,33,-26,-36]){building(exterior,-12,z,6,8,4.2,z%2?mats.brown:mats.plaster);collider('loc.conveyor_club.exterior',-15.2,-8.4,z-4.2,z+4.2);}
  for(const z of [9,20,31,-27,-38]){building(exterior,12,z,6,8,4.5,z%2?mats.green:mats.plaster);collider('loc.conveyor_club.exterior',8.4,15.2,z-4.2,z+4.2);}

  busShelter(exterior,-3.2,8.3);lamp(exterior,-6.2,6);lamp(exterior,6.2,5);lamp(exterior,-6.2,-19);lamp(exterior,6.2,-21);bench(exterior,6.6,10,Math.PI/2);
  for(const [x,z,c] of [[-7.8,17,C.pink],[7.8,15,C.amber],[-7.8,28,C.green],[7.8,29,C.pink]])glowPad(exterior,x,z,c,3,5);
  for(let i=0;i<10;i++){const x=i%2?-18:18;const z=-34+i*8;box(.8,1.1,.8,i%3===0?mats.rust:mats.dark,x,.55,z,exterior);}
}

function buildInterior(){
  box(16,.12,14,mats.walk,0,0,0,interior);
  box(16,.25,.25,mats.dark,0,2.9,-7,interior);box(16,.25,.25,mats.dark,0,2.9,7,interior);
  box(.25,5.8,14,mats.brick,-8,2.9,0,interior);box(.25,5.8,14,mats.brick,8,2.9,0,interior);
  box(16,.25,.25,mats.brick,0,2.9,-7,interior);box(16,.25,.25,mats.brick,0,2.9,7,interior);
  collider('loc.conveyor_club.interior',-8.4,-7.6,-7.2,7.2);collider('loc.conveyor_club.interior',7.6,8.4,-7.2,7.2);collider('loc.conveyor_club.interior',-8.4,8.4,-7.3,-6.6);
  for(let x=-6;x<=6;x+=3){box(1.5,.9,.9,mats.wine,x,.45,-2.6,interior);box(1.4,.75,.7,mats.rust,x,.38,1.7,interior);}
  box(5.4,1.05,1.05,mats.rust,4.4,.53,4.8,interior);for(let x=2.3;x<7;x+=1.15)cyl(.23,.65,mats.steel,x,.33,3.7,interior);
  box(6,.3,3,mats.dark,-4.5,.15,4.8,interior);box(5.2,.12,2.2,mats.pink,-4.5,.36,4.8,interior);glowPad(interior,-4.5,4.3,C.pink,5,4);
  windowBlock(interior,-7.82,3.7,-2.5,C.pink,Math.PI/2);windowBlock(interior,-7.82,3.7,1.0,C.amber,Math.PI/2);windowBlock(interior,7.82,3.7,-1.5,C.green,-Math.PI/2);
}

buildExterior();buildInterior();

function robotTexture(variant=0){
  const patterns=[['..HH..','.HHHH.','H.OO.H','HHHHHH','..BB..','.BBBB.','B.BB.B','..LL..','.L..L.'],['..HH..','.HAAH.','H....H','HHHHHH','.BBBB.','BB..BB','..BB..','..LL..','.L..L.'],['.HHHH.','HH..HH','H.AA.H','HHHHHH','..BB..','BBBBBB','.B..B.','..LL..','.L..L.']];
  const maps=[{H:'#f0e7d7',O:'#ff3e97',B:'#6d666c',L:'#ffd15a'},{H:'#75d169',A:'#ffd15a',B:'#7f274f',L:'#f0e7d7'},{H:'#c9c2b8',A:'#75d169',B:'#2ca88f',L:'#ff3e97'}];
  const p=patterns[variant%3],map=maps[variant%3];
  return canvasTexture(6,9,(g)=>{g.clearRect(0,0,6,9);p.forEach((row,y)=>[...row].forEach((ch,x)=>{if(map[ch]){g.fillStyle=map[ch];g.fillRect(x,y,1,1);}}));});
}
function makeActor(entityId,locationId,x,z,variant,route=null){
  const tex=robotTexture(variant);const mat=new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.1,depthWrite:true});const s=new THREE.Sprite(mat);s.scale.set(1.3,1.95,1);s.position.set(x,.98,z);s.userData={entityId,locationId,route,routeIndex:0,speed:.8+variant*.13,phase:Math.random()*6.28};(locationId==='loc.conveyor_club.exterior'?exterior:interior).add(s);return s;
}
const actorRoutes={
  mechanic:[[-5.7,6.2],[-5.7,-1.4],[-2.0,-1.4],[-2.0,6.2]],
  regular:[[5.8,8.5],[5.8,-12],[2.0,-12],[2.0,8.5]],
  walkerA:[[-6.0,24],[-6.0,12],[-2.1,12],[-2.1,24]],
  walkerB:[[6.0,28],[6.0,14],[2.2,14],[2.2,28]],
  walkerC:[[-5.7,-22],[-5.7,-34],[-2.2,-34],[-2.2,-22]]
};
const actors=[
  makeActor('npc.street_mechanic','loc.conveyor_club.exterior',-5.7,6.2,0,actorRoutes.mechanic),
  makeActor('npc.night_regular','loc.conveyor_club.exterior',5.8,8.5,1,actorRoutes.regular),
  makeActor('npc.walker.a','loc.conveyor_club.exterior',-6,24,2,actorRoutes.walkerA),
  makeActor('npc.walker.b','loc.conveyor_club.exterior',6,28,0,actorRoutes.walkerB),
  makeActor('npc.walker.c','loc.conveyor_club.exterior',-5.7,-22,1,actorRoutes.walkerC),
  makeActor('npc.club_attendant','loc.conveyor_club.interior',4.6,3.8,2,null)
];

const cars=[];
const carRoutes=[
  [[-1.8,42],[-1.8,-42]],[[1.8,-42],[1.8,42]],
  [[-38,-10],[38,-10]],[[38,-6],[-38,-6]]
];
function addCar(route,color,offset){const g=lowCar(exterior,color);const c={g,route,index:0,speed:4.0+offset*.35};const p=route[offset%route.length];g.position.set(p[0],0,p[1]);cars.push(c);}
addCar(carRoutes[0],C.wine,0);addCar(carRoutes[1],C.petrol,1);addCar(carRoutes[2],C.rust,0);addCar(carRoutes[3],C.plum,1);

let itemMesh=null;
function syncItem(){
  const e=state.entities['item.transit_chip'];
  if(itemMesh){exterior.remove(itemMesh);itemMesh=null;}
  if(e?.present&&e.locationId==='loc.conveyor_club.exterior'){
    const g=new THREE.Group();g.position.set(e.position.x,0,e.position.z);exterior.add(g);box(.42,.18,.42,mats.amber,0,.18,0,g);box(.22,.08,.22,mats.pink,0,.32,0,g);itemMesh=g;
  }
}
syncItem();

function setLocation(id,position){
  state.player.locationId=id;state.player.position={x:position.x,y:1.72,z:position.z};
  camera.position.set(position.x,1.72,position.z);camera.rotation.x=0;camera.rotation.y=0;
  state.player.yaw=0;state.player.pitch=0;saveWorldState(state);syncVisibility();updateHud();
}
function syncVisibility(){const out=state.player.locationId==='loc.conveyor_club.exterior';exterior.visible=out;interior.visible=!out;scene.fog.near=out?14:7;scene.fog.far=out?72:28;}
syncVisibility();

const keys=new Set();
const input={locked:false,forward:false,reverse:false,dx:0,dy:0};
enter.addEventListener('click',()=>canvas.requestPointerLock?.());
document.addEventListener('pointerlockchange',()=>{input.locked=document.pointerLockElement===canvas;entry.classList.toggle('hidden',input.locked);if(!input.locked){input.forward=input.reverse=false;savePlayer();}});
document.addEventListener('pointerlockerror',()=>toast('Mouse capture was blocked. Click to try again.'));
document.addEventListener('mousemove',e=>{if(!input.locked||dialogue)return;input.dx+=Math.max(-60,Math.min(60,e.movementX||0));input.dy+=Math.max(-60,Math.min(60,e.movementY||0));});
viewport.addEventListener('mousedown',e=>{if(!input.locked)return;if(dialogue){advanceDialogue();return;}if(e.button===0)input.forward=true;if(e.button===2)input.reverse=true;e.preventDefault();});
window.addEventListener('mouseup',e=>{if(e.button===0)input.forward=false;if(e.button===2)input.reverse=false;});viewport.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyE'&&!e.repeat){if(dialogue)advanceDialogue();else interact();}});window.addEventListener('keyup',e=>keys.delete(e.code));

function savePlayer(){state.player.position={x:+camera.position.x.toFixed(3),y:1.72,z:+camera.position.z.toFixed(3)};state.player.yaw=camera.rotation.y;state.player.pitch=camera.rotation.x;saveWorldState(state);lastSave=performance.now();}
function blocked(x,z){return colliders[state.player.locationId].some(c=>x>c.minX&&x<c.maxX&&z>c.minZ&&z<c.maxZ);}
function updatePlayer(dt){
  if(!input.locked||dialogue)return;
  camera.rotation.y-=input.dx*.00235;camera.rotation.x-=input.dy*.00205;camera.rotation.x=Math.max(-1.18,Math.min(1.18,camera.rotation.x));input.dx*=.15;input.dy*=.15;
  const forward=(keys.has('KeyW')||input.forward?1:0)-(keys.has('KeyS')||input.reverse?1:0);const strafe=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  if(forward||strafe){const yaw=camera.rotation.y,spd=4.0*dt;const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*spd;const dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*spd;const nx=camera.position.x+dx,nz=camera.position.z+dz;if(!blocked(nx,camera.position.z))camera.position.x=nx;if(!blocked(camera.position.x,nz))camera.position.z=nz;}
  camera.position.y=1.72;
  if(performance.now()-lastSave>1800)savePlayer();
}

function updateRoute(obj,dt){if(!obj.userData.route)return;const route=obj.userData.route;const i=obj.userData.routeIndex;const target=route[(i+1)%route.length];const dx=target[0]-obj.position.x,dz=target[1]-obj.position.z,dist=Math.hypot(dx,dz);if(dist<.12){obj.userData.routeIndex=(i+1)%route.length;return;}obj.position.x+=dx/dist*obj.userData.speed*dt;obj.position.z+=dz/dist*obj.userData.speed*dt;obj.position.y=.98+Math.sin(performance.now()*.004+obj.userData.phase)*.035;}
function updateCar(c,dt){const route=c.route,target=route[(c.index+1)%route.length],dx=target[0]-c.g.position.x,dz=target[1]-c.g.position.z,dist=Math.hypot(dx,dz);if(dist<.2){c.index=(c.index+1)%route.length;return;}c.g.position.x+=dx/dist*c.speed*dt;c.g.position.z+=dz/dist*c.speed*dt;c.g.rotation.y=Math.atan2(dx,dz);}

function distanceXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function interactionCandidate(){
  const loc=state.player.locationId,p=camera.position,cands=[];
  const chip=state.entities['item.transit_chip'];if(loc==='loc.conveyor_club.exterior'&&chip?.present)cands.push({type:'item',id:'item.transit_chip',position:new THREE.Vector3(chip.position.x,0,chip.position.z),label:'E — TAKE TRANSIT CHIP'});
  if(loc==='loc.conveyor_club.exterior')cands.push({type:'door',id:'door.club.in',position:new THREE.Vector3(-7.65,0,-4),label:'E — ENTER CONVEYOR CLUB'});
  else cands.push({type:'door',id:'door.club.out',position:new THREE.Vector3(0,0,6.2),label:'E — EXIT TO STREET'});
  for(const a of actors){if(a.userData.locationId!==loc)continue;if(a.userData.entityId.startsWith('npc.walker'))continue;cands.push({type:'npc',id:a.userData.entityId,position:a.position,label:`E — TALK TO ${(state.entities[a.userData.entityId]?.name||'ROBOT').toUpperCase()}`});}
  let best=null,bd=999;for(const c of cands){const d=distanceXZ(p,c.position);if(d<bd){bd=d;best=c;}}return bd<=2.25?best:null;
}
function interact(){const c=interactionCandidate();if(!c)return;if(c.type==='item')takeChip();if(c.type==='door')useDoor(c.id);if(c.type==='npc')talk(c.id);}

function takeChip(){
  transact(state,'TAKE_ITEM',{itemId:'item.transit_chip'},s=>{giveItem(s,'item.transit_chip');s.flags.transitChipSeen=true;s.flags.transitChipCollected=true;s.quests['quest.first_night'].stage=Math.max(1,s.quests['quest.first_night'].stage);});syncItem();toast('TRANSIT CHIP ACQUIRED');updateHud();
}
function useDoor(id){
  if(id==='door.club.in'){
    transact(state,'MOVE_ROUTE',{routeId:'route.club_front_door',to:'loc.conveyor_club.interior'},s=>{s.flags.clubEntered=true;s.quests['quest.first_night'].stage=Math.max(s.flags.mechanicHelped?3:2,s.quests['quest.first_night'].stage);});setLocation('loc.conveyor_club.interior',{x:0,z:5.2});toast('ENTERED THE CONVEYOR CLUB');
  }else{transact(state,'MOVE_ROUTE',{routeId:'route.club_front_door',to:'loc.conveyor_club.exterior'},()=>{});setLocation('loc.conveyor_club.exterior',{x:-6.1,z:-4});toast('BACK ON THE STREET');}
}
function talk(id){
  const e=state.entities[id];if(!e)return;
  if(id==='npc.street_mechanic'){
    const lines=hasItem(state,'item.transit_chip')?['There it is. I watched that little chip skid under the bus shelter.','Keep it. The Club uses those old transit tags for half the machines nobody remembers installing.','Go inside. If anybody asks, I did not tell you that.']:['You lose something? I saw a yellow chip bounce near the bus shelter.','Look by the bench. Streetlights make everything look important after midnight.'];
    if(hasItem(state,'item.transit_chip')&&!state.flags.mechanicHelped)transact(state,'NPC_CONVERSATION',{npcId:id,topic:'transit_chip'},s=>{s.entities[id].met=true;s.flags.mechanicHelped=true;s.quests['quest.first_night'].stage=Math.max(2,s.quests['quest.first_night'].stage);});else transact(state,'NPC_CONVERSATION',{npcId:id},s=>{s.entities[id].met=true;});
    showDialogue(e.name,lines);updateHud();return;
  }
  if(id==='npc.night_regular'){transact(state,'NPC_CONVERSATION',{npcId:id},s=>{s.entities[id].met=true;});showDialogue(e.name,['This block never really closes. It just changes which machines are awake.','Watch the traffic. The little rust car thinks the crosswalk is a suggestion.']);return;}
  if(id==='npc.club_attendant'){transact(state,'NPC_CONVERSATION',{npcId:id},s=>{s.entities[id].met=true;});showDialogue(e.name,hasItem(state,'item.transit_chip')?['Mechanic sent you in with that thing? Of course they did.','Welcome to the Club. The city keeps moving whether you are looking at it or not.']:['You made it in without finding the chip. That is probably fine. Probably.']);}
}
function showDialogue(speaker,lines){dialogue={speaker,lines,index:0};speakerEl.textContent=speaker.toUpperCase();dialogueTextEl.textContent=lines[0];dialogueEl.classList.remove('hidden');input.forward=input.reverse=false;}
function advanceDialogue(){if(!dialogue)return;dialogue.index++;if(dialogue.index>=dialogue.lines.length){dialogue=null;dialogueEl.classList.add('hidden');return;}dialogueTextEl.textContent=dialogue.lines[dialogue.index];}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1600);}

function objective(){if(!state.flags.transitChipCollected)return'Find the transit chip near the bus shelter.';if(!state.flags.mechanicHelped)return'Show the transit chip to the Street Mechanic.';if(!state.flags.clubEntered)return'Enter the Conveyor Club.';return'Explore. Talk to robots. See what keeps moving when you leave.';}
function updateHud(){locationEl.textContent=state.player.locationId==='loc.conveyor_club.exterior'?'CONVEYOR CLUB — BUS STOP':'CONVEYOR CLUB — MAIN FLOOR';objectiveEl.textContent=objective();inventoryEl.textContent=state.player.inventory.length?state.player.inventory.map(id=>state.entities[id]?.name||id).join(' · '):'EMPTY';}
updateHud();

$('fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});
$('reset').addEventListener('click',()=>{if(confirm('Reset Robot World 3D persistent prototype state?')){state=resetWorldState();location.reload();}});

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();

let last=performance.now(),acc=0;const frameStep=1/24;
function animate(now){requestAnimationFrame(animate);const raw=Math.min(.08,(now-last)/1000);last=now;acc+=raw;if(acc<frameStep)return;const dt=acc;acc=0;updatePlayer(dt);for(const a of actors)if(a.userData.locationId===state.player.locationId)updateRoute(a,dt);if(state.player.locationId==='loc.conveyor_club.exterior')for(const c of cars)updateCar(c,dt);const c=interactionCandidate();promptEl.textContent=c?.label||'';promptEl.classList.toggle('show',!!c&&!dialogue);renderer.render(scene,camera);}
requestAnimationFrame(animate);
