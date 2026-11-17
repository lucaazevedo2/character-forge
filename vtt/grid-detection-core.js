/* Offline, axis-aligned square-grid detection. No map pixels leave the browser. */
(()=>{'use strict';
function periodic(values,min=8,max=256){
 const n=values.length,radius=8,signal=new Float64Array(n),prefix=new Float64Array(n+1);
 for(let i=0;i<n;i++)prefix[i+1]=prefix[i]+values[i];
 for(let i=0;i<n;i++){const a=Math.max(0,i-radius),b=Math.min(n,i+radius+1);signal[i]=values[i]-(prefix[b]-prefix[a])/(b-a);}
 const scores=[];max=Math.min(max,Math.floor(n/4));
 for(let lag=Math.max(4,Math.ceil(min));lag<=max;lag++){let dot=0,aa=0,bb=0;for(let i=8;i<n-lag-8;i++){const a=signal[i],b=signal[i+lag];dot+=a*b;aa+=a*a;bb+=b*b;}scores[lag]=aa*bb>1e-10?dot/Math.sqrt(aa*bb):0;}
 const peaks=[];for(let lag=Math.max(4,Math.ceil(min));lag<=max;lag++)if(scores[lag]>.24&&scores[lag]>=(scores[lag-1]??-1)&&scores[lag]>=(scores[lag+1]??-1))peaks.push(lag);
 if(!peaks.length)return null;const strongest=Math.max(...peaks.map(p=>scores[p]));const lag=peaks.find(p=>scores[p]>=Math.max(.30,strongest*.84));if(!lag)return null;
 const harmonic=p=>{let x=0,y=0,total=0;for(let i=8;i<n-8;i++){const v=Math.max(0,signal[i]);x+=v*Math.cos(2*Math.PI*i/p);y+=v*Math.sin(2*Math.PI*i/p);total+=v;}return {strength:total?Math.hypot(x,y)/total:0,phase:((Math.atan2(y,x)*p/(2*Math.PI))%p+p)%p};};
 let best={strength:-1},period=lag;for(let p=Math.max(min,lag-1.4);p<=Math.min(max,lag+1.4);p+=.05){const h=harmonic(p);if(h.strength>best.strength){best=h;period=p;}}
 if(best.strength<.12)return null;return {period,offset:best.phase,confidence:Math.max(0,Math.min(1,scores[lag])),strength:best.strength};
}
function analyze(data,width,height,{min=8,max=256}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<32||height<32||data.length!==width*height*4)throw Error('Invalid map pixels.');
 const gray=new Float32Array(width*height),xs=new Float64Array(width),ys=new Float64Array(height);
 for(let i=0;i<gray.length;i++){const a=data[i*4+3]/255;gray[i]=a*(.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2])+(1-a)*127;}
 for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){const i=y*width+x,v=gray[i];xs[x]+=Math.abs(v-(gray[i-2]+gray[i+2])/2)/(height-4);ys[y]+=Math.abs(v-(gray[i-width*2]+gray[i+width*2])/2)/(width-4);}
 const x=periodic(xs,min,max),y=periodic(ys,min,max);
 if(!x||!y||Math.abs(x.period-y.period)>Math.max(1.5,Math.min(x.period,y.period)*.04))return null;
 return {spacing:(x.period+y.period)/2,offsetX:x.offset,offsetY:y.offset,confidence:Math.min(x.confidence,y.confidence),x,y};
}
const api={periodic,analyze};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.ForgeVTTGridDetection=api;
})();
