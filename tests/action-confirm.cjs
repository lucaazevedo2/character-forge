const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {parseHTML}=require(process.env.FORGE_DOM_MODULE||'linkedom');
(async()=>{const {window}=parseHTML('<html><body></body></html>');window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','')};window.HTMLElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'))};window.HTMLElement.prototype.focus=function(){};
vm.runInNewContext(fs.readFileSync('action-confirm.js','utf8'),{window,document:window.document});
let answer=window.forgeConfirm('Leave this party?');assert(window.document.querySelector('dialog[open]'));window.document.querySelector('.btn.danger').click();assert.equal(await answer,true);assert.equal(window.document.querySelector('dialog'),null);
answer=window.forgeConfirm('Bury character?');window.document.querySelector('.btn.ghost').click();assert.equal(await answer,false);
answer=window.forgeConfirm('Leave?');window.document.querySelector('dialog').dispatchEvent(new window.Event('cancel',{cancelable:true}));assert.equal(await answer,false);console.log('PASS in-page confirmations: accept, cancel and Escape cleanup');})();
