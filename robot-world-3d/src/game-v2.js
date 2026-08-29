import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import {loadWorldState,saveWorldState,resetWorldState,transact,giveItem,hasItem} from './world-state.js';

const $=id=>document.getElementById(id);
const canvas=$('world'), viewport=$('viewport'), entry=$('entry'), enter=$('enter');
const promptEl=$('prompt'), toastEl=$('toast'), dialogueEl=$('dialogue'), speakerEl=$('speaker'), dialogueTextEl=$('dialogueText');
const locationEl=$('location'), objectiveEl=$('objective'), inventoryEl=$('inventory');

let state=loadWorldState();
let dialogue=null, toastTimer=0, lastSave=performance.now();

const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});
renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.32;
renderer.shadowMap.enabled=false;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x241327);
scene.fog=new THREE.Fog(0x2a172a,18,82);

const camera=new THREE.PerspectiveCamera(67,16/9,.05,150);
camera.rotation.order='YXZ';
camera.position.set(state.player.position.x,state.player.position.y,state.player.position.z);
camera.rotation.y=state.player.yaw||0;
camera.rotation.x=state.player.pitch||0;

scene.add(new THREE.HemisphereLight(0xb985ad,0x1c1720,1.65));
const key=new THREE.DirectionalLight(0xffd9a2,1.25);key.position.set(-10,15,8);scene.add(key);
const fill=new THREE.DirectionalLight(0x8fd993,.78);fill.position.set(10,9,-12);scene.add(fill);

const GEO_BOX=new THREE.BoxGeometry(1,1,1);
const GEO_PLANE=new THREE.PlaneGeometry(1,1);
const GEO_CYL=new THREE.CylinderGeometry(.5,.5,1,8,1,false);

const C={
  black:0x09090b,charcoal:0x242229,steel:0x4d4a54,grey:0x77717d,off:0xf4eadb,
  amber:0xffd765,pink:0xff4aa3,green:0x83db75,rust:0xc6653d,wine:0x8f2c57,
  plum:0x48203c,petrol:0x184237,teal:0x35b29a,cream:0xffe8ae,orange:0xf08a47,
  lilac:0x9b7bc7,sky:0x2b1830
};

function canvasTexture(w,h,draw){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;return t;
}
function pixelTexture(base,seam='#111016',accent='#65596b',cell=4){
  return canvasTexture(64,64,(g,w,h)=>{
    g.fillStyle=seam;g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=cell)for(let x=0;x<w;x+=cell){
      const v=((x/cell)*7+(y/cell)*11)%5;
      g.fillStyle=v===0?accent:base;g.globalAlpha=v===0?.72:1;g.fillRect(x+1,y+1,cell-1,cell-1);
      g.fillStyle='rgba(255,255,255,.12)';g.globalAlpha=.55;g.fillRect(x+1,y+1,cell-1,1);
      g.fillStyle='rgba(0,0,0,.18)';g.fillRect(x+1,y+cell-1,cell-1,1);
    }
    g.globalAlpha=1;
  });
}
function windowTexture(a='#ffd765',b='#83db75'){
  return canvasTexture(32,32,(g,w,h)=>{
    g.fillStyle='#111116';g.fillRect(0,0,w,h);
    for(let y=2;y<h-2;y+=7)for(let x=2;x<w-2;x+=7){
      const on=((x+y)*3)%5!==0;
      g.fillStyle=on?(((x+y)%2)?a:b):'#28242d';
      g.globalAlpha=on?.74:.9;g.fillRect(x,y,5,5);
      if(on){g.fillStyle='rgba(255,255,255,.22)';g.fillRect(x,y,5,1);}
    }
    g.globalAlpha=1;
  });
}
function lambert(color,map=null){return new THREE.MeshLambertMaterial({color,map,fog:true});}
function basic(color,opacity=1){
  return new THREE.MeshBasicMaterial({color,fog:true,transparent:opacity<1,opacity,depthWrite:opacity>=1,side:THREE.DoubleSide});
}
const mats={
  road:lambert(0xffffff,pixelTexture('#1a1b21','#090a0d','#30313a')),
  walk:lambert(0xffffff,pixelTexture('#68616d','#2a272e','#8a808f')),
  brick:lambert(0xffffff,pixelTexture('#3a1e2d','#120d13','#7e3455')),
  green:lambert(0xffffff,pixelTexture('#1d382f','#0c1310','#3c7966')),
  brown:lambert(0xffffff,pixelTexture('#3b251c','#130e0b','#805038')),
  plaster:lambert(0xffffff,pixelTexture('#39313d','#17131a','#65566a')),
  dark:lambert(C.charcoal),steel:lambert(C.steel),off:lambert(C.off),rust:lambert(C.rust),wine:lambert(C.wine),
  amber:basic(C.amber),pink:basic(C.pink),greenGlow:basic(C.green),teal:basic(C.teal),cream:basic(C.cream),black:lambert(C.black)
};

