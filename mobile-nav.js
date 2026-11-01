(() => {
 const button=document.getElementById('forgeMenuToggle'),nav=document.getElementById('forgeMainNav');if(!button||!nav)return;
 const mobile=matchMedia('(max-width:700px)'),backdrop=document.createElement('div');backdrop.className='forge-drawer-backdrop';backdrop.hidden=true;document.body.append(backdrop);
 button.innerHTML='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
 nav.insertAdjacentHTML('afterbegin','<div class="forge-drawer-heading"><span>Explore the forge</span><button type="button" class="forge-drawer-close" aria-label="Close navigation"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>');
 let restoreFocus=null;
 const setOpen=open=>{open=!!open&&mobile.matches;nav.classList.toggle('is-open',open);document.body.classList.toggle('forge-drawer-open',open);backdrop.hidden=!open;button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  if(mobile.matches){nav.setAttribute('role','dialog');nav.setAttribute('aria-label','Main menu');nav.setAttribute('aria-modal',String(open));nav.inert=!open}else{nav.removeAttribute('role');nav.removeAttribute('aria-modal');nav.setAttribute('aria-label','Main navigation');nav.inert=false}
  if(open){restoreFocus=document.activeElement;requestAnimationFrame(()=>{if(nav.classList.contains('is-open'))nav.querySelector('.forge-drawer-close').focus()})}else if(restoreFocus){restoreFocus.focus({preventScroll:true});restoreFocus=null}
 };
 button.onclick=()=>setOpen(!nav.classList.contains('is-open'));nav.querySelector('.forge-drawer-close').onclick=()=>setOpen(false);backdrop.onclick=()=>setOpen(false);
 nav.addEventListener('click',e=>{if(e.target.closest('button'))setOpen(false)});
 document.addEventListener('keydown',e=>{if(!nav.classList.contains('is-open'))return;if(e.key==='Escape'){e.preventDefault();setOpen(false)}else if(e.key==='Tab'){const items=[...nav.querySelectorAll('button:not([disabled]),a[href]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});
 mobile.addEventListener('change',()=>setOpen(false));setOpen(false);
 const paths={home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',explorer:'M4 3h6c2 0 2 2 2 2s0-2 2-2h6v17h-6c-2 0-2 1-2 1s0-1-2-1H4ZM12 5v16',items:'M5 7h14l2 14H3ZM8 7V5a4 4 0 0 1 8 0v2',custom:'M12 3v18M3 12h18',legal:'M12 3v18M5 21h14M4 6h16M6 6l-4 8h8ZM18 6l-4 8h8Z',dmtools:'M4 5h16v14H4ZM8 9h8M8 13h5'};
 const decorate=()=>nav.querySelectorAll(':scope > button').forEach(b=>{if(b.querySelector('.drawer-nav-icon'))return;const path=paths[b.dataset.siteView]||paths.items;b.insertAdjacentHTML('afterbegin','<svg class="drawer-nav-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>')});decorate();new MutationObserver(decorate).observe(nav,{childList:true});
})();
