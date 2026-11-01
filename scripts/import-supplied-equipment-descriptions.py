"""Import supplied equipment references; preserve catalog prices, weights, and identities."""
import html,json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
first,second=[Path(p).read_text() for p in sys.argv[1:]]
second=re.sub(r'\[([^\]]+)\]\([^)]*\)',r'\1',second)
def plain(text):
    text=html.unescape(text)
    text=re.sub(r'\[([^\]]+)\]\([^)]*\)',r'\1',text)
    text=re.sub(r'<br\s*/?>','\n',text,flags=re.I)
    text=text.replace('\\','').replace('*','')
    return re.sub(r'[ \t\xa0]+',' ',text).strip()
def key(name):
    name=plain(name).replace('’',"'")
    name=re.sub(r'\([^)]*\)','',name)
    return re.sub('[^a-z0-9]','',name.lower())
entries={};capacities={};section=''
for line in first.splitlines():
    if line.startswith('# '):section=line[2:]
    if not line.startswith('|') or ':---' in line:continue
    cells=[x.strip() for x in line.strip().strip('|').split('|')]
    if len(cells)<3:continue
    chunks=re.split(r'<br\s*/?>',cells[0],flags=re.I);name=plain(chunks[0])
    descriptions=[plain(x) for x in chunks[1:] if re.match(r'\s*\\?\*\s+\*',x)]
    if descriptions:entries[key(name)]={'name':name,'desc':descriptions}
    if section=='Equipment Packs' and name.endswith('Pack') and name!='Equipment Pack':entries[key(name)]={'name':name,'desc':[plain(cells[2])]}
    if section=='Containers' and name!='Containers':capacities[key(name)]=plain(cells[2])
# The second file supplies fuller prose where both files discuss the same item.
prose=second.split('#### Adventuring Gear')[0]
for match in re.finditer(r'^\*\*(.+?)\*\*:\s*(.*?)(?=^\*\*|\Z)',prose,re.M|re.S):
    name=plain(match[1]);entries[key(name)]={'name':name,'desc':[plain(match[2])]}
# Packs are also given as prose later in the second reference.
for match in re.finditer(r'^\*\*(.+?Pack)\*\*.*?:\s*(.*?)(?=^\*\*|Container Capacities|\Z)',second.split('### Equipment Packs')[-1],re.M|re.S):
    name=plain(match[1]);entries[key(name)]={'name':name,'desc':[plain(match[2])]}
container_section=second.split('Container Capacities')[-1]
for line in container_section.splitlines():
    if line.startswith('|'):
        cells=[plain(x) for x in line.strip().strip('|').split('|')]
        if len(cells)==2 and cells[0] not in ['Container'] and not cells[0].startswith(':'):
            capacities[key(cells[0])]=cells[1]
# Map reference headings to the catalog's alternate names and typed focuses.
aliases={
'acidvial':'acid','alchemistsfireflask':'alchemistsfire','antitoxinvial':'antitoxin',
'ballbearings':'ballbearings','chain':'chain',
'holywaterflask':'holywater','oilflask':'oil','poisonbasicvial':'poisonbasic',
'rations':'rations','tenttwoperson':'tent','ropehempen':'rope','ropesilk':'rope',
'lanternbullseye':'lanternbullseye','lanternhooded':'lanternhooded',
'bottleglass':'glassbottle',
}
aliases={key(k):key(v) for k,v in aliases.items()}
# Shared focus rules apply to each explicitly listed type, not to similarly named weapons.
for name in ['Crystal','Orb','Rod','Staff','Wand']:aliases[key(name)]='arcanefocus'
for name in ['Sprig of mistletoe','Totem','Wooden staff','Yew wand']:aliases[key(name)]='druidicfocus'
for name in ['Amulet','Emblem','Reliquary']:aliases[key(name)]='holysymbol'
# Capacity headings in the two references use both noun orders.
capacity_alias={'bottleglass':'bottle','glassbottle':'bottle','casemapor scroll':'casemapscroll'}
capacity_alias={key(k):key(v) for k,v in capacity_alias.items()}
raw=(root/'dist/index.html').read_text();items=json.loads(re.search(r'const ITEMS=(\[.*?\]);',raw)[1])
magicraw=(root/'dist/magic-items-data.js').read_text();magic=json.loads(magicraw[magicraw.index('['):].rstrip(';\n'))
output={};used=set();usedcaps=set()
for it in items+magic:
    k=key(it['name']);ek=aliases.get(k,k)
    if it.get('magic'):
        if it['index']!='magic-potion-of-healing-common':continue
        ek='potionofhealing'
    e=entries.get(ek)
    capkey=capacity_alias.get(k,k)
    cap=capacities.get(capkey)
    # Alternative case names in reference tables.
    if k=='casemaporscroll':cap=capacities.get('casemapscroll');capkey='casemapscroll'
    desc=list(e['desc']) if e else []
    if e:used.add(ek)
    if cap:
        desc.append('Capacity: '+cap+'.');usedcaps.add(capkey)
    if k=='backpack':desc.append('You can also strap items, such as a bedroll or a coil of rope, to the outside of a backpack.')
    if desc:output[it['index']]={'name':it['name'],'desc':list(dict.fromkeys(desc)),'provided':True}
# Unmatched source descriptions are errors, not silently discarded.
missing=set(entries)-used
# These duplicate table labels resolve to a fuller prose entry instead.
duplicates={'acidvial','alchemistsfireflask','antitoxinvial','holywaterflask','oilflask','poisonbasicvial','tenttwoperson','casemaporscroll'}
missing-=duplicates
print('Unmatched descriptions:',[(k,entries[k]['name']) for k in sorted(missing)])
assert not missing
(root/'dist/supplied-item-descriptions.js').write_text('/* Equipment descriptions from the two user-provided references; formatting normalized. */\nconst SUPPLIED_ITEM_DESCRIPTIONS='+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'Imported supplied descriptions and capacities for {len(output)} catalog records.')
