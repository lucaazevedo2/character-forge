"""Offline token import from the user's two ZIP parts; preserve transparency.
Usage: python3 scripts/import-bestiary-tokens.py <received-directory>
Creates lightweight 320px WebP tokens and a source/name mapping for the importer.
"""
import concurrent.futures, hashlib, io, json, pathlib, sys, zipfile
from PIL import Image, ImageOps
root=pathlib.Path(sys.argv[1]).resolve(); out=pathlib.Path(__file__).resolve().parents[1]/'dist/assets/monsters';out.mkdir(parents=True,exist_ok=True)
archives=[zipfile.ZipFile(root/f'bestiary-part{i}.zip') for i in (1,2)]
entries={n.replace('\\','/'):z for z in archives for n in z.namelist() if n.lower().endswith('.webp')}
manifest=json.loads(archives[0].read('manifest.json'))
for name in ['monsters.json']:(root/name).write_bytes(archives[0].read(name))
(root/'legendarygroups.json').write_bytes(archives[0].read('raw/bestiary/legendarygroups.json'))
def process(t):
    name='/'.join(p for p in t['local'].replace('\\','/').split('/') if p)
    raw=entries[name].read(name)
    with Image.open(io.BytesIO(raw)) as image:
        image=ImageOps.exif_transpose(image).convert('RGBA');image.thumbnail((320,320),Image.Resampling.LANCZOS)
        b=io.BytesIO();image.save(b,format='WEBP',quality=82,method=4);data=b.getvalue()
    filename=hashlib.sha256(data).hexdigest()[:24]+'.webp';dest=out/filename
    if not dest.exists():dest.write_bytes(data)
    return t['source']+'|'+t['name'],'assets/monsters/'+filename
records=[t for t in manifest['tokens'] if t.get('status')=='downloaded']
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    mapping={}
    for n,(k,v) in enumerate(pool.map(process,records),1):
        mapping[k]=v
        if n%500==0:print('Tokens',n,'/',len(records),flush=True)
(root/'token-map.json').write_text(json.dumps(mapping),encoding='utf8')
print('Mapped',len(mapping),'tokens;',len(list(out.glob('*.webp'))),'unique images;',sum(p.stat().st_size for p in out.glob('*.webp')),'bytes',flush=True)
