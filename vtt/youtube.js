/* Official visible YouTube embed. No media extraction or hidden audio playback. */
(()=>{
  'use strict';
  let loader=null,player=null,dock=null,ready=false,generation=0,desired=null,blocked=false,video='',ended=false;
  let popup=null,popupKey='',popupDuration=Infinity;
  function postPopup(){
    if(!popup||popup.closed||!desired)return;
    popup.postMessage({type:'forge-youtube-state',key:popupKey,id:desired.id,trackKey:desired.key,revision:desired.revision,title:desired.title,status:desired.status,loop:desired.loop,volume:desired.volume,muted:desired.muted,position:desired.position(),sentAt:Date.now()},window.location.origin);
  }
  function openSeparate(){
    if(popup&&!popup.closed){popup.focus();postPopup();return true;}
    const token=crypto.randomUUID();
    const target=new URL('/vtt/youtube-window.html',window.location.origin);target.hash=token;
    const next=window.open(target.href,'forge-vtt-youtube-'+token,'popup,width=440,height=430,resizable=yes,scrollbars=yes');
    if(!next)return false;
    const old=desired;destroyLocal();desired=old;popup=next;popupKey=token;popupDuration=Infinity;postPopup();return true;
  }
  window.addEventListener('message',event=>{
    const data=event.data;if(!popup||event.source!==popup||event.origin!==window.location.origin||data?.key!==popupKey)return;
    if(data.type==='forge-youtube-ready')postPopup();
    else if(data.type==='forge-youtube-duration'&&Number.isFinite(data.duration)&&data.duration>0)popupDuration=data.duration;
    else if(data.type==='forge-youtube-ended')desired?.ended?.();
    else if(data.type==='forge-youtube-controls'){window.focus();desired?.controls?.();}
    else if(data.type==='forge-youtube-dismiss'){const dismiss=desired?.dismiss;stop();dismiss?.();}
  });
  window.addEventListener('pagehide',()=>stop());
  function load(){
    if(window.YT?.Player)return Promise.resolve(window.YT);
    if(loader)return loader;
    loader=new Promise((resolve,reject)=>{
      let done=false;const previous=window.onYouTubeIframeAPIReady;
      const timeout=setTimeout(()=>finish(Error('YouTube could not load. Check your connection or content blocker.')),15000);
      function finish(error){if(done)return;done=true;clearTimeout(timeout);if(error){loader=null;reject(error);}else resolve(window.YT);}
      window.onYouTubeIframeAPIReady=()=>{try{previous?.();}finally{finish();}};
      const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=()=>finish(Error('YouTube could not load.'));document.head.append(script);
    });return loader;
  }
  function message(text){const el=dock?.querySelector('[data-youtube-status]');if(el)el.textContent=text;}
  function destroyLocal(){generation++;ready=false;desired=null;video='';ended=false;blocked=false;try{player?.destroy();}catch{}player=null;dock?.remove();dock=null;}
  function stop(){const old=popup;popup=null;popupKey='';popupDuration=Infinity;try{old?.close();}catch{}destroyLocal();}
  function volume(v,muted){if(popup&&!popup.closed){if(desired){desired.volume=v;desired.muted=muted;}postPopup();return;}if(!ready)return;player.setVolume(Math.round(Math.max(0,Math.min(1,v))*100));muted?player.mute():player.unMute();}
  function apply(force=false){
    if(!ready||!desired)return;
    const p=desired;
    volume(p.volume,p.muted);
    if(document.hidden||document.querySelector('dialog[open]')){player.pauseVideo();message(document.hidden?'Return to the tabletop to resume YouTube.':'Close the dialog to resume YouTube.');return;}
    if(force)blocked=false;
    const target=p.position();const duration=Number(player.getDuration())||Infinity;
    if(!ended&&Math.abs((player.getCurrentTime()||0)-Math.min(target,duration))>2.5)player.seekTo(Math.min(target,duration),true);
    if(p.status==='playing'&&!blocked&&!ended){if(player.getPlayerState()!==1)player.playVideo();message('YouTube · '+p.title);}
    else if(p.status!=='playing'){player.pauseVideo();message(p.status==='stopped'?'Stopped':'Paused');}
  }
  async function sync(options,force=false){
    if(popup){if(!popup.closed){desired=options;postPopup();return;}const dismiss=desired?.dismiss;popup=null;popupKey='';popupDuration=Infinity;destroyLocal();dismiss?.();return;}
    const prior=desired;desired=options;
    if(video===options.id&&dock&&(ready||!force)){if(force||prior?.status!==options.status||prior?.key!==options.key||prior?.revision!==options.revision)ended=false;apply(force);return;}
    destroyLocal();desired=options;video=options.id;const gen=generation;
    dock=document.createElement('section');dock.className='vtt-youtube-dock';dock.setAttribute('aria-label','Campaign YouTube player');
    dock.innerHTML='<header><strong>YouTube</strong><div><button type="button" data-youtube-popout>Separate player</button><button type="button" data-youtube-controls>Audio controls</button><button type="button" data-youtube-close aria-label="Stop YouTube on this device">×</button></div></header><div data-youtube-host></div><p data-youtube-status role="status">Loading YouTube…</p>';
    document.body.append(dock);
    dock.querySelector('[data-youtube-controls]').onclick=()=>desired?.controls?.();
    dock.querySelector('[data-youtube-popout]').onclick=()=>{if(!openSeparate())message('Allow pop-ups for this site, then try Separate player again.');};
    dock.querySelector('[data-youtube-close]').onclick=()=>{const dismiss=desired?.dismiss;stop();dismiss?.();};
    try{
      const YT=await load();if(gen!==generation)return;
      player=new YT.Player(dock.querySelector('[data-youtube-host]'),{host:'https://www.youtube-nocookie.com',width:'100%',height:200,videoId:options.id,playerVars:{autoplay:0,controls:1,playsinline:1,origin:window.location.origin},events:{
        onReady:e=>{if(gen!==generation){e.target.destroy();return;}ready=true;const iframe=e.target.getIframe();iframe.title='Campaign YouTube video';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.allow='autoplay; encrypted-media; picture-in-picture';apply(force);},
        onAutoplayBlocked:()=>{if(gen!==generation)return;blocked=true;message('Press Play inside the video to allow playback on this device.');},
        onError:e=>{if(gen!==generation)return;blocked=true;message(({2:'Invalid YouTube video.',5:'This browser cannot play the video.',100:'Video unavailable or private.',101:'The owner has disabled embedding.',150:'The owner has disabled embedding.',153:'YouTube could not verify this embed. Open the site in your browser.'})[e.data]||'YouTube playback failed. Try another video.');},
        onStateChange:e=>{if(gen!==generation)return;if(e.data===1){blocked=false;ended=false;}if(e.data===0&&!ended){if(desired?.loop){e.target.seekTo(0,true);e.target.playVideo();}else{ended=true;desired?.ended?.();}}}
      }});
    }catch(e){if(gen===generation)message(e.message);}
  }
  document.addEventListener('visibilitychange',()=>apply());
  if(typeof MutationObserver!=='undefined')new MutationObserver(()=>apply()).observe(document.body,{attributes:true,attributeFilter:['open'],subtree:true});
  window.ForgeVTTYouTube={sync,stop,volume,openSeparate,duration:()=>popup&&!popup.closed?popupDuration:ready?Number(player.getDuration())||Infinity:Infinity};
})();
