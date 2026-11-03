/* Small corrections without replacing inventory, notes, XP or other play state. */
const LEVEL_UNDO_FIELDS=['level','base','hpRolls','feats','featChoices','subId','subclassConfirmed','subclassChoices','metamagic','classChoiceData','spells','prepared','arcanum','subclassCantrips','landTerrain','genieKind','divineAffinity'];
const recoveryClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function captureLevelState(c){return Object.fromEntries(LEVEL_UNDO_FIELDS.filter(k=>c[k]!==undefined).map(k=>[k,recoveryClone(c[k])]))}
function recordLevelChange(c,before,klass){
 if(c.klass!==klass||c.level!==(before.level||1)+1)return false;
 const changed=LEVEL_UNDO_FIELDS.filter(k=>JSON.stringify(before[k])!==JSON.stringify(c[k]));
 const restore={},absent=[];for(const key of changed){if(before[key]===undefined)absent.push(key);else restore[key]=recoveryClone(before[key])}
 c.levelUndoHistory=[...(c.levelUndoHistory||[]),{klass,from:before.level,to:c.level,restore,absent}].slice(-20);return true;
}
function lastLevelUndo(c){const e=c.levelUndoHistory?.at(-1);return e&&e.klass===c.klass&&e.to===c.level&&e.from>=1&&e.to===e.from+1?e:null}
function resetAutomaticAC(c){c.acBonus=0;c.manual={...(c.manual||{}),acMode:'auto'};delete c.manual.acValue;if(c.wildShape)c.wildShape.acBonus=0;if(typeof equipmentInvalidate==='function')equipmentInvalidate()}
function applyRecordedLevelUndo(c,entry){
 if(!entry||entry.klass!==c.klass||entry.to!==c.level||entry.from<1||entry.to!==entry.from+1)return false;
 for(const key of LEVEL_UNDO_FIELDS){if(Object.hasOwn(entry.restore||{},key))c[key]=recoveryClone(entry.restore[key]);else if(entry.absent?.includes(key))delete c[key]}
 c.levelUndoHistory=c.levelUndoHistory.slice(0,-1);return true;
}
function finishLevelReduction(c,oldMax){
 if(typeof equipmentInvalidate==='function')equipmentInvalidate();const nextMax=maxHP(c);
 c.hp=Math.max(0,Math.min(nextMax,(Number(c.hp)||0)+nextMax-oldMax));c.hitDiceSpent=Math.min(c.hitDiceSpent||0,totalLevel(c));
 for(const def of classResourceDefinitions(c))if(!def.unlimited){const state=trackedResourceState(c,def);state.current=Math.min(state.current,def.max)}
 scheduleSave();renderSheet();
}
const levelUpBeforeRecovery=showLevelUp;
showLevelUp=function(c){
 levelUpBeforeRecovery(c);const box=document.querySelector('dialog[aria-labelledby="levelUpTitle"]'),form=box?.querySelector('form');if(!form?.onsubmit)return;
 const submit=form.onsubmit;form.onsubmit=function(event){const before=captureLevelState(c),klass=c.klass;submit.call(this,event);if(recordLevelChange(c,before,klass)){scheduleSave();renderSheet()}};
};
async function undoCharacterLevel(c){
 if((c.level||1)<=1)return;const entry=lastLevelUndo(c);
 if(entry){
  if(!await window.forgeConfirm(`Undo ${classOf(c).name} level ${entry.to} → ${entry.from}? This restores the ability, feat, subclass and class choices changed by that level-up. Equipment, notes and XP stay unchanged.`,'Undo level-up'))return;
  if(typeof saveRecoveryCharacter==='function')saveRecoveryCharacter(c,true);const oldMax=maxHP(c);if(applyRecordedLevelUndo(c,entry))finishLevelReduction(c,oldMax);return;
 }
 showRemoveLevel(c);
}
function showRemoveLevel(c){
 const removed=c.level,next=removed-1,asi=classHasASI(c.klass,removed),box=document.createElement('dialog');box.className='settings-dialog level-removal-dialog';box.setAttribute('aria-labelledby','removeLevelTitle');
 box.innerHTML=`<form><div class="settings-bar"><h2 id="removeLevelTitle">Remove a level</h2><button type="button" class="btn ghost" data-close>Close ×</button></div><div class="settings-body"><p>${esc(classOf(c).name)} level ${removed} → ${next}. HP, proficiency, slots and automatic features will recalculate.</p><p class="hint">This level predates undo history, so its selected choices cannot be identified automatically. Equipment, notes and XP stay unchanged. Review subclass, spell and class choices afterward.</p>${asi?`<label>Reverse this level’s feat / ability improvement<select data-reverse><option value="manual">I will review it manually</option><option value="asi">Undo two ability increases</option><option value="feat">Remove the feat gained at this level</option></select></label><div data-asi hidden class="extra-grid">${[0,1].map(n=>`<label>Ability to reduce by 1<select data-reduce="${n}"><option value="">Choose ability</option>${ABILITIES.map(a=>`<option value="${a}">${esc(ABL_NAMES[a])}</option>`).join('')}</select></label>`).join('')}</div><label data-feat hidden>Feat to remove<select data-remove-feat><option value="">Choose feat</option>${(c.feats||[]).filter(id=>!Object.values(c.raceFeatChoices||{}).includes(id)).map(id=>`<option value="${esc(id)}">${esc(FEATS.find(f=>f.id===id)?.name||id)}</option>`).join('')}</select></label>`:''}<p data-error role="status"></p></div><div class="settings-footer"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn primary" type="submit">Remove level</button></div></form>`;
 const close=()=>box.remove();box.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);box.addEventListener('cancel',e=>{e.preventDefault();close()});
 box.querySelector('[data-reverse]')?.addEventListener('change',e=>{box.querySelector('[data-asi]').hidden=e.target.value!=='asi';box.querySelector('[data-feat]').hidden=e.target.value!=='feat'});
 box.querySelector('form').onsubmit=e=>{
  e.preventDefault();const mode=box.querySelector('[data-reverse]')?.value;
  const reductions=[...box.querySelectorAll('[data-reduce]')].map(x=>x.value),feat=box.querySelector('[data-remove-feat]')?.value;
  if(mode==='asi'&&reductions.some(a=>!ABILITIES.includes(a))||mode==='feat'&&!feat){box.querySelector('[data-error]').textContent='Choose the abilities or feat to reverse.';return;}
  if(typeof saveRecoveryCharacter==='function')saveRecoveryCharacter(c,true);const oldMax=maxHP(c);
  if(mode==='asi')for(const a of reductions)c.base[a]=(Number(c.base[a])||10)-1;
  if(mode==='feat'){c.feats=c.feats.filter(id=>id!==feat);if(c.featChoices)delete c.featChoices[feat]}
  c.level=next;if(c.hpRolls)delete c.hpRolls[removed];c.levelUndoHistory=[];close();finishLevelReduction(c,oldMax);
 };
 document.body.append(box);box.showModal();
}
const sheetBeforeRecoveryButtons=renderSheet;
renderSheet=function(){
 sheetBeforeRecoveryButtons();const c=draft,ac=byId('editAC'),up=byId('levelUp');
 if(ac&&!ac.querySelector('[data-reset-ac]')){const reset=document.createElement('button');reset.type='button';reset.className='sheet-correction-link';reset.dataset.resetAc='';reset.textContent='reset';reset.setAttribute('aria-label','Reset armor class to automatic tracking');reset.title='Clear manual AC adjustments. Armor, shields and item bonuses remain active.';reset.onclick=e=>{e.preventDefault();e.stopPropagation();resetAutomaticAC(c);scheduleSave();renderSheet()};ac.append(reset)}
 if(up&&!byId('undoLevel')){const undo=document.createElement('button');undo.type='button';undo.id='undoLevel';undo.className='btn ghost';undo.textContent=lastLevelUndo(c)?'Undo level':'Remove level';undo.disabled=(c.level||1)<=1;undo.title=lastLevelUndo(c)?'Undo your last recorded level-up and its choices.':'Remove one level from your main class; review choices for older levels.';undo.onclick=()=>undoCharacterLevel(c);up.after(undo)}
};
