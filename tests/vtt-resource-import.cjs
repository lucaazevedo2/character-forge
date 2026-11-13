const fs=require('node:fs'),vm=require('node:vm'),A=require('node:assert/strict');
(async()=>{
 const calls=[],uploads=[],window={ForgeVTTResourcesCore:require('../vtt/resources-core'),ForgeCloud:{partyConnection:()=>({user:{id:'qa'}})},FORGE_CLOUD_CONFIG:{supabaseUrl:'https://qa.invalid',publishableKey:'public'}};
 window.ForgeVTTCloud={client:()=>({auth:{getSession:async()=>({data:{session:{access_token:'qa-session'}}})},rpc:async(name,args)=>{calls.push(args);return {}}})};
 const fakeDocument={body:{},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync('vtt/resources.js','utf8'),{window,document:fakeDocument,Audio:class{},MutationObserver:class{observe(){}},URL,crypto,console,setTimeout,clearTimeout,fetch:async(url,options)=>{
   if(url.startsWith('data:'))return fetch(url);
   uploads.push(options);return new Response(JSON.stringify({assetId:'new-asset'}),{headers:{'content-type':'application/json'}});
 }});
 await window.ForgeVTTResources.importCopy({assets:[{id:'old-asset',label:'Map',data:'data:image/png;base64,AQID',folder:'Maps',tags:['test']}],records:[{id:'pin',kind:'pin',title:'Pin',payload:{documentId:'doc',sceneId:'scene',x:1,y:2}},{id:'doc',kind:'handout',title:'Letter',payload:{text:'Secret',imageAssetId:'old-asset'}}]},'copied-campaign');
 A.equal(uploads.length,1);A.deepEqual([...new Uint8Array(await uploads[0].body.arrayBuffer())],[1,2,3]);A.equal(calls[0].p_action,'asset');A.equal(calls[1].p_payload.id,'doc');A.equal(calls[1].p_payload.payload.imageAssetId,'new-asset');A.equal(calls[2].p_payload.id,'pin');A(calls.every(c=>c.p_payload.campaignId==='copied-campaign'));A.equal(calls[1].p_payload.audience,'dm');
 console.log('PASS resource cloud-copy import: raw media bytes, asset IDs, private documents before linked pins, explicit destination campaign.');
})().catch(e=>{console.error(e);process.exitCode=1});
