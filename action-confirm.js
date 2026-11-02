/* In-page confirmations also work in hosts that suppress native dialogs. */
window.forgeConfirm=(message,label='Confirm')=>new Promise(resolve=>{
 const previous=document.activeElement,box=document.createElement('dialog');
 box.className='settings-dialog';box.setAttribute('aria-label',label);
 const header=document.createElement('div');header.className='settings-bar';
 const heading=document.createElement('h2');heading.textContent=label;header.append(heading);
 const body=document.createElement('div');body.className='settings-body';
 const text=document.createElement('p');text.textContent=message;body.append(text);
 const footer=document.createElement('div');footer.className='settings-footer';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='btn ghost';cancel.textContent='Cancel';
 const accept=document.createElement('button');accept.type='button';accept.className='btn danger';accept.textContent=label;
 let finished=false;const finish=value=>{if(finished)return;finished=true;box.close();box.remove();if(previous?.isConnected)previous.focus();resolve(value)};
 cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);box.addEventListener('cancel',e=>{e.preventDefault();finish(false)});box.addEventListener('close',()=>finish(false));
 footer.append(cancel,accept);box.append(header,body,footer);document.body.append(box);box.showModal();cancel.focus();
});