function box(w,h,d,mat,x,y,z,parent){const m=new THREE.Mesh(GEO_BOX,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;}
function plane(w,h,mat,x,y,z,rx=0,ry=0,rz=0,parent){const m=new THREE.Mesh(GEO_PLANE,mat);m.scale.set(w,h,1);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);return m;}
function cyl(r,h,mat,x,y,z,parent){const m=new THREE.Mesh(GEO_CYL,mat);m.scale.set(r*2,h,r*2);m.position.set(x,y,z);parent.add(m);return m;}

const glowTex=canvasTexture(64,64,(g)=>{
  const d=g.createRadialGradient(32,32,1,32,32,31);
  d.addColorStop(0,'rgba(255,255,255,.95)');d.addColorStop(.18,'rgba(255,255,255,.55)');
  d.addColorStop(.55,'rgba(255,255,255,.14)');d.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=d;g.fillRect(0,0,64,64);
});
function glowSprite(parent,x,y,z,color,size=3,opacity=.32){
  const m=new THREE.SpriteMaterial({map:glowTex,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
  const s=new THREE.Sprite(m);s.position.set(x,y,z);s.scale.set(size,size,1);parent.add(s);return s;
}
function glowPad(parent,x,z,color,w=4,d=6,opacity=.11){
  const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  return plane(w,d,mat,x,.018,z,-Math.PI/2,0,0,parent);
}
function windowPanel(parent,x,y,z,w,h,a,b,ry=0){
  const tex=windowTexture(a,b);
  const m=basic(0xffffff,1);m.map=tex;m.needsUpdate=true;
  return plane(w,h,m,x,y,z,0,ry,0,parent);
}
function lightStrip(parent,x,y,z,w,d,color){
  box(w,.08,d,basic(color),x,y,z,parent);glowSprite(parent,x,y+.08,z,color,Math.max(2,w*.7),.18);
}
function lamp(parent,x,z,color=C.amber){
  box(.12,2.55,.12,mats.steel,x,1.275,z,parent);
  box(.44,.34,.44,mats.dark,x,2.67,z,parent);
  box(.28,.22,.28,basic(color),x,2.68,z,parent);
  glowSprite(parent,x,2.68,z,color,2.6,.32);glowPad(parent,x,z,color,3.1,5.4,.08);
}
function bench(parent,x,z,ry=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;parent.add(g);
  box(1.55,.14,.45,mats.rust,0,.5,0,g);box(1.55,.62,.11,mats.rust,0,.84,.17,g);
  box(.1,.48,.1,mats.steel,-.58,.24,0,g);box(.1,.48,.1,mats.steel,.58,.24,0,g);
}
function shelf(parent,x,z,ry=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=ry;parent.add(g);
  box(1.6,1.55,.2,mats.dark,0,.78,0,g);
  const cs=[mats.pink,mats.amber,mats.greenGlow,mats.off];let n=0;
  for(let y=0;y<3;y++)for(let xx=0;xx<4;xx++)box(.27,.23,.08,cs[n++%cs.length],-.52+xx*.35,.38+y*.43,.14,g);
}
function table(parent,x,z,color=mats.rust){
  box(1.25,.13,.7,color,x,.78,z,parent);for(const sx of [-.48,.48])for(const sz of [-.22,.22])box(.09,.75,.09,mats.steel,x+sx,.38,z+sz,parent);
}
function stool(parent,x,z,color=mats.wine){cyl(.24,.12,color,x,.62,z,parent);cyl(.055,.62,mats.steel,x,.31,z,parent);}
function busShelter(parent,x,z){
  const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);
  for(const sx of [-1.4,1.4])box(.09,2.2,.09,mats.steel,sx,1.1,0,g);
  box(3.1,.12,1.35,mats.dark,0,2.2,0,g);
  box(2.86,.06,1.08,basic(C.amber,.82),0,2.09,0,g);
  glowSprite(g,0,2.12,0,C.amber,2.8,.18);bench(g,0,.12,0);
}
function lowCar(parent,color){
  const g=new THREE.Group();parent.add(g);
  box(1.75,.48,2.9,lambert(color),0,.43,0,g);box(1.38,.44,1.42,mats.dark,0,.87,-.08,g);
  box(1.2,.28,.92,basic(0x78636b,.68),0,.9,-.12,g);
  for(const sx of [-.86,.86])for(const sz of [-.95,.95])box(.2,.4,.5,mats.black,sx,.31,sz,g);
  box(.23,.17,.13,mats.amber,-.54,.5,-1.51,g);box(.23,.17,.13,mats.amber,.54,.5,-1.51,g);
  glowSprite(g,0,.52,-1.58,C.amber,1.8,.12);return g;
}

const exterior=new THREE.Group(),interior=new THREE.Group();scene.add(exterior,interior);
const colliders={'loc.conveyor_club.exterior':[],'loc.conveyor_club.interior':[]};
function collider(loc,minX,maxX,minZ,maxZ){colliders[loc].push({minX,maxX,minZ,maxZ});}

function facade(parent,{x,z,w,d,h,mat,front='left',accent=C.pink,windowA=C.amber,windowB=C.green,open=true}){
  const g=new THREE.Group();parent.add(g);
  const sx=front==='left'?-1:1;
  const frontX=x+sx*w/2, backX=x-sx*w/2;
  box(.25,h,d,mat,backX,h/2,z,g);
  box(w,.16,d,mats.dark,x,h,z,g);
  box(w,.12,d,mats.walk,x,.06,z,g);
  box(w,h,.16,mats.dark,x,h/2,z-d/2,g);box(w,h,.16,mats.dark,x,h/2,z+d/2,g);
  if(open){
    for(const zz of [z-d/2,z+d/2])box(.18,h,.18,mats.steel,frontX,h/2,zz,g);
    lightStrip(g,frontX-sx*.12,2.72,z,.14,d*.92,accent);
    glowPad(g,frontX-sx*1.3,z,accent,4.4,d*.8,.1);
  }else box(.24,h,d,mat,frontX,h/2,z,g);
  const wy=h+1.05;
  box(.26,2.35,d,mat,backX,wy,z,g);
  for(let zz=z-d*.32;zz<=z+d*.32;zz+=Math.max(2.1,d*.26)){
    windowPanel(g,backX+sx*.14,wy+.15,zz,.02,1.15,windowA,windowB,front==='left'?Math.PI/2:-Math.PI/2);
    glowSprite(g,backX+sx*.3,wy+.15,zz,windowA,1.9,.075);
  }
  box(.36,.34,d+.3,mats.dark,backX,wy+1.4,z,g);
  return {g,frontX,backX,x,z,w,d,h,sx};
}

function buildExterior(){
  box(12,.08,96,mats.road,0,-.04,0,exterior);
  box(96,.08,12,mats.road,0,-.035,-8,exterior);
  box(4.2,.12,96,mats.walk,-8.1,.02,0,exterior);box(4.2,.12,96,mats.walk,8.1,.02,0,exterior);
  box(96,.12,4.2,mats.walk,0,.025,-16.1,exterior);box(96,.12,4.2,mats.walk,0,.025,.1,exterior);

  for(let z=-44;z<46;z+=8)box(.12,.025,3.0,mats.cream,0,.02,z,exterior);
  for(let x=-42;x<44;x+=8)box(3.0,.025,.12,mats.cream,x,.02,-8,exterior);
  for(let x=-5;x<=5;x+=2)box(1.15,.03,3.0,mats.off,x,.03,-8,exterior);

  const club=facade(exterior,{x:-10.9,z:-5.8,w:5.6,d:17.2,h:2.8,mat:mats.brick,front:'left',accent:C.pink,windowA:C.pink,windowB:C.amber});
  collider('loc.conveyor_club.exterior',-14.0,-8.3,-14.4,-5.25);
  collider('loc.conveyor_club.exterior',-14.0,-8.3,-2.75,3.0);
  box(1.25,.95,4.8,mats.rust,-11.3,.52,-9.0,club.g);
  for(let zz=-8.8;zz<=-4.7;zz+=1.35)stool(club.g,-9.4,zz,zz%2?mats.wine:mats.rust);
  shelf(club.g,-13.25,-1.1,Math.PI/2);shelf(club.g,-13.25,1.25,Math.PI/2);
  table(club.g,-11.4,-1.8);table(club.g,-11.4,1.2);
  windowPanel(club.g,-8.02,1.45,-7.7,.02,1.5,'#ff4aa3','#ffd765',Math.PI/2);
  windowPanel(club.g,-8.02,1.45,-5.7,.02,1.5,'#ffd765','#83db75',Math.PI/2);
  glowSprite(club.g,-7.7,1.45,-6.8,C.pink,2.8,.18);

  const diner=facade(exterior,{x:10.9,z:-7,w:5.6,d:15.3,h:2.7,mat:mats.green,front:'right',accent:C.amber,windowA:C.amber,windowB:C.green});
  collider('loc.conveyor_club.exterior',8.25,13.9,-14.6,-2.3);
  collider('loc.conveyor_club.exterior',8.25,13.9,.15,.9);
  box(1.4,.9,5.6,mats.rust,10.7,.48,-7.0,diner.g);
  for(let zz=-9.1;zz<=-4.8;zz+=1.1)stool(diner.g,9.2,zz,mats.wine);
  shelf(diner.g,13.25,-2.0,-Math.PI/2);
  windowPanel(diner.g,8.02,1.4,-9.1,.02,1.45,'#ffd765','#83db75',-Math.PI/2);
  windowPanel(diner.g,8.02,1.4,-6.7,.02,1.45,'#83db75','#ffd765',-Math.PI/2);
  glowSprite(diner.g,7.7,1.45,-7.8,C.amber,3.0,.18);

  const sideData=[
    [-11,12,mats.brown,C.green,C.amber],[-11,23,mats.plaster,C.pink,C.amber],[-11,34,mats.green,C.amber,C.green],
    [11,10,mats.plaster,C.amber,C.green],[11,22,mats.green,C.green,C.amber],[11,34,mats.brown,C.pink,C.amber],
    [-11,-27,mats.brown,C.pink,C.green],[11,-28,mats.plaster,C.amber,C.green],[-11,-39,mats.green,C.green,C.amber],[11,-40,mats.brown,C.pink,C.amber]
  ];
  for(const [x,z,mat,a,b] of sideData){
    const front=x<0?'left':'right';
    facade(exterior,{x,z,w:5.4,d:8.2,h:2.45,mat,front,accent:a,windowA:a,windowB:b,open:true});
    if(x<0)collider('loc.conveyor_club.exterior',-14,-8.3,z-4.1,z+4.1);
    else collider('loc.conveyor_club.exterior',8.3,14,z-4.1,z+4.1);
  }

  busShelter(exterior,-3.1,8.5);
  for(const [x,z,c] of [[-6.15,5.7,C.amber],[6.15,5.0,C.amber],[-6.15,-19,C.pink],[6.15,-21,C.green],[-6.15,20,C.green],[6.15,19,C.pink]])lamp(exterior,x,z,c);
  bench(exterior,6.6,10.2,Math.PI/2);bench(exterior,-6.6,17.5,-Math.PI/2);

  for(const [x,z,c,w,d] of [[-6.3,-5.5,C.pink,4.5,11],[6.3,-7,C.amber,4.5,10],[-6.2,23,C.green,3.8,6],[6.2,28,C.pink,3.8,6]])glowPad(exterior,x,z,c,w,d,.1);

  for(let i=0;i<12;i++){
    const z=-54+i*9.5, x=i%2?-22:22, h=7+(i%4)*2.2;
    box(7,h,4,mats.dark,x,h/2,z,exterior);
    const faceX=x<0?x+3.55:x-3.55;
    for(let yy=2;yy<h-1;yy+=2)for(let zz=z-1.3;zz<=z+1.3;zz+=1.3){
      const cc=((i+Math.round(yy)+Math.round(zz))%3===0)?C.green:((i+Math.round(zz))%2?C.amber:C.pink);
      windowPanel(exterior,faceX,yy,zz,.02,.55,cc,cc,x<0?Math.PI/2:-Math.PI/2);
    }
  }
}

function buildInterior(){
  box(17,.12,15,mats.walk,0,0,0,interior);
  box(.25,6.2,15,mats.brick,-8.5,3.1,0,interior);box(.25,6.2,15,mats.green,8.5,3.1,0,interior);
  box(17,.25,.25,mats.brick,0,3.1,-7.5,interior);box(17,.25,.25,mats.dark,0,3.1,7.5,interior);
  collider('loc.conveyor_club.interior',-8.8,-8.1,-7.6,7.6);collider('loc.conveyor_club.interior',8.1,8.8,-7.6,7.6);collider('loc.conveyor_club.interior',-8.8,8.8,-7.7,-7.0);

  box(6.5,.32,3.2,mats.dark,-4.6,.16,4.8,interior);box(5.7,.14,2.4,mats.pink,-4.6,.38,4.8,interior);
  glowPad(interior,-4.6,4.5,C.pink,6.3,4.5,.14);glowSprite(interior,-4.6,1.6,4.7,C.pink,4.8,.18);
  for(let x=-7;x<=7;x+=2.8){box(1.55,.9,.9,mats.wine,x,.47,-2.6,interior);table(interior,x,1.2,x%2?mats.rust:mats.wine);}
  box(5.6,1.08,1.05,mats.rust,4.7,.55,4.8,interior);for(let x=2.5;x<7.2;x+=1.15)stool(interior,x,3.75,mats.wine);
  shelf(interior,7.9,1.2,-Math.PI/2);shelf(interior,-7.9,-1.2,Math.PI/2);

  for(const [x,z,c] of [[-6,2,C.pink],[-2,2,C.amber],[2,2,C.green],[6,2,C.pink]]){glowSprite(interior,x,5.4,z,c,2.5,.18);glowPad(interior,x,z,c,3.4,4,.11);}
  for(const z of [-4,0,4])windowPanel(interior,-8.34,3.8,z,.02,1.25,'#ff4aa3','#ffd765',Math.PI/2);
  for(const z of [-4,0,4])windowPanel(interior,8.34,3.8,z,.02,1.25,'#83db75','#ffd765',-Math.PI/2);
}

buildExterior();buildInterior();

function robotTexture(variant=0){
  const patterns=[
    ['..HH..','.HHHH.','H.OO.H','HHHHHH','..BB..','.BBBB.','B.BB.B','..LL..','.L..L.'],
    ['..HH..','.HAAH.','H....H','HHHHHH','.BBBB.','BB..BB','..BB..','..LL..','.L..L.'],
    ['.HHHH.','HH..HH','H.AA.H','HHHHHH','..BB..','BBBBBB','.B..B.','..LL..','.L..L.']
  ];
  const maps=[
    {H:'#f4eadb',O:'#ff4aa3',B:'#77717d',L:'#ffd765'},
    {H:'#83db75',A:'#ffd765',B:'#8f2c57',L:'#f4eadb'},
    {H:'#d4ccc1',A:'#83db75',B:'#35b29a',L:'#ff4aa3'}
  ];
  const p=patterns[variant%3],map=maps[variant%3];
  return canvasTexture(6,9,(g)=>{g.clearRect(0,0,6,9);p.forEach((row,y)=>[...row].forEach((ch,x)=>{if(map[ch]){g.fillStyle=map[ch];g.fillRect(x,y,1,1);}}));});
}
function makeActor(entityId,locationId,x,z,variant,route=null){
  const tex=robotTexture(variant);
  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,alphaTest:.1,depthWrite:true});
  const s=new THREE.Sprite(mat);s.scale.set(1.45,2.1,1);s.position.set(x,1.05,z);
  s.userData={entityId,locationId,route,routeIndex:0,speed:.82+variant*.12,phase:Math.random()*6.28,pause:0};
  (locationId==='loc.conveyor_club.exterior'?exterior:interior).add(s);
  glowSprite(locationId==='loc.conveyor_club.exterior'?exterior:interior,x,1,z,[C.pink,C.amber,C.green][variant%3],1.8,.045);
  return s;
}
const actorRoutes={
  mechanic:[[-5.8,6.0],[-5.8,-1.2],[-2.2,-1.2],[-2.2,6.0]],
  regular:[[5.8,8.5],[5.8,-12],[2.2,-12],[2.2,8.5]],
  walkerA:[[-6.0,25],[-6.0,12],[-2.2,12],[-2.2,25]],
  walkerB:[[6.0,29],[6.0,14],[2.2,14],[2.2,29]],
  walkerC:[[-5.8,-22],[-5.8,-35],[-2.3,-35],[-2.3,-22]],
  walkerD:[[5.8,-24],[5.8,-36],[2.3,-36],[2.3,-24]]
};
const actors=[
  makeActor('npc.street_mechanic','loc.conveyor_club.exterior',-5.8,6.0,0,actorRoutes.mechanic),
  makeActor('npc.night_regular','loc.conveyor_club.exterior',5.8,8.5,1,actorRoutes.regular),
  makeActor('npc.walker.a','loc.conveyor_club.exterior',-6,25,2,actorRoutes.walkerA),
  makeActor('npc.walker.b','loc.conveyor_club.exterior',6,29,0,actorRoutes.walkerB),
  makeActor('npc.walker.c','loc.conveyor_club.exterior',-5.8,-22,1,actorRoutes.walkerC),
  makeActor('npc.walker.d','loc.conveyor_club.exterior',5.8,-24,2,actorRoutes.walkerD),
  makeActor('npc.club_attendant','loc.conveyor_club.interior',4.8,3.8,2,null)
];

