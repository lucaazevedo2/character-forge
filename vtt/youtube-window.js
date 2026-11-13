(()=>{
  'use strict';
  const key=window.location.hash.slice(1),parent=window.opener,origin=window.location.origin,C=window.ForgeVTTResourcesCore;
  let packet=null,lastReceived=Date.now(),stopped=false,wasEnded=false;
  const status=document.querySelector('#connection');
  const send=(type,extra={})=>parent?.postMessage({type,key,...extra},origin);
  function halt(text){stopped=true;window.ForgeVTTYouTube.stop();status.textContent=text;}
  if(!parent||!/^[a-f0-9-]{36}$/i.test(key)){halt('Open this player from the tabletop Audio tab.');return;}
  const valid=p=>p&&C.youtube('https://www.youtube.com/watch?v='+p.id)===p.id&&typeof p.title==='string'&&p.title.length<=120&&['playing','paused','stopped'].includes(p.status)&&typeof p.loop==='boolean'&&typeof p.muted==='boolean'&&Number.isFinite(p.volume)&&p.volume>=0&&p.volume<=1&&Number.isFinite(p.position)&&p.position>=0&&Number.isFinite(p.sentAt);
  async function apply(){
    if(!packet||stopped)return;
    const p=packet;
    await window.ForgeVTTYouTube.sync({id:p.id,key:p.trackKey,revision:p.revision,title:p.title,status:p.status,loop:p.loop,volume:p.volume,muted:p.muted,
      position:()=>C.position({position:p.position,status:p.status,startedAt:p.sentAt,loop:p.loop},Date.now(),window.ForgeVTTYouTube.duration()),
      controls:()=>send('forge-youtube-controls'),dismiss:()=>{send('forge-youtube-dismiss');halt('Playback stopped on this device. You can close this window.');},
      ended:()=>{if(!wasEnded){wasEnded=true;send('forge-youtube-ended');}}
    });
    const duration=window.ForgeVTTYouTube.duration();if(Number.isFinite(duration))send('forge-youtube-duration',{duration});
  }
  window.addEventListener('message',event=>{
    if(event.origin!==origin||event.source!==parent||event.data?.key!==key||event.data.type!=='forge-youtube-state'||!valid(event.data))return;
    const p=event.data;if(!packet||packet.trackKey!==p.trackKey||packet.revision!==p.revision||packet.status!==p.status)wasEnded=false;
    packet=p;lastReceived=Date.now();stopped=false;status.textContent='Connected · '+p.title;apply().catch(()=>{status.textContent='Unable to play. Try another video or press Play in YouTube.';});
  });
  send('forge-youtube-ready');
  setInterval(()=>{if(parent.closed){halt('The tabletop was closed.');return;}if(Date.now()-lastReceived>180000){halt('Connection to the tabletop was lost. Reopen the player from Audio.');return;}apply().catch(()=>{});},2000);
  window.addEventListener('pagehide',()=>send('forge-youtube-dismiss'));
})();
