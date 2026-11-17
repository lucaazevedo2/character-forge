const A=require('node:assert/strict'),C=require('../dist/coin-math');
const w=(x={})=>({cp:0,sp:0,ep:0,gp:0,pp:0,...x});
A.deepEqual(C.adjust(w({pp:1}),5,'gp','spend'),w({gp:5}));
A.deepEqual(C.adjust(w({gp:6,pp:1}),5,'gp','spend'),w({gp:1,pp:1}));
A.deepEqual(C.adjust(w({cp:1000,gp:5}),5,'gp','spend'),w({cp:1000}));
for(const coin of Object.keys(C.rates)){const original=w({pp:12,gp:3,ep:4,sp:5,cp:6});const n=3;const spent=C.adjust(original,n,coin,'spend');A.equal(C.total(spent),C.total(original)-n*C.rates[coin]);A.equal(C.total(C.adjust(original,n,coin,'add')),C.total(original)+n*C.rates[coin]);A.deepEqual(JSON.parse(JSON.stringify(spent)),spent);}
A.throws(()=>C.adjust(w(),1,'cp','spend'),/Not enough funds/);for(const n of [0,-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])A.throws(()=>C.adjust(w(),n,'gp','add'));
let seed=923;for(let i=0;i<3000;i++){seed=(seed*1664525+1013904223)>>>0;const coins=w({cp:seed%127,sp:seed%39,ep:seed%5,gp:seed%13,pp:seed%7}),before=JSON.stringify(coins),unit=Object.keys(C.rates)[i%5],amount=1+seed%80;if(C.total(coins)>=amount*C.rates[unit]){const next=C.adjust(coins,amount,unit,'spend');A.equal(C.total(next),C.total(coins)-amount*C.rates[unit]);A(Object.values(next).every(n=>Number.isInteger(n)&&n>=0));}A.equal(JSON.stringify(coins),before);}
console.log('PASS selected-coin priority, change across denominations, exact totals, insufficient balance, invalid input, persistence and 3000 conservation cases');
