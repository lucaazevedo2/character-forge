/* Full reference text is independent of summaries and mechanical metadata. */
function providedRuleName(name){
 let text=String(name||'').replace(/ · Future$|\s*\([^)]*\)/g,'');
 text=text.replace(/^Spellcasting: .*/,'Spellcasting').replace(/^(Fighting Style|Eldritch Invocation|Metamagic|Channel Divinity|Flexible Casting):\s*/,'');
 if(text==='Divine Intervention Improvement')text='Divine Intervention';
 if(text==='Signature Spell')text='Signature Spells';
 if(text==='Converting Spell Slot')text='Converting a Spell Slot to Sorcery Points';
 return text.replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function providedRulesHTML(text){
 // The supplied plain-text export includes flattened tables. Retain every line
 // and escape it; never interpret uploaded content as markup or executable code.
 return '<div class="provided-rules-copy">'+esc(text)+'</div>';
}
function providedFeatureText(f,source){
 if(f.characterOverride)return null;
 const key=String(source||f.source||'').split('dnd5e.wikidot.com/')[1]?.split(/[?#]/)[0];
 let page=PROVIDED_FEATURE_RULES.pages[key];
 if(!page)return null;
 if(/^Eldritch Invocation:/.test(f.name))page=PROVIDED_FEATURE_RULES.pages['warlock:eldritch-invocations']||page;
 const name=providedRuleName(f.name);
 let text=page.sections[name];
 if(!text&&/^Circle of the Land(?::|$)/.test(f.name))text=page.sections.circlespells;
 if(!text&&name===providedRuleName(page.title))text=page.text;
 return text||null;
}
const classRulesBeforeSupplied=classRulesContent;
classRulesContent=function(f,source){
 const text=providedFeatureText(f,source);
 return text?{html:providedRulesHTML(text),label:'Provided full rules · 2014'}:classRulesBeforeSupplied(f,source);
};
const subclassRulesBeforeSupplied=subclassRulesContent;
subclassRulesContent=function(f,source){
 const text=providedFeatureText(f,source);
 return text?{html:providedRulesHTML(text),label:'Provided full rules · 2014'}:subclassRulesBeforeSupplied(f,source);
};
function providedFeatRules(f){return PROVIDED_FEATURE_RULES.feats[f.id]||null}
const helpBeforeSuppliedFeats=subclassRulesHelpHTML;
subclassRulesHelpHTML=function(f,source,kind){
 if(kind!=='feat'||f.characterOverride)return helpBeforeSuppliedFeats(f,source,kind);
 const text=providedFeatRules(f);if(!text)return '';
 const id='feat-rules-help-'+(++subclassRulesHelpSequence);
 return `<button type="button" class="subclass-rules-help" data-rules-toggle aria-label="Show rules for ${esc(f.name)}" aria-expanded="false" aria-pressed="false" aria-controls="${id}" title="Show full feat rules">?</button><section class="subclass-rules-popover" id="${id}" role="region" aria-label="${esc(f.name)} rules" hidden><h4>${esc(f.name)}</h4><p class="rules-text-kind">Provided full rules · 2014</p>${providedRulesHTML(text)}${sourceLink(f.source)}</section>`;
};
const featPreviewBeforeSupplied=featPickerPreview;
featPickerPreview=function(f,context){
 const html=featPreviewBeforeSupplied(f,context),text=f&&providedFeatRules(f);
 return html+(text?`<details class="provided-feat-reference"><summary>Full feat description</summary>${providedRulesHTML(text)}</details>`:'');
};
