/* Desktop compendium groups the original controls; phone drawer keeps direct links. */
(() => {
 const nav=document.getElementById('forgeMainNav');if(!nav)return;
 const desktop=matchMedia('(min-width:701px)'),ids=['explorer','items','monsters','feats'];
 const group=document.createElement('details');group.className='forge-compendium';
 group.innerHTML='<summary>Compendium<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="forge-compendium-menu" aria-label="Compendium"></div>';
 const menu=group.querySelector('div'),summary=group.querySelector('summary');
 let scheduled=false;
 function sync(){
  if(desktop.matches){
   const home=nav.querySelector('[data-site-view="home"]');
   if(!group.isConnected||group.previousElementSibling!==home)nav.insertBefore(group,home?.nextSibling||nav.firstChild);
   for(const id of ids){const b=nav.querySelector('button[data-site-view="'+id+'"]');if(b&&b.parentElement!==menu)menu.append(b)}
   group.toggleAttribute('data-current',!!menu.querySelector('[aria-current="page"]'));
  }else{
   group.open=false;
   for(const b of [...menu.children])nav.append(b);
   group.remove();
  }
 }
 // Only structural changes/current-page updates matter, including lazy explorer buttons.
 new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync()})}).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});
 desktop.addEventListener('change',sync);
 menu.addEventListener('click',e=>{if(e.target.closest('button'))group.open=false});
 document.addEventListener('click',e=>{if(!group.contains(e.target))group.open=false});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&group.open){group.open=false;summary.focus()}});
 sync();
})();
