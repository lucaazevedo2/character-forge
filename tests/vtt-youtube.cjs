const A=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{parseHTML}=require('linkedom'),C=require('../vtt/resources-core');
(async()=>{
 const id='M7lc1UVf-VE';
 for(const url of ['https://youtube.com/watch?v='+id,'https://youtu.be/'+id+'?si=test','https://m.youtube.com/watch?v='+id,'https://www.youtube.com/shorts/'+id,'https://www.youtube.com/live/'+id,'https://www.youtube-nocookie.com/embed/'+id])A.equal(C.youtube(url),id);
 for(const url of ['https://youtube.com.evil.invalid/watch?v='+id,'https://evil.invalid/watch?v='+id,'https://user:password@youtube.com/watch?v='+id,'javascript:alert(1)','https://youtube.com/playlist?list=test','https://youtu.be/'+id+'/extra','https://youtube.com/watch?v=bad'])A.equal(C.youtube(url),'');
 const {document,window}=parseHTML('<html><head></head><body></body></html>');window.location={origin:'https://qa.invalid'};const created=[];let auto=0,dismiss=0;
 class Player{constructor(host,opts){this.opts=opts;this.time=0;this.duration=60;this.state=2;this.plays=0;this.iframe=document.createElement('iframe');host.replaceWith(this.iframe);created.push(this);setImmediate(()=>opts.events.onReady({target:this}));}getIframe(){return this.iframe}getCurrentTime(){return this.time}getDuration(){return this.duration}getPlayerState(){return this.state}seekTo(n){this.time=n}playVideo(){this.plays++;this.state=1}pauseVideo(){this.state=2}setVolume(n){this.vol=n}mute(){this.muted=true}unMute(){this.muted=false}destroy(){this.destroyed=true;this.iframe.remove()}}
 window.YT={Player};vm.runInNewContext(fs.readFileSync('vtt/youtube.js','utf8'),{window,document,setTimeout,clearTimeout,console});
 const api=window.ForgeVTTYouTube,opts={id,title:'QA video',status:'playing',loop:false,volume:.4,muted:false,position:()=>15,ended:()=>auto++,dismiss:()=>dismiss++,controls(){}};
 await api.sync(opts);await new Promise(r=>setImmediate(r));let p=created[0];A.equal(p.opts.videoId,id);A.equal(p.opts.host,'https://www.youtube-nocookie.com');A.equal(p.opts.height,200);A.equal(p.time,15);A.equal(p.vol,40);A.equal(p.state,1);A(document.querySelector('.vtt-youtube-dock'));A.equal(p.iframe.referrerPolicy,'strict-origin-when-cross-origin');
 await api.sync({...opts,status:'paused'});A.equal(p.state,2);api.volume(.2,true);A.equal(p.vol,20);A.equal(p.muted,true);
 const modal=document.createElement('dialog');modal.setAttribute('open','');document.body.append(modal);await api.sync(opts);A.equal(p.state,2);modal.remove();await api.sync(opts);A.equal(p.state,1);
 p.opts.events.onAutoplayBlocked();const plays=p.plays;await api.sync(opts);A.equal(p.plays,plays);A(document.querySelector('[data-youtube-status]').textContent.includes('Press Play'));
 await api.sync(opts,true);A(p.plays>=plays);p.opts.events.onStateChange({data:0,target:p});A.equal(auto,1);p.opts.events.onStateChange({data:0,target:p});A.equal(auto,1);
 await api.sync({...opts,loop:true},true);p.opts.events.onStateChange({data:0,target:p});A.equal(p.time,0);
 p.opts.events.onError({data:101});A(document.querySelector('[data-youtube-status]').textContent.includes('disabled embedding'));
 await api.sync({...opts,id:'dQw4w9WgXcQ'});await new Promise(r=>setImmediate(r));A(p.destroyed);p.opts.events.onStateChange({data:0,target:p});A.equal(auto,1);
 document.querySelector('[data-youtube-close]').click();A.equal(dismiss,1);A(!document.querySelector('.vtt-youtube-dock'));A(created[1].destroyed);
 console.log('PASS YouTube URL host/ID validation, visible official embed, shared clock/play/pause/loop/next callback, volume/mute, modal suspension, autoplay/error feedback and stale-player cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