const cars=[];
const carRoutes=[
  [[-1.9,44],[-1.9,-14],[-34,-14],[-34,-10],[-1.9,-10],[-1.9,-44]],
  [[1.9,-44],[1.9,-2],[34,-2],[34,-6],[1.9,-6],[1.9,44]],
  [[-40,-10],[-2.5,-10],[-2.5,36],[1.5,36],[1.5,-10],[40,-10]],
  [[40,-6],[2.5,-6],[2.5,-34],[-1.5,-34],[-1.5,-6],[-40,-6]]
];
function addCar(route,color,offset){
  const g=lowCar(exterior,color),c={g,route,index:offset%route.length,speed:4.0+offset*.35};
  const p=route[c.index];g.position.set(p[0],0,p[1]);cars.push(c);
}
addCar(carRoutes[0],C.wine,0);addCar(carRoutes[1],C.petrol,1);addCar(carRoutes[2],C.rust,2);addCar(carRoutes[3],C.plum,3);addCar(carRoutes[0],C.teal,3);

let itemMesh=null;
function syncItem(){
  const e=state.entities['item.transit_chip'];
  if(itemMesh){exterior.remove(itemMesh);itemMesh=null;}
  if(e?.present&&e.locationId==='loc.conveyor_club.exterior'){
    const g=new THREE.Group();g.position.set(e.position.x,0,e.position.z);exterior.add(g);
    box(.44,.18,.44,mats.amber,0,.18,0,g);box(.24,.09,.24,mats.pink,0,.34,0,g);glowSprite(g,0,.32,0,C.amber,1.7,.22);itemMesh=g;
  }
}
syncItem();

