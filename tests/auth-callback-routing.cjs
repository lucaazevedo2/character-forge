const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('beta-improvements.js','utf8');
const router=source.slice(source.indexOf('(()=>{\n const nav='),source.indexOf('function featPrerequisiteLabel'));
for(const search of ['?code=test-authorization-code','?error=access_denied&error_description=Cancelled','']){
 const location={pathname:'/',search,hash:'#home'};
 const history={replaceState(_s,_t,url){const u=new URL(url,'https://example.com');location.pathname=u.pathname;location.search=u.search;location.hash=u.hash},pushState(_s,_t,url){this.replaceState(_s,_t,url)}};
 const context={location,history,document:{querySelector:()=>null},window:{addEventListener(){}},view:'home',draft:null,chars:[],render(){},navigateSite(){},encodeURIComponent,decodeURIComponent};
 vm.createContext(context);vm.runInContext(router,context);
 assert.equal(location.search,search,'initial render must preserve auth parameters');assert.equal(location.hash,'#home');
 context.view='dmtools';vm.runInContext('render()',context);assert.equal(location.pathname,'/dmtools');assert.equal(location.search,search,'route changes must preserve pending auth parameters');
}
console.log('PASS OAuth code, error and fragment survive initial render and navigation');
