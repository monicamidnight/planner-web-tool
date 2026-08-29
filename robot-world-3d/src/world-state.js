const STORAGE_KEY='robot-world-3d:v0.1';

export const DEFAULT_STATE={
  schemaVersion:1,
  revision:0,
  player:{
    locationId:'loc.conveyor_club.exterior',
    position:{x:0,y:1.72,z:10.5},
    yaw:0,
    pitch:0,
    inventory:[]
  },
  entities:{
    'item.transit_chip':{id:'item.transit_chip',type:'item',name:'Transit Chip',locationId:'loc.conveyor_club.exterior',position:{x:-2.6,y:.22,z:7.4},custodianId:null,present:true},
    'npc.street_mechanic':{id:'npc.street_mechanic',type:'npc',name:'Street Mechanic',locationId:'loc.conveyor_club.exterior',routeId:'route.mechanic',dialogueStep:0,met:false},
    'npc.night_regular':{id:'npc.night_regular',type:'npc',name:'Night Regular',locationId:'loc.conveyor_club.exterior',routeId:'route.regular',dialogueStep:0,met:false},
    'npc.club_attendant':{id:'npc.club_attendant',type:'npc',name:'Club Attendant',locationId:'loc.conveyor_club.interior',routeId:null,dialogueStep:0,met:false}
  },
  routes:{
    'route.club_front_door':{id:'route.club_front_door',from:'loc.conveyor_club.exterior',to:'loc.conveyor_club.interior',open:true,locked:false},
    'route.mechanic':{id:'route.mechanic',locationId:'loc.conveyor_club.exterior'},
    'route.regular':{id:'route.regular',locationId:'loc.conveyor_club.exterior'}
  },
  quests:{
    'quest.first_night':{id:'quest.first_night',status:'active',stage:0,title:'First Night at the Club'}
  },
  flags:{transitChipSeen:false,transitChipCollected:false,mechanicHelped:false,clubEntered:false},
  eventLog:[]
};

function clone(v){return JSON.parse(JSON.stringify(v));}

function normalize(raw){
  const base=clone(DEFAULT_STATE);
  if(!raw||typeof raw!=='object')return base;
  const out={...base,...raw};
  out.player={...base.player,...raw.player};
  out.player.position={...base.player.position,...raw.player?.position};
  out.player.inventory=Array.isArray(raw.player?.inventory)?raw.player.inventory.slice():[];
  out.entities={...base.entities,...raw.entities};
  out.routes={...base.routes,...raw.routes};
  out.quests={...base.quests,...raw.quests};
  out.flags={...base.flags,...raw.flags};
  out.eventLog=Array.isArray(raw.eventLog)?raw.eventLog.slice(-100):[];
  return out;
}

export function loadWorldState(){
  try{return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}
  catch{return clone(DEFAULT_STATE);}
}

export function saveWorldState(state){
  state.revision=(state.revision||0)+1;
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  return state;
}

export function resetWorldState(){
  localStorage.removeItem(STORAGE_KEY);
  return clone(DEFAULT_STATE);
}

export function transact(state,type,details,mutator){
  mutator(state);
  state.eventLog.push({revision:(state.revision||0)+1,type,details,at:new Date().toISOString()});
  if(state.eventLog.length>100)state.eventLog.splice(0,state.eventLog.length-100);
  return saveWorldState(state);
}

export function hasItem(state,itemId){return state.player.inventory.includes(itemId);}

export function giveItem(state,itemId){
  if(!state.player.inventory.includes(itemId))state.player.inventory.push(itemId);
  const item=state.entities[itemId];
  if(item){item.custodianId='player';item.locationId=null;item.present=false;}
}

export function dropItem(state,itemId,locationId,position){
  state.player.inventory=state.player.inventory.filter(id=>id!==itemId);
  const item=state.entities[itemId];
  if(item){item.custodianId=null;item.locationId=locationId;item.position={...position};item.present=true;}
}
