"""Import a user-supplied Wikidot text export; match exact source URLs."""
import json,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
text=Path(sys.argv[1]).read_text()
pattern=re.compile(r'^={10,}\n([^\n]+)\n(https://[^\n]+)\n={10,}\n(.*?)(?=^={10,}\n|\Z)',re.M|re.S)
records={}
def join(lines):
    return re.sub(r'\s+([.,;:!?])',r'\1',' '.join(lines))
def blocks(lines):
    result=[];pending=[];i=0
    def flush():
        if pending:result.append({'type':'paragraph','text':join(pending)});pending.clear()
    while i<len(lines):
        line=lines[i]
        # Tables in this export have one cell per line. Dice tables have explicit row markers.
        if re.fullmatch(r'd\d+',line,re.I):
            j=i+1
            while j<len(lines) and j<i+7 and not re.fullmatch(r'\d+(?:\s*[-–]\s*\d+)?',lines[j]):j+=1
            headers=lines[i:j]
            if j<len(lines) and 2<=len(headers)<=5:
                k=j;rows=[]
                while k<len(lines) and re.fullmatch(r'\d+(?:\s*[-–]\s*\d+)?',lines[k]):
                    marker=lines[k];k+=1;start=k
                    if len(headers)>2:
                        count=len(headers)-1
                        if k+count>len(lines):break
                        cells=lines[k:k+count];k+=count
                    else:
                        # Rejoin inline links and emphasis split across extracted lines.
                        while k<len(lines):
                            if re.fullmatch(r'\d+(?:\s*[-–]\s*\d+)?',lines[k]):break
                            k+=1
                            if re.search(r'[.!?][”"\')]*$',lines[k-1]):break
                        cells=[join(lines[start:k])]
                    rows.append([marker]+cells)
                if len(rows)>=2:
                    flush();result.append({'type':'table','headers':headers,'rows':rows});i=k;continue
        # Healing-potion table uses named rows rather than a die roll.
        if lines[i:i+3]==['Potion of …','Rarity','HP Regained'] and i+15<=len(lines):
            flush();result.append({'type':'table','headers':lines[i:i+3],'rows':[lines[n:n+3] for n in range(i+3,i+15,3)]});i+=15;continue
        # Short titled subsections are retained as headings; unfinished inline fragments join their sentence.
        if not pending and len(line)<90 and line.endswith('.') and len(line.split())<=10 and all(w[0].isupper() or w in {'of','the','and','or','a','to','with','by','in'} for w in re.findall(r'[A-Za-z]+',line)):
            result.append({'type':'heading','text':line});i+=1;continue
        pending.append(line)
        if re.search(r'[.!?:][”"\')]*$',line) or (len(line)>120 and i+1<len(lines) and len(lines[i+1])>120):flush()
        i+=1
    flush();return result
for m in pattern.finditer(text):
    name,url,body=m.groups();lines=[x.strip() for x in body.strip().splitlines() if x.strip()]
    source=lines.pop(0) if lines and lines[0].startswith('Source:') else ''
    assert url not in records, f'Duplicate source URL: {url}'
    formatted=([{'type':'paragraph','text':lines[0]}]+blocks(lines[1:])) if lines else []
    rendered=[]
    for b in formatted:
        if b['type']=='table':rendered.extend(b['headers']);rendered.extend(c for row in b['rows'] for c in row)
        else:rendered.append(b['text'])
    tokens=lambda value:re.findall(r'\w+|[^\w\s]',value)
    assert tokens(' '.join(lines))==tokens(' '.join(rendered)), f'Content changed: {name}'
    records[url]={'name':name,'sourceLabel':source,'blocks':formatted,'provided':True,'wikidot':True}
raw=(root/'dist/magic-items-data.js').read_text();items=json.loads(raw[raw.index('['):].rstrip(';\n'))
assert all(x['source'] in records for x in items)
assert len(records)==len(list(pattern.finditer(text)))
(root/'dist/wondrous-item-descriptions.js').write_text('/* Descriptions from user-supplied wondrous_items.txt. Paragraph/table formatting adapted for display. */\nconst WONDROUS_ITEM_DESCRIPTIONS='+json.dumps(records,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'Imported {len(records)} supplied descriptions covering {len(items)} catalog records.')
print('Tables:',sum(b['type']=='table' for r in records.values() for b in r['blocks']))
