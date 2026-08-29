const gameUrl=new URL('./game-v2.js?v=3',import.meta.url);
const stateUrl=new URL('./world-state.js',import.meta.url).href;
let src=await fetch(gameUrl).then(r=>{if(!r.ok)throw new Error(`GAME SOURCE ${r.status}`);return r.text();});

const stateImport="from './world-state.js';";
if(!src.includes(stateImport))throw new Error('RW3D boot patch: world-state import marker missing');
src=src.replace(stateImport,`from '${stateUrl}';`);

const facadeMarker="const g=new THREE.Group();parent.add(g);\n  const sx=front==='left'?-1:1;";
if(!src.includes(facadeMarker))throw new Error('RW3D boot patch: facade marker missing');
src=src.replace(facadeMarker,"const g=new THREE.Group();parent.add(g);\n  g.userData.builderId='base.facade.'+(window.__RW3D_FACADE_SEQ=(window.__RW3D_FACADE_SEQ||0)+1);\n  g.userData.builderBase=true;\n  const sx=front==='left'?-1:1;");

const playerMarker='function updatePlayer(dt){';
if(!src.includes(playerMarker))throw new Error('RW3D boot patch: player marker missing');
src=src.replace(playerMarker,"function updatePlayer(dt){if(window.RW3D_BUILDER_ACTIVE)return;");

const endMarker='requestAnimationFrame(animate);';
const end=src.lastIndexOf(endMarker);
if(end<0)throw new Error('RW3D boot patch: animation marker missing');
const bridge=`window.RW3D_INTERNAL={THREE,renderer,scene,camera,exterior,interior,mats,C,box,plane,cyl,facade,glowPad,glowSprite,windowPanel,colliders,state,actors,cars,input,keys,savePlayer,updateHud,syncVisibility};\n`;
src=src.slice(0,end)+bridge+src.slice(end);

const blob=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
try{await import(blob);}finally{URL.revokeObjectURL(blob);}
await import('./builder-runtime.js?v=1');
