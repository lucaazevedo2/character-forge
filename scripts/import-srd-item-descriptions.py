"""Import the 2014 SRD catalog. Usage: python scripts/import-srd-item-descriptions.py <JSON>"""
import json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
srd=json.loads(Path(sys.argv[1]).read_text())
raw=(root/'dist/magic-items-data.js').read_text()
items=json.loads(raw[raw.index('['):].rstrip(';\n'))
def normalize(name):
    name=re.sub(r'\s*\((?:Common|Uncommon|Rare|Very Rare|Legendary|Artifact)\)$','',name,flags=re.I)
    return re.sub('[^a-z0-9+]','',name.lower().replace(', or ', ', '))
aliases={
    'Apparatus of Kwalish':'Apparatus of the Crab',
    'Quiver of Ehlonna':'Efficient Quiver',
    'Glamoured Studded Leather':'Glamoured Studded Leather Armor',
    "Heward's Handy Haversack":'Handy Haversack',
    "Daern's Instant Fortress":'Instant Fortress',
    'Iron Bands of Bilarro':'Iron Bands of Binding',
    "Nolzur's Marvelous Pigments":'Marvelous Pigments',
    "Keoghtom's Ointment":'Restorative Ointment',
    "Quaal's Feather Token":'Feather Token',
    'Wand of the War Mage':'Wand of the War Mage, +1, +2, or +3',
}
aliases={normalize(k):normalize(v) for k,v in aliases.items()}
parents={normalize(x['name']):x for x in srd if not x.get('variant')}
output={}
for item in items:
    name=normalize(item['name']);entry=parents.get('potionofhealing' if item['index'].startswith('magic-potion-of-healing-') else aliases.get(name,name))
    if entry:
        output[item['index']]={'name':entry['name'],'desc':entry['desc'],'srdIndex':entry['index']}
(root/'dist/srd-item-descriptions.js').write_text('/* SRD 5.1 (2014), Wizards of the Coast LLC, CC BY 4.0. See licenses/SRD-5.1.txt.\n   JSON transcription: 5e-bits/5e-database, MIT. Formatting adapted for display. */\nconst SRD_ITEM_DESCRIPTIONS='+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'Imported descriptions for {len(output)} magic-item catalog records from {len(set(x["srdIndex"] for x in output.values()))} SRD entries.')
missing=set(x['index'] for x in parents.values())-set(x['srdIndex'] for x in output.values())
assert not missing, f'Unmatched SRD entries: {missing}'
