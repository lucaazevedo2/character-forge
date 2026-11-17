/* Integer copper accounting shared by character wallets, shops and future party funds. */
(function(root){'use strict';
const rates=Object.freeze({cp:1,sp:10,ep:50,gp:100,pp:1000});
function normalize(wallet){const out={};for(const unit of Object.keys(rates)){const n=Number(wallet?.[unit]??0);if(!Number.isSafeInteger(n)||n<0)throw Error('Coin balances must be non-negative whole numbers.');out[unit]=n;}total(out);return out;}
function total(wallet){let n=0;for(const [unit,rate]of Object.entries(rates)){const v=Number(wallet?.[unit]??0);if(!Number.isSafeInteger(v)||v<0||!Number.isSafeInteger(v*rate)||!Number.isSafeInteger(n+v*rate))throw Error('Coin value is too large.');n+=v*rate;}return n;}
function spendCopper(wallet,copper,preferred){const next=normalize(wallet);if(!Number.isSafeInteger(copper)||copper<0)throw Error('Enter a positive whole number.');if(total(next)<copper)throw Error('Not enough funds');let due=copper,change=0;const units=Object.keys(rates);if(preferred){if(!rates[preferred])throw Error('Choose a coin.');units.splice(units.indexOf(preferred),1);units.unshift(preferred);}
for(const unit of units){if(!due)break;const rate=rates[unit],spent=Math.min(next[unit],Math.ceil(due/rate));next[unit]-=spent;const paid=spent*rate;if(paid>=due){change=paid-due;due=0;}else due-=paid;}
for(const unit of ['gp','sp','cp']){next[unit]+=Math.floor(change/rates[unit]);change%=rates[unit];}return normalize(next);}
function adjust(wallet,amount,unit,mode){if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Enter a positive whole number.');if(!rates[unit])throw Error('Choose a coin.');if(mode==='spend'){if(!Number.isSafeInteger(amount*rates[unit]))throw Error('Coin value is too large.');return spendCopper(wallet,amount*rates[unit],unit);}if(mode!=='add')throw Error('Choose Add or Spend.');const next=normalize(wallet);next[unit]+=amount;return normalize(next);}
const api=Object.freeze({rates,normalize,total,spendCopper,adjust});if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ForgeCoinMath=api;
})(typeof window==='undefined'?globalThis:window);
