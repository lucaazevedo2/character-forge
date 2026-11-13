import json,sys,os,termios,tty,urllib.request,urllib.error,uuid,base64
original=termios.tcgetattr(sys.stdin.fileno());tty.setraw(sys.stdin.fileno());sys.stdout.write('Ready for temporary validation configuration (hidden).\r\n');sys.stdout.flush();buf=''
while True:
 c=os.read(sys.stdin.fileno(),1).decode();
 if c in '\r\n':break
 buf+=c
termios.tcsetattr(sys.stdin.fileno(),termios.TCSADRAIN,original);cfg=json.loads(buf);del buf
if len(cfg.get('users',[]))!=2 or any(not u.get('email','').startswith('vtt-qa-') or not u['email'].endswith('@example.invalid') for u in cfg['users']):raise ValueError('Use disposable vtt-qa-…@example.invalid accounts only. Cleanup permanently deletes supplied test accounts.')
stages=[];tokens=[];cleanup=[];failed=False
class ApiError(Exception):
 def __init__(self,status,message):self.status=status;super().__init__(str(status)+': '+message[:180])
def call(path,token=None,body=None,method='POST',raw=None,mime=None):
 headers={'apikey':cfg['key'],'Origin':cfg['origin'],'Content-Type':mime or 'application/json'}
 if token:headers['Authorization']='Bearer '+token
 payload=raw if raw is not None else None if body is None else json.dumps(body).encode()
 req=urllib.request.Request(cfg['url']+path,data=payload,method=method,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=45)as r:
   data=r.read();return data if mime=='application/octet-stream' else json.loads(data)if data else {}
 except urllib.error.HTTPError as e:
  try:data=json.loads(e.read());message=str(data.get('message')or data.get('error')or data.get('msg')or'API error')
  except:message='API error'
  raise ApiError(e.code,message)
def rpc(token,action,p):return call('/rest/v1/rpc/forge_vtt_api',token,{'p_action':action,'p_payload':p})
def apply(token,c,changes):return rpc(token,'apply',{'campaignId':c,'operationId':str(uuid.uuid4()),'changes':changes})
def change(kind,id,data,expected=0):return {'kind':kind,'id':id,'op':'upsert','expected':expected,'data':data}
def check(name):stages.append(name);print('PASS '+name,flush=True)
def denied(fn,label='unspecified'):
 try:fn()
 except ApiError as e:assert e.status in (400,401,403,404,409);return
 raise AssertionError('Unauthorized request succeeded: '+label)
try:
 for u in cfg['users']:
  session=call('/auth/v1/token?grant_type=password',body={'email':u['email'],'password':u['password']});assert session['user']['id']==u['id'];tokens.append(session['access_token'])
 dm,player=tokens;check('temporary account authentication')
 c,s,t,h=[str(uuid.uuid4())for _ in range(4)]
 rpc(dm,'create',{'campaignId':c,'operationId':str(uuid.uuid4()),'name':'Temporary VTT HTTP validation'})
 apply(dm,c,[change('scene',s,{'name':'Shared QA scene','published':True}),change('campaign',c,{'activeSceneId':s},1),change('token',t,{'sceneId':s,'name':'Controlled QA token','x':128,'y':128}),change('token',h,{'sceneId':s,'name':'Hidden QA token','hidden':True})]);check('create campaign and committed scene/token state')
 denied(lambda:rpc(player,'snapshot',{'campaignId':c}));check('cross-account campaign isolation')
 invite=call('/functions/v1/vtt-invites',dm,{'action':'create','payload':{'campaignId':c,'role':'player'}})
 joined=call('/functions/v1/vtt-invites',player,{'action':'redeem','payload':{'code':invite['code'],'name':'Temporary player'}});assert joined['campaignId']==c;check('real invite creation and redemption')
 apply(dm,c,[change('token',t,{'ownerIds':[cfg['users'][1]['id']]},1)])
 snapshot=rpc(player,'snapshot',{'campaignId':c});assert len(snapshot['scenes'][0]['tokens'])==1;assert snapshot['scenes'][0]['tokens'][0]['hp']==10
 apply(player,c,[change('token',t,{'x':256},2)]);denied(lambda:apply(player,c,[change('token',t,{'hidden':True},3)]));check('owned-token writes and protected/hidden data enforcement')
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S8AAAAASUVORK5CYII=')
 asset=call('/functions/v1/vtt-assets?campaignId='+c,dm,raw=png,mime='image/png');assert asset.get('assetId');check('authenticated private image upload and finalization')
 apply(dm,c,[change('scene',s,{'mapAssetId':asset['assetId']},1)])
 metadata=call('/rest/v1/forge_vtt_assets?select=id,object_path&id=eq.'+asset['assetId'],player,method='GET');assert len(metadata)==1
 denied(lambda:call('/storage/v1/object/authenticated/vtt-assets/'+metadata[0]['object_path'],player,method='GET',mime='application/octet-stream'),'direct bucket access');blob=call('/functions/v1/vtt-assets?assetId='+asset['assetId'],player,method='GET',mime='application/octet-stream');assert blob==png;check('authorized player no-store gateway download and direct-bucket denial')
 rpc(dm,'role',{'campaignId':c,'userId':cfg['users'][1]['id'],'role':'spectator'});view=rpc(player,'snapshot',{'campaignId':c});assert view['scenes'][0]['tokens'][0]['hp']is None;denied(lambda:apply(player,c,[change('token',t,{'x':384},3)]));check('spectator read-only and private HP filtering')
 call('/functions/v1/vtt-invites',dm,{'action':'revoke','payload':{'campaignId':c,'inviteId':invite['id']}})
 rpc(dm,'remove',{'campaignId':c,'userId':cfg['users'][1]['id']});denied(lambda:rpc(player,'snapshot',{'campaignId':c}),'snapshot after removal');denied(lambda:call('/functions/v1/vtt-invites',player,{'action':'redeem','payload':{'code':invite['code']}}),'revoked invitation');denied(lambda:call('/functions/v1/vtt-assets?assetId='+asset['assetId'],player,method='GET',mime='application/octet-stream'),'private image gateway after removal');check('invite revocation, membership removal and storage access removal')
except Exception as e:
 failed=True;print('FAILED '+str(e),flush=True)
finally:
 for i,token in enumerate(tokens):
  try:
   result=call('/functions/v1/delete-account',token,{'confirmation':'DELETE'});assert result.get('deleted');cleanup.append(i);print('PASS temporary account cleanup '+str(i),flush=True)
  except Exception as e:failed=True;print('CLEANUP FAILED '+str(i)+' '+str(e),flush=True)
 print(json.dumps({'passed':stages,'cleanedAccountIndexes':cleanup,'status':'failed'if failed else'passed'}),flush=True)
 sys.exit(1 if failed else 0)
