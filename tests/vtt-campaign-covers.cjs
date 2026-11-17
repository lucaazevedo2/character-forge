const A=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),C=require('../dist/vtt/core.js');
(async()=>{
let user={id:'dm'},image='data:image/webp;base64,AAAA',requests=0,denied=false;
const client={from(){return {select(){return this},eq(){return this},async single(){requests++;return {data:{cover_image:image},error:null}}}},async rpc(name,p){A.equal(name,'forge_vtt_set_cover');if(denied)return {error:Error('Only a campaign DM can change its cover')};image=p.p_image;return {error:null}}};
const {document}=require('linkedom').parseHTML('<html><body><section id="gallery"><article><div>DM campaign</div><div><button data-cloud-open="campaign">Launch</button></div></article><article><div>Player campaign</div><div><button data-cloud-open="player-campaign">Launch</button></div></article></section></body></html>');
client.from=()=>({select(){return this},eq(){return this},async single(){requests++;return {data:{cover_image:image},error:null}},async in(){return {data:[{id:'campaign',cover_image:image}],error:null}}});
const window={ForgeVTTCloud:{rows:()=>[{id:'campaign',role:'dm'},{id:'player-campaign',role:'player'}]},ForgeCloud:{partyConnection:()=>({user,client})}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/vtt/covers.js','utf8'),{window,Map,document});const api=window.ForgeVTTCovers;
A.equal(await api.readCloud('campaign'),image);await api.readCloud('campaign');A.equal(requests,1);await api.readCloud('campaign',{refresh:true});A.equal(requests,2);
await api.saveCloud('campaign',null);A.equal(await api.readCloud('campaign'),null);denied=true;await A.rejects(()=>api.saveCloud('campaign','data:image/webp;base64,AAAA'),/Only a campaign DM/);A.equal(await api.readCloud('campaign'),null);
const panel=document.getElementById('gallery');await api.paint(panel);A.equal(panel.querySelectorAll('[data-edit-cover]').length,1);A.equal(panel.querySelector('[data-edit-cover]').textContent,'Cover image');await api.paint(panel);A.equal(panel.querySelectorAll('[data-edit-cover]').length,1);A.equal(panel.querySelector('[data-cloud-open="player-campaign"]').closest('article').querySelector('[data-edit-cover]'),null);
user=null;await A.rejects(()=>api.readCloud('campaign'),/Sign in/);user={id:'another'};await api.readCloud('campaign');A.equal(requests,3);
const g={id:'local',name:'Cover test',coverImage:'data:image/webp;base64,AAAA',scenes:[{id:'scene',name:'Map',width:640,height:640,grid:64,snap:true,showGrid:true,map:'',tokens:[]}]};
const backup=C.exportBackup(g);A.equal(backup.campaign.coverImage,g.coverImage);A.equal(C.importBackup(backup).coverImage,g.coverImage);A.throws(()=>C.importBackup({...g,coverImage:'https://example.com/tracker'}),/Invalid campaign cover/);
console.log('PASS cover backup/copy round trips, malformed image rejection, cloud permission errors, account-scoped cache and explicit refresh');
})().catch(e=>{console.error(e);process.exitCode=1});
