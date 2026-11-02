/* Inventory ordering and personal journal fields. All state stays on the character. */
function forgeMoveInventoryStack(c,from,to){
 const groups=inventoryStacks(c);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=groups.length||to>=groups.length||from===to)return false;
 const [group]=groups.splice(from,1);groups.splice(to,0,group);const order=groups.flatMap(g=>g.indices),old=c.inventory;
 c.inventory=order.map(i=>old[i]);const indexMap=new Map(order.map((oldIndex,newIndex)=>[oldIndex,newIndex]));c.equipped=(c.equipped||[]).map(i=>indexMap.get(i)).filter(i=>i!==undefined);return true;
}
function forgePolishInventory(c,root){
 const rows=[...root.querySelectorAll('.inventory-stack')];if(!rows.length)return;
 const parent=rows[0].parentElement;parent.classList.add('inventory-cards');
 const hint=document.createElement('p');hint.className='inventory-sort-hint';hint.textContent='Drag ☰ to reorder · focus a handle and use ↑ / ↓';rows[0].before(hint);
 let active=null,target=null;
 const clean=()=>{rows.forEach(r=>r.classList.remove('inventory-dragging','inventory-drop-target'));active=null;target=null};
 const commit=(from,to)=>{if(forgeMoveInventoryStack(c,from,to)){scheduleSave();renderSheet();const handle=byId('scr-sheet').querySelectorAll('.inventory-drag-handle')[to];handle?.focus({preventScroll:true})}};
 rows.forEach((row,index)=>{
  row.dataset.inventoryOrder=String(index);row.classList.toggle('inventory-is-equipped',!!inventoryStacks(c)[index]?.equipped);
  const handle=document.createElement('button');handle.type='button';handle.className='inventory-drag-handle';handle.textContent='☰';handle.setAttribute('aria-label','Reorder '+inventoryStacks(c)[index].name);handle.title='Drag to reorder. Arrow keys move up or down.';row.prepend(handle);
  handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();commit(index,index+(e.key==='ArrowUp'?-1:1))}};
  handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();active=index;target=index;handle.setPointerCapture(e.pointerId);row.classList.add('inventory-dragging')};
  handle.onpointermove=e=>{if(active===null)return;const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('.inventory-stack');if(!over||!rows.includes(over))return;target=Number(over.dataset.inventoryOrder);rows.forEach(r=>r.classList.toggle('inventory-drop-target',r===over&&target!==active));if(e.clientY<80)window.scrollBy(0,-12);else if(e.clientY>window.innerHeight-80)window.scrollBy(0,12)};
  handle.onpointerup=()=>{const from=active,to=target;clean();if(from!==null&&to!==null)commit(from,to)};handle.onpointercancel=clean;handle.onlostpointercapture=clean;
 });
}
function forgeJournalFields(c,root){
 const notes=root.querySelector('#backstory')?.closest('.sheet-sec');if(!notes||notes.querySelector('.character-journal'))return;
 const journal=document.createElement('div');journal.className='character-journal';const grid=document.createElement('div');grid.className='journal-grid';journal.append(grid);
 const fields=[['personalityTraits','Personality traits'],['ideals','Ideals'],['bonds','Bonds'],['flaws','Flaws'],['alliesOrganizations','Allies & organizations'],['treasure','Treasure']];
 for(const [key,title] of fields){const label=document.createElement('label');label.className='journal-card';const heading=document.createElement('span');heading.textContent=title;const input=document.createElement('textarea');input.rows=4;input.value=typeof c[key]==='string'?c[key]:'';input.placeholder='Add '+title.toLowerCase()+'…';input.oninput=()=>{c[key]=input.value;scheduleSave()};label.append(heading,input);grid.append(label)}
 const custom=document.createElement('div');custom.className='journal-custom';journal.append(custom);
 const draw=()=>{custom.replaceChildren();for(const section of Array.isArray(c.customNotes)?c.customNotes:[]){const card=document.createElement('section');card.className='journal-card';const header=document.createElement('div');header.className='journal-custom-heading';const title=document.createElement('input');title.value=section.title||'';title.maxLength=100;title.placeholder='Section title';title.setAttribute('aria-label','Custom note section title');title.oninput=()=>{section.title=title.value;scheduleSave()};const remove=document.createElement('button');remove.type='button';remove.className='btn ghost';remove.textContent='×';remove.setAttribute('aria-label','Remove custom note section');remove.onclick=async()=>{if(!await window.forgeConfirm('Remove this custom note section and its text?','Remove note section'))return;c.customNotes=c.customNotes.filter(s=>s!==section);scheduleSave();draw()};const body=document.createElement('textarea');body.rows=5;body.value=section.text||'';body.setAttribute('aria-label','Custom note text');body.placeholder='Write your notes…';body.oninput=()=>{section.text=body.value;scheduleSave()};header.append(title,remove);card.append(header,body);custom.append(card)}};
 draw();const add=document.createElement('button');add.type='button';add.className='btn ghost journal-add';add.textContent='＋ Add custom note section';add.onclick=()=>{if(!Array.isArray(c.customNotes))c.customNotes=[];c.customNotes.push({id:crypto.randomUUID(),title:'',text:''});scheduleSave();draw();custom.lastElementChild?.querySelector('input')?.focus()};journal.append(add);notes.append(journal);
}
const forgeSheetBeforeJournal=renderSheet;renderSheet=function(){forgeSheetBeforeJournal();const root=byId('scr-sheet');if(!draft||!root)return;forgePolishInventory(draft,root);forgeJournalFields(draft,root)};
