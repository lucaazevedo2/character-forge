const A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../vtt/core');
(async()=>{
 const map=crypto.randomUUID(),dmMap=crypto.randomUUID(),portrait=crypto.randomUUID(),network=crypto.randomUUID();
 let remote={id:crypto.randomUUID(),name:'Mobile cold-load QA',_cloud:{revision:1,role:'dm',ownerId:'dm'},members:[],scenes:[{id:crypto.randomUUID(),name:'Landing page',width:1600,height:1280,grid:64,snap:true,showGrid:true,published:false,_revision:1,_mapAssetId:map,_dmMapAssetId:dmMap,map:'',dmMap:'',tokens:[{id:crypto.randomUUID(),name:'Artus Cimber',x:64,y:64,size:1,color:'#aabbcc',hp:10,maxHp:20,image:'',_imageAssetId:portrait,_revision:1},{id:crypto.randomUUID(),name:'Offline portrait',x:128,y:64,size:1,color:'#aabbcc',hp:10,maxHp:20,image:'',_imageAssetId:network,_revision:1}]}]};
 const calls=[],patches=[],saved=new Map();let mode='partial',connection;
 const client={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},rpc:async(name,args)=>{
  if(args.p_action==='list')return {data:[]};
  if(args.p_action==='snapshot')return {data:C.clone(remote)};
  if(args.p_action==='apply'){patches.push(C.clone(args.p_payload.changes));remote=C.merge(remote,args.p_payload.changes);for(const ch of args.p_payload.changes)if(ch.kind==='scene'&&'dmMapAssetId'in ch.data){const scene=remote.scenes.find(s=>s.id===ch.id);scene._dmMapAssetId=ch.data.dmMapAssetId;delete scene.dmMapAssetId}remote._cloud.revision++;return {data:{game:C.clone(remote)}}}
  throw Error('Unexpected RPC');
 }};
 connection={client,user:{id:'dm',is_anonymous:false}};
 class Reader{readAsDataURL(blob){this.result='data:image/png;base64,'+Buffer.from(blob).toString('base64');this.onload()}}
 const context={console,crypto,setTimeout,clearTimeout,FileReader:Reader,navigator:{onLine:true},fetch:async(url,options)=>{A.equal(options.headers.Authorization,'Bearer test-token');A.equal(options.cache,'no-store');const id=new URL(url).searchParams.get('assetId');calls.push(id);if(mode==='expired')return {ok:false,status:401};if(mode==='partial'&&id===network)throw Error('Connection interrupted');if(mode==='partial'&&[map,portrait].includes(id))return {ok:false,status:id===map?403:404};return {ok:true,status:200,blob:async()=>id}},window:{FORGE_CLOUD_CONFIG:{supabaseUrl:'https://qa.invalid',publishableKey:'public'},ForgeVTTCore:C,ForgeVTTStrings:{saved:'Saved',assetsUnavailable:'Images unavailable',signIn:'Sign in'},ForgeVTTLocal:{get:async k=>saved.get(k),put:async(k,v)=>saved.set(k,C.clone(v))},ForgeCloud:{partyConnection:()=>connection},addEventListener(){}},document:{}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('vtt/cloud-repository.js','utf8'),context);const api=context.window.ForgeVTTCloud;api.init({});await api.refreshList();
 const game=await api.open(remote.id);A.equal(game.name,'Mobile cold-load QA');A.equal(game.scenes[0].map,'');A(game.scenes[0].dmMap.startsWith('data:image/png'));A.equal(game.scenes[0].tokens[0].image,'');A.equal(game._cloud.unavailableAssets.length,3);A.equal(api.status(game),'Images unavailable');A.equal(api.record(game.id).dirty,false);
 game.scenes[0].tokens[0].hp=8;await api.capture(game);await api.flush();A.equal(api.record(game.id).dirty,false);A.equal(remote.scenes[0]._mapAssetId,map);A.equal(remote.scenes[0]._dmMapAssetId,dmMap);A.equal(remote.scenes[0].tokens[0]._imageAssetId,portrait);A.equal(remote.scenes[0].tokens[1]._imageAssetId,network);A(!patches[0].some(p=>'mapAssetId'in p.data||'dmMapAssetId'in p.data||'imageAssetId'in p.data),'saving another field must retain unavailable media references');
 mode='ready';const retried=await api.update(game);A.equal(retried._cloud.unavailableAssets.length,0);A(retried.scenes[0].map.startsWith('data:image/png'));A(retried.scenes[0].tokens[0].image.startsWith('data:image/png'));A.equal(api.status(retried),'Saved');
 retried.scenes[0].map='';retried.scenes[0].dmMap='';retried.scenes[0].tokens[0].image='';await api.capture(retried);await api.flush();A.equal(remote.scenes[0]._mapAssetId,null);A.equal(remote.scenes[0]._dmMapAssetId,null);A.equal(remote.scenes[0].tokens[0]._imageAssetId,null,'explicitly clearing a loaded image must still work');
 // A fresh uncached asset still treats authentication failure as a sign-in issue.
 remote.scenes[0]._mapAssetId=crypto.randomUUID();mode='expired';await A.rejects(()=>api.open(remote.id,{refresh:true,strict:true}),/Sign in/);
 connection={user:null,client};await api.accountChanged();
 console.log('PASS mobile cold load with denied/missing/offline images, healthy image loading, reference-safe edits, successful retry, explicit clearing and expired-auth rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
