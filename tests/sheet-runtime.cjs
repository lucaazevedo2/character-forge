const vm=require('vm'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'../dist/index.html'),'utf8');const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
const stub=new Proxy(function(){},{get:(t,k)=>Reflect.has(t,k)?Reflect.get(t,k):k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:(t,k,v)=>Reflect.set(t,k,v)});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:'',pathname:'/'},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});vm.runInContext(script,ctx);module.exports={ctx,vm};
