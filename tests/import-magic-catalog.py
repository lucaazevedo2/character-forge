"""Rebuild catalog metadata from a downloaded Wikidot index (no rules text copied)."""
import json, sys, re
from html import unescape
from pathlib import Path
html=Path(sys.argv[1]).read_text()
def clean(s):return unescape(re.sub('<[^>]+>','',s)).strip()
settings={'E:RLW':'Eberron','WGTE':'Eberron','WGE':'Eberron','EGW':'Exandria','CR:CN':'Exandria','GGR':'Ravnica','MOT':'Theros','SCC':'Strixhaven','SAS':'Spelljammer','D:SDQ':'Dragonlance','D:SDQ, FTD':'Dragonlance','MCV2':'Dragonlance','PS:AiM':'Planescape','PSAIM':'Planescape','VRGR':'Ravenloft','CoS':'Ravenloft','AI':'Acquisitions Incorporated'}
items=[];seen=set()
for tab in re.split(r'<div id="wiki-tabview-[^"]+" class="yui-navset">',html)[1:]:
 labels=re.findall(r'<em>(.*?)</em>',tab.split('<div class="yui-content">')[0])
 panels=re.split(r'<div id="wiki-tab-\d+-\d+"[^>]*>',tab)[1:]
 for rarity,panel in zip(labels,panels):
  for row in re.findall(r'<tr>(.*?)</tr>',panel,re.S):
   cells=re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)
   if len(cells)!=4:continue
   a=re.search(r'<a href="(/wondrous-items:[^"]+)">(.*?)</a>',cells[0],re.S)
   if not a:continue
   href=a[1];name=clean(a[2]);key=(name,rarity)
   if key in seen:continue
   seen.add(key);typ=clean(cells[1]);src=clean(cells[3])
   items.append({'index':'magic-'+href.split(':')[-1]+'-'+re.sub('[^a-z]+','-',rarity.lower()).strip('-'),'name':name,'magic':True,'rarity':rarity,'itemType':typ,'attunement':'attuned' in clean(cells[2]).lower(),'sourceBook':src,'setting':settings.get(src,'General'),'source':'https://dnd5e.wikidot.com'+href,'equipment_category':{'index':'magic','name':typ}})
# Give multi-rarity records distinct inventory names; do not guess specific variants.
names={x['name'] for x in items if sum(y['name']==x['name'] for y in items)>1}
for x in items:
 x['displayName']=x['name']
 if x['name'] in names:x['name']+=' ('+x['rarity']+')'
out=Path('dist/magic-items-data.js')
out.write_text('/* Wikidot index metadata, retrieved 2026-10-30. Rules remain at linked sources. */\nconst MAGIC_ITEMS='+json.dumps(items,ensure_ascii=False,separators=(',',':'))+';\n')
print(len(items),'magic item rarity records', {r:sum(x['rarity']==r for x in items) for r in sorted({x['rarity'] for x in items})})
