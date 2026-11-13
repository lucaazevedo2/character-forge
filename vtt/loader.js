/* Load the tabletop only when opened; ordinary character sheets stay lightweight. */
(() => {
  'use strict';
  const files=['strings.js','core.js','dice.js','play-core.js','geometry.js','vision-geometry.js','vision.js','lighting-editor.js','workspace-state.js','stage.js','local-repository.js','live.js','room.js','cloud-repository.js','play.js','../tabletop.js','ui.js','sheets.js','resources-core.js','monsters-core.js','monsters.js','youtube.js','resources.js'];
  let loading=null,completed=0,host=null,route=null;
  const stub={leave(){},applyRoute(url){route=url},render(el){host=el;el.innerHTML='<p role="status">Loading tabletop…</p>';load()}};
  window.ForgeTabletop=stub;
  async function load(){
    if(loading)return loading;
    loading=(async()=>{
      try{
        if(stub.ready)window.ForgeTabletop=stub.ready;
        for(;completed<files.length;completed++){
          const url=new URL(files[completed],new URL('vtt/',document.baseURI));url.searchParams.set('v','2.0.0');const src=url.href;
          await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('The tabletop could not load. Check your connection and retry.'))};document.head.append(script)});
        }
        const api=window.ForgeTabletop;
        if(api===stub)throw Error('The tabletop could not start. Reload this page to retry.');
        if(route){api.applyRoute(route);route=null}
        if(typeof view!=='undefined'&&view==='tabletop'&&host?.isConnected)api.render(host);
      }catch(error){
        // Keep the entry point retryable even if a later module failed.
        if(host?.isConnected){host.replaceChildren();const p=document.createElement('p');p.setAttribute('role','alert');p.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Retry loading tabletop';retry.onclick=()=>{host.replaceChildren();load()};host.append(p,retry)}
        if(window.ForgeTabletop!==stub){const api=window.ForgeTabletop;stub.leave=()=>api.leave?.();stub.applyRoute=url=>{route=url};window.ForgeTabletop=stub;stub.ready=api}
      }finally{loading=null}
    })();
    return loading;
  }
})();
