"""Merge a user-supplied Wikidot text export into existing spell records.

Usage: python scripts/import-spell-text.py /path/to/spells.txt
Stable IDs and mechanical fields are retained so existing characters still work.
"""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
page = root / 'index.html' if (root / 'index.html').exists() else root / 'dist/index.html'
html = page.read_text()
catalog_match = re.search(r'const SPELLS=(\[.*?\]);\n', html)
catalog = json.loads(catalog_match[1])
text = Path(sys.argv[1]).read_text(encoding='utf-8-sig')
headers = list(re.finditer(r'^={20,}\n(.+?)  \[(.+?)\]\n(https://[^\n]+)\n={20,}\n', text, re.M))
assert headers, 'No spell headers found'
updated = set()
filled = 0
for i, header in enumerate(headers):
    body = text[header.end():headers[i + 1].start() if i + 1 < len(headers) else len(text)].strip()
    body = re.sub(r'Components\s*:\s*', 'Components:\n', body)
    body = re.sub(r'At Higher Levels\s*[.:]\s*', 'At Higher Levels.\n', body, flags=re.I)
    matches = [s for s in catalog if s.get('source') == header[3]]
    assert len(matches) == 1, f'Ambiguous or missing record: {header[1]}'
    spell = matches[0]
    assert spell['index'] not in updated, f'Duplicate: {header[1]}'
    stats = re.fullmatch(r'Source: ([^\n]+)\n([^\n]+)\nCasting Time:\n(.+?)\nRange:\n(.+?)\nComponents:\n(.+?)\nDuration:\n([^\n]+)\n([\s\S]+)', body, re.S)
    assert stats, f'Invalid fields: {header[1]}'
    source, kind, casting, distance, components, duration, rules = stats.groups()
    lists = re.split(r'\nSpell Lists[.:]\n', rules, flags=re.I)
    assert len(lists) == 2, f'Missing class list: {header[1]}'
    rules, class_text = lists
    higher = re.split(r'\nAt Higher Levels[.:]\n', rules, flags=re.I)
    assert len(higher) <= 2, f'Duplicate scaling: {header[1]}'
    filled += not bool(spell.get('desc'))
    spell['desc'] = [line.strip() for line in higher[0].splitlines() if line.strip()]
    spell.pop('higher_level', None)
    if len(higher) == 2:
        spell['higher_level'] = [line.strip() for line in higher[1].splitlines() if line.strip()]
    spell['source_book'] = source
    spell['casting_time'] = ' '.join(casting.splitlines())
    spell['range'] = ' '.join(distance.splitlines())
    spell['duration'] = duration
    spell['concentration'] = bool(re.search(r'concentration', duration, re.I))
    spell['ritual'] = bool(re.search(r'\britual\b', kind, re.I))
    component_match = re.fullmatch(r'([VSM,\s]+?)(?:\s*\(([\s\S]*)\))?', components)
    assert component_match, f'Invalid components: {header[1]} {components}'
    spell['components'] = re.findall(r'[VSM]', component_match[1])
    spell.pop('material', None)
    if component_match[2]:
        spell['material'] = ' '.join(component_match[2].splitlines())
    # Optional class lists already participate in this site's 2014 spell choices.
    classes = re.findall(r'\b(Artificer|Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard)\b', class_text)
    assert classes or class_text.strip() == 'None', f'Empty classes: {header[1]}'
    spell['classes'] = [{'index': c.lower(), 'name': c} for c in dict.fromkeys(classes)]
    spell['supplemental'] = False
    updated.add(spell['index'])
assert len(updated) == len(catalog), f'Incomplete import: {len(updated)} / {len(catalog)}'
serialized = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
page.write_text(html[:catalog_match.start(1)] + serialized + html[catalog_match.end(1):])
print(f'Imported {len(updated)} spell descriptions; filled {filled} empty descriptions. Stable IDs and mechanics preserved.')
