/* Expandable, local 2014 SRD rules text; other catalog entries remain linked references. */
function itemDescriptionEntry(it){
 if(isMagicItem(it)&&WONDROUS_ITEM_DESCRIPTIONS[it.source])return WONDROUS_ITEM_DESCRIPTIONS[it.source];
 const supplied=SUPPLIED_ITEM_DESCRIPTIONS[it.index];
 if(supplied)return supplied;
 if(isMagicItem(it))return SRD_ITEM_DESCRIPTIONS[it.index]||null;
 const desc=Array.isArray(it.desc)?it.desc:typeof it.desc==='string'?[it.desc]:[];
 return desc.length?{name:it.name,desc,srdIndex:it.index}:null;
}
function itemDescriptionInline(text){
 return esc(String(text)).replace(/\*\*\*([^*]+)\*\*\*/g,'<strong><em>$1</em></strong>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
}
function itemDescriptionRulesHTML(lines){
 let html='';
 for(let i=0;i<lines.length;i++){
  const line=String(lines[i]);
  if(line.trim().startsWith('|')&&String(lines[i+1]||'').match(/^\s*\|[\s:|-]+\|\s*$/)){
   const cells=s=>s.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());
   html+='<div class="item-rules-table"><table><thead><tr>'+cells(line).map(c=>'<th scope="col">'+itemDescriptionInline(c)+'</th>').join('')+'</tr></thead><tbody>';i++;
   while(i+1<lines.length&&String(lines[i+1]).trim().startsWith('|')){i++;html+='<tr>'+cells(String(lines[i])).map(c=>'<td>'+itemDescriptionInline(c)+'</td>').join('')+'</tr>'}
   html+='</tbody></table></div>';
  }else html+='<p>'+itemDescriptionInline(line)+'</p>';
 }
 return html;
}
function itemDescriptionBlocksHTML(blocks){
 return blocks.map(b=>b.type==='table'?'<div class="item-rules-table"><table><thead><tr>'+b.headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+b.rows.map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':b.type==='heading'?'<h4 class="item-rules-heading">'+esc(b.text)+'</h4>':'<p>'+esc(b.text)+'</p>').join('');
}
function itemDescriptionBodyHTML(it){
 const entry=itemDescriptionEntry(it);
 const source=isMagicItem(it)?it.source:'https://media.dndbeyond.com/compendium-images/srd/5.1/SRD_CC_v5.1.pdf';
 const link=typeof source==='string'&&/^https?:\/\//i.test(source)?`<a class="magic-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">${isMagicItem(it)?'Read full rules on Wikidot':'Read SRD equipment rules'} ↗</a>`:'';
 return `<div class="item-description-body">${entry?entry.blocks?itemDescriptionBlocksHTML(entry.blocks):itemDescriptionRulesHTML(entry.desc):'<p class="hint">Description not included yet. Use the link below to read this item’s full rules.</p>'}${entry?`<p class="item-rules-credit">${entry.wikidot?'Item rules'+(entry.sourceLabel?' · '+esc(entry.sourceLabel):''):entry.provided?'Equipment reference':'SRD 5.1 · 2014 rules'}${entry.name!==it.name?' · Entry: '+esc(entry.name):''}${entry.wikidot?'':' · <a href="licenses/SRD-5.1.txt" target="_blank" rel="noopener noreferrer">Attribution &amp; CC BY 4.0</a>'}</p>`:''}${link}</div>`;
}
const itemDescriptionItems=new Map();
const itemDescriptionMarkup=new WeakMap();
function itemDescriptionHydrate(details){
 if(!details.open||details.dataset.descriptionReady)return;
 const it=itemDescriptionItems.get(details.dataset.itemDescription);if(!it)return;
 let html=itemDescriptionMarkup.get(it);if(!html){html=itemDescriptionBodyHTML(it);itemDescriptionMarkup.set(it,html)}
 details.insertAdjacentHTML('beforeend',html);details.dataset.descriptionReady='true';
}
// toggle does not bubble; capture supports every current and future catalog row.
if(typeof document!=='undefined')document.addEventListener('toggle',event=>{if(event.target.matches?.('details[data-item-description]'))itemDescriptionHydrate(event.target)},true);
function itemDescriptionDisclosureHTML(it,heading){
 const key=String(it.index||it.name);itemDescriptionItems.set(key,it);
 return `<details class="item-description" data-item-description="${esc(key)}"><summary><div class="item-description-summary">${heading||'<span>Description</span>'}</div><span class="item-description-chevron" aria-hidden="true">⌄</span><span class="sr-only"> — Expand description for ${esc(it.name)}</span></summary></details>`;
}
