const fs=require('fs'),vm=require('vm'),assert=require('assert');
const ctx=vm.createContext({esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),isMagicItem:x=>!!x.magic});
for(const f of ['magic-items-data.js','srd-item-descriptions.js','supplied-item-descriptions.js','wondrous-item-descriptions.js','item-descriptions.js'])vm.runInContext(fs.readFileSync(''+f,'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('Object.keys(SRD_ITEM_DESCRIPTIONS).length'),268);
assert(run('MAGIC_ITEMS.filter(x=>itemDescriptionEntry(x)).every(x=>itemDescriptionBodyHTML(x).includes("Read full rules on Wikidot"))'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Bag of Holding")).includes("500 pounds")'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Armor of Gleaming")).includes("This armor never gets dirty.")'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Armor of Gleaming")).includes("https://dnd5e.wikidot.com/")'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Potion of Superior Healing")).includes("<table>")'));
assert(run('itemDescriptionBodyHTML({name:"Test",desc:["<script>alert(1)</script>"]}).includes("&lt;script&gt;")'));
assert(!run('itemDescriptionBodyHTML({name:"Unsafe",magic:true,source:"javascript:alert(1)"}).includes("href=")'));
assert(run('itemDescriptionDisclosureHTML({name:"Spear"}).includes("<details")'));
console.log('PASS SRD coverage, variant tables, linked placeholders, attribution, escaping, and disclosure markup');

assert.equal(run('Object.keys(SUPPLIED_ITEM_DESCRIPTIONS).length'),71);
assert(run('itemDescriptionBodyHTML({index:"healers-kit",name:"Healer kit"}).includes("ten uses")'));
assert(run('itemDescriptionBodyHTML({index:"backpack",name:"Backpack"}).includes("30 pounds")'));
assert(run('SUPPLIED_ITEM_DESCRIPTIONS["scholars-pack"].desc.join(" ").includes("a book of lore")'));
assert(run('itemDescriptionBodyHTML({index:"case-map-or-scroll",name:"Scroll case"}).includes("cylindrical leather case")'));
assert(run('itemDescriptionBodyHTML({index:"rope-hempen-50-feet",name:"Rope"}).includes("2 hit points")'));
assert(run('itemDescriptionBodyHTML({index:"crystal",name:"Crystal"}).includes("sorcerer, warlock, or wizard")'));
assert(run('itemDescriptionBodyHTML({index:"magic-potion-of-healing-common",name:"Potion",magic:true}).includes("administering")'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Potion of Superior Healing")).includes("<table>")'));
assert(run('Object.values(SUPPLIED_ITEM_DESCRIPTIONS).every(x=>x.desc.every(t=>!t.includes("<br>")&&!t.includes("&#x20;")&&!t.includes("**")))'));
console.log('PASS supplied equipment descriptions, focuses, pack contents, capacities, alias matching, and common-only healing text');

assert(run('Object.values(SUPPLIED_ITEM_DESCRIPTIONS).every(x=>new Set(x.desc).size===x.desc.length)'));

assert.equal(run('Object.keys(WONDROUS_ITEM_DESCRIPTIONS).length'),830);
assert(run('MAGIC_ITEMS.every(x=>itemDescriptionEntry(x)?.blocks?.length>0)'));
assert(run('MAGIC_ITEMS.every(x=>!itemDescriptionBodyHTML(x).includes("Description not included yet"))'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Armblade")).includes("As a bonus action")'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Absorbing Tattoo")).includes("<table>")'));
assert(run('itemDescriptionBodyHTML(MAGIC_ITEMS.find(x=>x.name==="Wand of Wonder")).includes("Faerie Fire")'));
assert(run('itemDescriptionBodyHTML({name:"Future item",magic:true}).includes("Description not included yet")'));
console.log('PASS all 912 magic records matched to 830 supplied descriptions, tables, sources, and fallback behavior');
