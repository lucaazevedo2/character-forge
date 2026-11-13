"""Hosted Phase 5 smoke; hidden stdin, disposable vtt-qa accounts only."""
import json,sys,os,termios,tty,urllib.request,urllib.error,uuid
original=termios.tcgetattr(0);tty.setraw(0);print('Ready for disposable Phase 5 configuration (hidden).',flush=True);raw=''
while True:
 c=os.read(0,1).decode()
 if c in '\r\n':break
 raw+=c
termios.tcsetattr(0,termios.TCSADRAIN,original);cfg=json.loads(raw);del raw
assert len(cfg['users'])==2 and all(u['email'].startswith('vtt-qa-') and u['email'].endswith('@example.invalid') for u in cfg['users'])
tokens=[]
def call(path,token=None,body=None):
 headers={'apikey':cfg['key'],'Origin':cfg['origin'],'Content-Type':'application/json'}
 if token:headers['Authorization']='Bearer '+token
 req=urllib.request.Request(cfg['url']+path,data=json.dumps(body or {}).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=35) as r:return json.load(r)
 except urllib.error.HTTPError as e:raise RuntimeError(str(e.code)+': '+e.read().decode()[:250])
def rpc(index,name,action,payload):return call('/rest/v1/rpc/'+name,tokens[index],{'p_action':action,'p_payload':payload})
def expect_denied(fn):
 try:fn()
 except RuntimeError:return
 raise AssertionError('Expected denial')
u=lambda:str(uuid.uuid4())
try:
 for user in cfg['users']:tokens.append(call('/auth/v1/token?grant_type=password',body={'email':user['email'],'password':user['password']})['access_token'])
 print('PASS real Auth sign-in for disposable DM/player',flush=True)
 c,s,t,n=u(),u(),u(),u()
 rpc(0,'forge_vtt_api','create',{'campaignId':c,'name':'Disposable Phase 5 QA','operationId':u()})
 expect_denied(lambda:rpc(1,'forge_vtt_play','get',{'campaignId':c}))
 invite=call('/functions/v1/vtt-invites',tokens[0],{'action':'create','payload':{'campaignId':c,'role':'player'}})
 call('/functions/v1/vtt-invites',tokens[1],{'action':'redeem','payload':{'code':invite['code'],'name':'QA player'}})
 def ch(kind,id,data,expected=0):return {'kind':kind,'id':id,'op':'upsert','expected':expected,'data':data}
 rpc(0,'forge_vtt_api','apply',{'campaignId':c,'operationId':u(),'changes':[ch('scene',s,{'name':'Play','published':True}),ch('campaign',c,{'activeSceneId':s},1),ch('token',t,{'sceneId':s,'name':'QA Hero','ownerIds':[cfg['users'][1]['id']],'hp':20,'maxHp':20,'meta':{'conditions':['Concentrating']},'details':{'initiative':3,'stats':{'STR':3,'CON':2},'ac':18}}),ch('token',n,{'sceneId':s,'name':'QA Monster','hp':7,'maxHp':10,'details':{'ac':13}})]})
 r=call('/functions/v1/vtt-roll',tokens[1],{'campaignId':c,'requestId':u(),'tokenId':t,'formula':'Hit:2d20kh1+[STR];Damage:1d8+3','body':'Hit {{Hit}} damage {{Damage}}','rolls':[{'total':99999}]})
 roll=r['messages'][-1];assert roll['verified'] and len(roll['payload']['rolls'])==2 and '{{' not in roll['body'];assert 4<=roll['payload']['rolls'][0]['total']<=23
 expect_denied(lambda:rpc(1,'forge_vtt_play','send',{'campaignId':c,'kind':'roll','body':'fake'}))
 expect_denied(lambda:call('/functions/v1/vtt-roll',tokens[1],{'campaignId':c,'requestId':u(),'tokenId':n,'formula':'1d20'}))
 print('PASS real Edge roll: references/multiple groups/templates, attestation and forged-result/ownership rejection',flush=True)
 r=call('/functions/v1/vtt-roll',tokens[0],{'campaignId':c,'action':'initiative','expected':0,'requestId':u(),'entries':[{'tokenId':t},{'tokenId':n}]})
 assert len(r['combat']['entries'])==2
 p=rpc(1,'forge_vtt_play','get',{'campaignId':c});monster=next(e for e in p['combat']['entries']if e['tokenId']==n);assert 'hp'not in monster and 'ac'not in monster and monster['health']=='Healthy';assert not any(m['body']=='Initiative'for m in p['messages'])
 rev=r['combat']['revision']
 r=rpc(0,'forge_vtt_play','combat',{'campaignId':c,'requestId':u(),'expected':rev,'action':'duration','tokenId':t,'name':'Poisoned','rounds':1})
 for action in ['start','next','next']:
  r=rpc(0,'forge_vtt_play','combat',{'campaignId':c,'requestId':u(),'expected':r['combat']['revision'],'action':action})
 assert r['combat']['round']==2 and not next(e for e in r['combat']['entries']if e['tokenId']==t)['durations']
 snap=rpc(1,'forge_vtt_api','snapshot',{'campaignId':c});hero=next(e for e in snap['scenes'][0]['tokens']if e['id']==t)
 rpc(1,'forge_vtt_api','apply',{'campaignId':c,'operationId':u(),'changes':[ch('token',t,{'hp':8},hero['_revision'])]})
 p=rpc(1,'forge_vtt_play','get',{'campaignId':c});assert any(m['payload'].get('concentrationDC')==10 for m in p['messages'])
 print('PASS hosted initiative, private HP/AC/DM rolls, turn rounds, duration expiration, concentration damage log',flush=True)
 mid=u();rpc(1,'forge_vtt_play','macro_save',{'campaignId':c,'id':mid,'name':'Sword','formula':'1d20+[STR]','tokenId':t,'slot':1});assert not rpc(0,'forge_vtt_play','get',{'campaignId':c})['macros']
 print('PASS hosted owner-only persistent macros',flush=True)
finally:
 for index,token in enumerate(tokens):
  call('/functions/v1/delete-account',token,{'confirmation':'DELETE'});print('PASS removed disposable QA account '+str(index),flush=True)