function setLocation(id,position){
  state.player.locationId=id;state.player.position={x:position.x,y:1.72,z:position.z};
  camera.position.set(position.x,1.72,position.z);camera.rotation.x=0;camera.rotation.y=0;
  state.player.yaw=0;state.player.pitch=0;saveWorldState(state);syncVisibility();updateHud();
}
function syncVisibility(){
  const out=state.player.locationId==='loc.conveyor_club.exterior';
  exterior.visible=out;interior.visible=!out;scene.background.setHex(out?0x241327:0x1d121e);scene.fog.color.setHex(out?0x2a172a:0x241421);scene.fog.near=out?18:8;scene.fog.far=out?82:32;
}
syncVisibility();

const keys=new Set();
const input={locked:false,forward:false,reverse:false,dx:0,dy:0};
enter.addEventListener('click',()=>canvas.requestPointerLock?.());
document.addEventListener('pointerlockchange',()=>{
  input.locked=document.pointerLockElement===canvas;entry.classList.toggle('hidden',input.locked);
  if(!input.locked){input.forward=input.reverse=false;savePlayer();}
});
document.addEventListener('pointerlockerror',()=>toast('Mouse capture was blocked. Click to try again.'));
document.addEventListener('mousemove',e=>{
  if(!input.locked||dialogue)return;
  input.dx+=Math.max(-60,Math.min(60,e.movementX||0));input.dy+=Math.max(-60,Math.min(60,e.movementY||0));
});
viewport.addEventListener('mousedown',e=>{
  if(!input.locked)return;
  if(dialogue){advanceDialogue();return;}
  if(e.button===0)input.forward=true;if(e.button===2)input.reverse=true;e.preventDefault();
});
window.addEventListener('mouseup',e=>{if(e.button===0)input.forward=false;if(e.button===2)input.reverse=false;});
viewport.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='KeyE'&&!e.repeat){if(dialogue)advanceDialogue();else interact();}});
window.addEventListener('keyup',e=>keys.delete(e.code));

