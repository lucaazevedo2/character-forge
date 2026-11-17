/* Shared player-view and automatic Bloodied rules. No HP/private notes in the projection. */
(()=>{'use strict';
function monster(t){if(t.details?.characterId)return false;try{const n=JSON.parse(t.details?.notes||'{}');return !!(n.srdMonster||n.creatureResource||t.meta?.kind==='monster');}catch{return t.meta?.kind==='monster';}}
function bloodied(t){return monster(t)&&Number.isFinite(t.hp)&&Number.isFinite(t.maxHp)&&t.maxHp>0&&t.hp<=t.maxHp/2;}
function conditions(t){const current=t.meta?.conditions||[];if(!monster(t)&&t.hp!==null)return current.slice();const result=current.filter(c=>c!=='Bloodied');if(bloodied(t)||t.hp===null&&current.includes('Bloodied'))result.push('Bloodied');return result;}
function syncBloodied(scene){let changed=false;for(const t of scene?.tokens||[]){if(!monster(t)||!Number.isFinite(t.hp)||!Number.isFinite(t.maxHp))continue;const next=conditions(t);if(JSON.stringify(next)!==JSON.stringify(t.meta?.conditions||[])){t.meta={...t.meta,conditions:next};changed=true;}}return changed;}
function project(scene){return {id:scene.id,width:scene.width,height:scene.height,grid:scene.grid,map:scene.map,snap:scene.snap,showGrid:scene.showGrid,settings:{...scene.settings},environment:scene.environment,
 tokens:(scene.tokens||[]).filter(t=>!t.hidden&&t.meta?.layer!=='gm'&&scene.settings?.layers?.[t.meta?.layer||'tokens']?.visible!==false).map(t=>({id:t.id,name:t.name,x:t.x,y:t.y,size:t.size,rotation:t.rotation,color:t.color,image:t.image,hp:null,maxHp:null,hidden:false,ownerIds:[],_canEdit:!!t.details?.characterId||!!t.ownerIds?.length&&!monster(t),meta:{layer:t.meta?.layer||'tokens',height:t.meta?.height,shape:t.meta?.shape,conditions:conditions(t)},details:{vision:t.details?.vision}})),
 drawings:(scene.drawings||[]).filter(d=>!d.hidden&&d.layer!=='gm')};}
const a={monster,bloodied,conditions,syncBloodied,project};if(typeof module!=='undefined'&&module.exports)module.exports=a;else window.ForgeVTTPresentationCore=a;
})();
