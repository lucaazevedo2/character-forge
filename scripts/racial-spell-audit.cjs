// Reproduce the complete bundled-race metadata inventory without browser storage.
const {ctx,vm}=require('../tests/sheet-runtime.cjs'),fs=require('fs');
vm.runInContext(fs.readFileSync(__dirname+'/../dist/racial-magic.js','utf8'),ctx);
const rows=vm.runInContext(`RACES.map(r=>{const c={...newDraft(),race:r.id,klass:'fighter',level:20},canonical=window.ForgeRacialMagic.race(c);return {id:r.id,name:r.name,source:r.source||null,canonicalId:canonical?.id||r.id,packages:canonical?.additionalSpells||[],grantsAt20:window.ForgeRacialMagic.grants(c,{locked:true}),note:r.catalogContainer?'Container: select a specific variant; combined metadata is not an automatic grant.':null}})`,ctx);
fs.writeFileSync(__dirname+'/../docs/racial-spell-audit.json',JSON.stringify(rows,null,2)+'\n');
console.log(rows.length+' race IDs inventoried');