function savePlayer(){
  state.player.position={x:+camera.position.x.toFixed(3),y:1.72,z:+camera.position.z.toFixed(3)};
  state.player.yaw=camera.rotation.y;state.player.pitch=camera.rotation.x;saveWorldState(state);lastSave=performance.now();
}
function blocked(x,z){return colliders[state.player.locationId].some(c=>x>c.minX&&x<c.maxX&&z>c.minZ&&z<c.maxZ);}
function updatePlayer(dt){
  if(!input.locked||dialogue)return;
  camera.rotation.y-=input.dx*.00235;camera.rotation.x-=input.dy*.00205;
  camera.rotation.x=Math.max(-1.18,Math.min(1.18,camera.rotation.x));input.dx*=.15;input.dy*=.15;
  const f=(keys.has('KeyW')||input.forward?1:0)-(keys.has('KeyS')||input.reverse?1:0);
  const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
  if(f||s){
    const yaw=camera.rotation.y,spd=4.05*dt;
    const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*spd,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*spd;
    const nx=camera.position.x+dx,nz=camera.position.z+dz;
    if(!blocked(nx,camera.position.z))camera.position.x=nx;if(!blocked(camera.position.x,nz))camera.position.z=nz;
  }
  camera.position.y=1.72;
  if(performance.now()-lastSave>1800)savePlayer();
}
function updateRoute(obj,dt){
  if(!obj.userData.route)return;
  if(obj.userData.pause>0){obj.userData.pause-=dt;return;}
  const route=obj.userData.route,i=obj.userData.routeIndex,target=route[(i+1)%route.length];
  const dx=target[0]-obj.position.x,dz=target[1]-obj.position.z,dist=Math.hypot(dx,dz);
  if(dist<.12){obj.userData.routeIndex=(i+1)%route.length;if(Math.random()<.28)obj.userData.pause=.7+Math.random()*1.5;return;}
  obj.position.x+=dx/dist*obj.userData.speed*dt;obj.position.z+=dz/dist*obj.userData.speed*dt;
  obj.position.y=1.05+Math.sin(performance.now()*.004+obj.userData.phase)*.035;
}
function updateCar(c,dt){
  const target=c.route[(c.index+1)%c.route.length],dx=target[0]-c.g.position.x,dz=target[1]-c.g.position.z,dist=Math.hypot(dx,dz);
  if(dist<.22){c.index=(c.index+1)%c.route.length;return;}
  c.g.position.x+=dx/dist*c.speed*dt;c.g.position.z+=dz/dist*c.speed*dt;c.g.rotation.y=Math.atan2(dx,dz);
}

function distanceXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function interactionCandidate(){
  const loc=state.player.locationId,p=camera.position,cands=[];
  const chip=state.entities['item.transit_chip'];
  if(loc==='loc.conveyor_club.exterior'&&chip?.present)cands.push({type:'item',id:'item.transit_chip',position:new THREE.Vector3(chip.position.x,0,chip.position.z),label:'E — TAKE TRANSIT CHIP'});
  if(loc==='loc.conveyor_club.exterior')cands.push({type:'door',id:'door.club.in',position:new THREE.Vector3(-7.72,0,-4.0),label:'E — ENTER CONVEYOR CLUB'});
  else cands.push({type:'door',id:'door.club.out',position:new THREE.Vector3(0,0,6.3),label:'E — EXIT TO STREET'});
  for(const a of actors){
    if(a.userData.locationId!==loc||a.userData.entityId.startsWith('npc.walker'))continue;
    cands.push({type:'npc',id:a.userData.entityId,position:a.position,label:`E — TALK TO ${(state.entities[a.userData.entityId]?.name||'ROBOT').toUpperCase()}`});
  }
  let best=null,bd=999;for(const c of cands){const d=distanceXZ(p,c.position);if(d<bd){bd=d;best=c;}}
  return bd<=2.3?best:null;
}
function interact(){const c=interactionCandidate();if(!c)return;if(c.type==='item')takeChip();else if(c.type==='door')useDoor(c.id);else if(c.type==='npc')talk(c.id);}
function takeChip(){
  transact(state,'TAKE_ITEM',{itemId:'item.transit_chip'},s=>{
    giveItem(s,'item.transit_chip');s.flags.transitChipSeen=true;s.flags.transitChipCollected=true;
    s.quests['quest.first_night'].stage=Math.max(1,s.quests['quest.first_night'].stage);
  });
  syncItem();toast('TRANSIT CHIP ACQUIRED');updateHud();
}
function useDoor(id){
  if(id==='door.club.in'){
    transact(state,'MOVE_ROUTE',{routeId:'route.club_front_door',to:'loc.conveyor_club.interior'},s=>{
      s.flags.clubEntered=true;s.quests['quest.first_night'].stage=Math.max(s.flags.mechanicHelped?3:2,s.quests['quest.first_night'].stage);
    });
    setLocation('loc.conveyor_club.interior',{x:0,z:5.3});toast('ENTERED THE CONVEYOR CLUB');
  }else{
    transact(state,'MOVE_ROUTE',{routeId:'route.club_front_door',to:'loc.conveyor_club.exterior'},()=>{});
    setLocation('loc.conveyor_club.exterior',{x:-6.0,z:-4.0});toast('BACK ON THE STREET');
  }
}
function talk(id){
  const e=state.entities[id];if(!e)return;
  if(id==='npc.street_mechanic'){
    const lines=hasItem(state,'item.transit_chip')?
      ['There it is. I watched that little chip skid under the bus shelter.','Keep it. The Club uses those old transit tags for half the machines nobody remembers installing.','Go inside. If anybody asks, I did not tell you that.']:
      ['You lose something? I saw a yellow chip bounce near the bus shelter.','Look by the bench. Streetlights make everything look important after midnight.'];
    if(hasItem(state,'item.transit_chip')&&!state.flags.mechanicHelped)transact(state,'NPC_CONVERSATION',{npcId:id,topic:'transit_chip'},s=>{s.entities[id].met=true;s.flags.mechanicHelped=true;s.quests['quest.first_night'].stage=Math.max(2,s.quests['quest.first_night'].stage);});
    else transact(state,'NPC_CONVERSATION',{npcId:id},s=>{s.entities[id].met=true;});
    showDialogue(e.name,lines);updateHud();return;
  }
  if(id==='npc.night_regular'){
    transact(state,'NPC_CONVERSATION',{npcId:id},s=>{s.entities[id].met=true;});
    showDialogue(e.name,['This block never really closes. It just changes which machines are awake.','Watch the traffic. The little rust car still thinks the crosswalk is a suggestion.']);return;
  }
  if(id==='npc.club_attendant'){
    transact(state,'NPC_CONVERSATION',{npcId:id},s=>{s.entities[id].met=true;});
    showDialogue(e.name,hasItem(state,'item.transit_chip')?
      ['Mechanic sent you in with that thing? Of course they did.','Welcome to the Club. The city keeps moving whether you are looking at it or not.']:
      ['You made it in without finding the chip. That is probably fine. Probably.']);
  }
}
function showDialogue(speaker,lines){
  dialogue={speaker,lines,index:0};speakerEl.textContent=speaker.toUpperCase();dialogueTextEl.textContent=lines[0];
  dialogueEl.classList.remove('hidden');input.forward=input.reverse=false;
}
function advanceDialogue(){
  if(!dialogue)return;dialogue.index++;
  if(dialogue.index>=dialogue.lines.length){dialogue=null;dialogueEl.classList.add('hidden');return;}
  dialogueTextEl.textContent=dialogue.lines[dialogue.index];
}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1600);}
function objective(){
  if(!state.flags.transitChipCollected)return'Find the transit chip near the bus shelter.';
  if(!state.flags.mechanicHelped)return'Show the transit chip to the Street Mechanic.';
  if(!state.flags.clubEntered)return'Enter the Conveyor Club.';
  return'Explore. Talk to robots. See what keeps moving when you leave.';
}
function updateHud(){
  locationEl.textContent=state.player.locationId==='loc.conveyor_club.exterior'?'CONVEYOR CLUB — BUS STOP':'CONVEYOR CLUB — MAIN FLOOR';
  objectiveEl.textContent=objective();
  inventoryEl.textContent=state.player.inventory.length?state.player.inventory.map(id=>state.entities[id]?.name||id).join(' · '):'EMPTY';
}
updateHud();

$('fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});
$('reset').addEventListener('click',()=>{if(confirm('Reset Robot World 3D persistent prototype state?')){state=resetWorldState();location.reload();}});
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();

let last=performance.now(),acc=0;const frameStep=1/24;
function animate(now){
  requestAnimationFrame(animate);
  const raw=Math.min(.08,(now-last)/1000);last=now;acc+=raw;if(acc<frameStep)return;
  const dt=acc;acc=0;updatePlayer(dt);
  for(const a of actors)if(a.userData.locationId===state.player.locationId)updateRoute(a,dt);
  if(state.player.locationId==='loc.conveyor_club.exterior')for(const c of cars)updateCar(c,dt);
  const c=interactionCandidate();promptEl.textContent=c?.label||'';promptEl.classList.toggle('show',!!c&&!dialogue);
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
