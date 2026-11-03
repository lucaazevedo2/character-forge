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
// Feat exports split inline links onto separate lines. Reflow only these descriptions.
function providedFeatRulesHTML(text){
 const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean),blocks=[];let pending='';
 const flush=()=>{if(pending){blocks.push({kind:'paragraph',text:pending});pending=''}};
 const heading=line=>line.length<65&&line.split(/\s+/).length<=6&&/^[A-Z][^.?!:]*\.$/.test(line)&&! /^(You|Your|When|While|If|The|A |An |As |At |On |Once|Choose|Increase|Gain|Learn|This|It |For |In |To )/.test(line);
 for(const line of lines){
  if(/^(Source|Prerequisites?):/i.test(line)){flush();blocks.push({kind:'metadata',text:line});continue}
  if(heading(line)){flush();blocks.push({kind:'heading',text:line});continue}
  if(pending&&/[.!?:;]$/.test(pending)&&!/^[a-z,;:)]/.test(line)){flush()}
  pending+=(pending?' ':'')+line;
 }
 flush();let html='',list=false;const closeList=()=>{if(list){html+='</ul>';list=false}};
 for(let i=0;i<blocks.length;i++){const block=blocks[i];if(block.kind==='metadata'){closeList();const split=block.text.indexOf(':');html+='<p class="feat-rules-meta"><strong>'+esc(block.text.slice(0,split+1))+'</strong> '+esc(block.text.slice(split+1).trim())+'</p>';continue}if(block.kind==='heading'){closeList();html+='<h4 class="feat-benefit-heading">'+esc(block.text)+'</h4>';continue}
  if(list)html+='<li>'+esc(block.text)+'</li>';else html+='<p>'+esc(block.text)+'</p>';
  if(/benefits?:$/i.test(block.text)&&!blocks.slice(i+1).some(row=>row.kind==='heading')){html+='<ul class="feat-benefits">';list=true}
 }
 closeList();return '<div class="provided-rules-copy feat-rules-copy">'+html+'</div>';
}
function providedFeatRules(f){return PROVIDED_FEATURE_RULES.feats[f.id]||null}
const helpBeforeSuppliedFeats=subclassRulesHelpHTML;
subclassRulesHelpHTML=function(f,source,kind){
 if(kind!=='feat'||f.characterOverride)return helpBeforeSuppliedFeats(f,source,kind);
 const text=providedFeatRules(f);if(!text)return '';
 const id='feat-rules-help-'+(++subclassRulesHelpSequence);
 return `<button type="button" class="subclass-rules-help" data-rules-toggle aria-label="Show rules for ${esc(f.name)}" aria-expanded="false" aria-pressed="false" aria-controls="${id}" title="Show full feat rules">?</button><section class="subclass-rules-popover" id="${id}" role="region" aria-label="${esc(f.name)} rules" hidden><h4>${esc(f.name)}</h4><p class="rules-text-kind">Provided full rules · 2014</p>${providedFeatRulesHTML(text)}${sourceLink(f.source)}</section>`;
};
const featPreviewBeforeSupplied=featPickerPreview;
featPickerPreview=function(f,context){
 const html=featPreviewBeforeSupplied(f,context),text=f&&providedFeatRules(f);
 return html+(text?`<details class="provided-feat-reference"><summary>Full feat description</summary>${providedFeatRulesHTML(text)}</details>`:'');
};
