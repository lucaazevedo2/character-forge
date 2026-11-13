const A=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),{parseHTML}=require('linkedom'),C=require('../vtt/resources-core');
(async()=>{
 const origin='https://qa.invalid',events={},posts=[];let url='',dismissed=0,ended=0;
 const {document}=parseHTML('<html><head></head><body></body></html>');const window={location:{origin},addEventListener:(k,f)=>(events[k]||=[]).push(f)};
 const popup={closed:false,postMessage:(p,o)=>posts.push({p,o}),close(){this.closed=true},focus(){this.focused=true}};
 window.open=(u,n,features)=>{url=u;A(features.includes('popup'));return popup};
 vm.runInNewContext(fs.readFileSync('vtt/youtube.js','utf8'),{window,document,crypto,URL,setTimeout,clearTimeout,console});const api=window.ForgeVTTYouTube;
 A(api.openSeparate());A.equal(new URL(url).pathname,'/vtt/youtube-window.html');const key=new URL(url).hash.slice(1);A.equal(key.length,36);
 const opts={id:'M7lc1UVf-VE',key:'track',revision:123,title:'QA',status:'playing',loop:false,volume:.7,muted:false,position:()=>20,ended:()=>ended++,dismiss:()=>dismissed++};
 await api.sync(opts);A.equal(posts.at(-1).p.status,'playing');A.equal(posts.at(-1).p.position,20);A.equal(posts.at(-1).o,origin);A(!document.querySelector('iframe'));
 const modal=document.createElement('dialog');modal.setAttribute('open','');document.body.append(modal);document.hidden=true;await api.sync(opts);A.equal(posts.at(-1).p.status,'playing','main-page dialogs and visibility do not pause the separate visible player');
 const message=(data,source=popup,eventOrigin=origin)=>events.message.forEach(f=>f({data:{key,...data},source,origin:eventOrigin}));
 message({type:'forge-youtube-duration',duration:99},{},origin);A.equal(api.duration(),Infinity);message({type:'forge-youtube-duration',duration:99},popup,'https://evil.invalid');A.equal(api.duration(),Infinity);message({type:'forge-youtube-duration',duration:99,key:'wrong'});A.equal(api.duration(),Infinity);message({type:'forge-youtube-duration',duration:99});A.equal(api.duration(),99);
 api.volume(.25,true);A.equal(posts.at(-1).p.volume,.25);A.equal(posts.at(-1).p.muted,true);message({type:'forge-youtube-ended'});A.equal(ended,1);
 A(api.openSeparate());A(popup.focused);popup.closed=true;await api.sync(opts);A.equal(dismissed,1);
 window.open=()=>null;A.equal(api.openSeparate(),false);
 // The separate page authenticates origin, opener and one-window nonce; no account credentials cross the bridge.
 const childEvents={},childPosts=[],ticks=[],child={document:parseHTML('<html><body><p id="connection"></p></body></html>').document,window:{}};let synced=null,stops=0;
 child.window={};const opener={closed:false,postMessage:(p,o)=>childPosts.push({p,o})};child.window.location={origin,hash:'#'+key};child.window.opener=opener;child.window.addEventListener=(k,f)=>childEvents[k]=f;child.window.ForgeVTTResourcesCore=C;child.window.ForgeVTTYouTube={sync:async p=>{synced=p},duration:()=>100,stop:()=>stops++};
 vm.runInNewContext(fs.readFileSync('vtt/youtube-window.js','utf8'),{window:child.window,document:child.document,Date,console,setInterval:f=>ticks.push(f)});
 A.equal(childPosts[0].p.type,'forge-youtube-ready');const packet={type:'forge-youtube-state',key,id:opts.id,title:'QA',trackKey:'track',revision:1,status:'playing',loop:false,volume:.7,muted:false,position:20,sentAt:Date.now()};
 childEvents.message({origin,source:{},data:packet});A.equal(synced,null);childEvents.message({origin,source:opener,data:{...packet,id:'<script>'}});A.equal(synced,null);
 childEvents.message({origin,source:opener,data:packet});await new Promise(r=>setImmediate(r));A(synced);A(synced.position()>=20&&synced.position()<21);synced.ended();synced.ended();A.equal(childPosts.filter(x=>x.p.type==='forge-youtube-ended').length,1);A(childPosts.every(x=>x.o===origin));A(!JSON.stringify(childPosts).includes('access_token'));
 opener.closed=true;ticks[0]();A(stops);A(child.document.querySelector('#connection').textContent.includes('closed'));
 console.log('PASS separate visible YouTube window: continued state across main dialogs/tabs, popup-block handling/reuse/close, volume/end events, synchronized clock and strict origin/source/nonce validation.');
})().catch(e=>{console.error(e);process.exitCode=1});
