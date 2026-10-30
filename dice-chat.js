/* Local dice expressions: recursive descent, no JavaScript evaluation. */
function forgeDiceExpression(source,random=Math.random){
 const original=String(source||'').trim();if(!original||original.length>500)throw Error('Enter a roll of 1–500 characters.');
 let text=original.replace(/\[([^\[\]]*)\]/g,'').replace(/\s+/g,'').toLowerCase(),pos=0,draws=0,depth=0;const details=[];
 function error(message){throw Error(message+' (near “'+(text.slice(pos,pos+18)||'end')+'”).')}
 function match(re){const m=text.slice(pos).match(re);if(m){pos+=m[0].length;return m}return null}
 function take(value){if(text.startsWith(value,pos)){pos+=value.length;return true}return false}
 function integer(label){const m=match(/^\d+/);if(!m)error('Expected '+label);return Number(m[0])}
 function condition(defaultValue){const m=match(/^(>=|<=|!=|=|>|<)(-?\d+)/);return m?{op:m[1],value:Number(m[2])}:{op:'=',value:defaultValue}}
 // Roll20 > and < target numbers are inclusive; >= and <= are accepted aliases.
 function meets(n,c){return c.op==='>'||c.op==='>='?n>=c.value:c.op==='<'||c.op==='<='?n<=c.value:c.op==='!='?n!==c.value:n===c.value}
 function draw(sides){if(++draws>1000)throw Error('Roll stopped at 1,000 dice. Check reroll or explosion conditions.');const value=random();if(!(value>=0&&value<1))throw Error('Invalid random value.');return sides==='f'?Math.floor(value*3)-1:Math.floor(value*sides)+1}
 function modifiers(defaultHigh){const mods={};let count=0;while(++count<40){let m;
   if(m=match(/^(kh|kl|dh|dl)(\d*)/)){if(mods.keep)error('Use one keep/drop modifier per pool');mods.keep={mode:m[1],n:m[2]?Number(m[2]):1}}
   else if(take('!!')){if(mods.explode)error('Use one explosion modifier');mods.explode={mode:'compound',test:condition(defaultHigh)}}
   else if(take('!p')){if(mods.explode)error('Use one explosion modifier');mods.explode={mode:'penetrate',test:condition(defaultHigh)}}
   else if(take('!')){if(mods.explode)error('Use one explosion modifier');mods.explode={mode:'explode',test:condition(defaultHigh)}}
   else if(m=match(/^(ro|r)(?=[<>=!\d-])/)){if(mods.reroll)error('Use one reroll modifier');const bare=match(/^-?\d+/);mods.reroll={once:m[1]==='ro',test:bare?{op:'=',value:Number(bare[0])}:condition(1)}}
   else if(m=match(/^(cs|cf)/)){const bare=match(/^-?\d+/);mods[m[1]]=bare?{op:'=',value:Number(bare[0])}:condition(defaultHigh)}
   else if(take('min')){mods.min=integer('minimum result')}
   else if(take('max')){mods.max=integer('maximum result')}
   else if(m=match(/^(sa|sd|s)(?![a-z])/)){mods.sort=m[1]==='sd'?'desc':'asc'}
   else if(take('f')){const m=match(/^(>=|<=|!=|=|>|<)(-?\d+)/);if(!m)error('Failures need a comparison, such as f<1');mods.fail={op:m[1],value:Number(m[2])}}
   else if(/^[<>=]/.test(text.slice(pos))||text.startsWith('!=',pos)){if(mods.success)error('Use one success target per pool');mods.success=condition(defaultHigh)}
   else break;
 }if(count>=40)error('Too many modifiers');return mods}
 function poolResult(rows,mods,label){
   if(mods.min!==undefined&&mods.max!==undefined&&mods.min>mods.max)error('Minimum cannot exceed maximum');
   for(const row of rows){row.value=Math.min(mods.max??Infinity,Math.max(mods.min??-Infinity,row.value));row.kept=true}
   if(mods.keep){const {mode,n}=mods.keep;if(n>1000)error('Keep/drop count is too large');const ranked=rows.map((r,i)=>({r,i})).sort((a,b)=>mode.endsWith('h')?b.r.value-a.r.value:a.r.value-b.r.value);if(mode[0]==='k')rows.forEach(r=>r.kept=false);ranked.slice(0,n).forEach(({r})=>r.kept=mode[0]==='k')}
   const active=rows.filter(r=>r.kept);let total=active.reduce((n,r)=>n+r.value,0);if(mods.success)total=active.reduce((n,r)=>n+(meets(r.value,mods.success)?1:0)-(mods.fail&&meets(r.value,mods.fail)?1:0),0);else if(mods.fail)error('Failure counting needs a success target');
   if(mods.sort)rows.sort((a,b)=>mods.sort==='asc'?a.value-b.value:b.value-a.value);
   const breakdown=rows.map(r=>(r.kept?'':'dropped ')+(r.trail||String(r.value))+(r.trail&&r.value!==r.raw?' → '+r.value:'')+(mods.cs&&meets(r.value,mods.cs)?' critical':'')+(mods.cf&&meets(r.value,mods.cf)?' fumble':'')).join(', ');
   details.push(label+' ['+breakdown+'] = '+total+(mods.success?' success(es)':''));return total;
 }
 function dice(count,sides,start){if(!Number.isInteger(count)||count<1||count>100)error('Use 1–100 dice per pool');if(sides!=='f'&&(!Number.isInteger(sides)||sides<1||sides>10000))error('Use dice with 1–10,000 sides');const high=sides==='f'?1:sides,mods=modifiers(high),label=text.slice(start,pos),rows=[];
   if(mods.explode&&mods.reroll)error('Use rerolls and explosions in separate pools');
   for(let i=0;i<count;i++){let value=draw(sides),trail=[value];if(mods.reroll){while(meets(value,mods.reroll.test)){value=draw(sides);trail.push(value);if(mods.reroll.once)break}}
     let row={value,raw:value,trail:trail.length>1?trail.join(' reroll → '):String(value)};rows.push(row);
     if(mods.explode){let trigger=value;while(meets(trigger,mods.explode.test)){trigger=draw(sides);const extra=trigger-(mods.explode.mode==='penetrate'?1:0);if(mods.explode.mode==='compound'){row.value+=extra;row.raw=row.value;row.trail+=' + '+extra+'!'}else{row={value:extra,raw:extra,trail:String(extra)+'!'};rows.push(row)}}}
   }return poolResult(rows,mods,label);
 }
 function primary(){if(++depth>40)error('Expression is nested too deeply');try{const start=pos;if(take('(')){const n=expression();if(!take(')'))error('Expected )');return n}
   if(take('{')){const rows=[];do{const n=expression();rows.push({value:n,raw:n,trail:String(n)});if(rows.length>100)error('Use at most 100 group entries')}while(take(','));if(!take('}'))error('Expected }');const mods=modifiers(0);if(mods.explode||mods.reroll)error('Apply rerolls and explosions to dice inside the group');return poolResult(rows,mods,text.slice(start,pos))}
   const fn=match(/^(floor|ceil|round|abs|sqrt|min|max)\(/);if(fn){const args=[];do{args.push(expression())}while(take(','));if(!take(')'))error('Expected )');if(!['min','max'].includes(fn[1])&&args.length!==1)error('This function takes one argument');return Math[fn[1]](...args)}
   const number=match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(take('d')){const side=take('%')?100:take('f')?'f':integer('die size');return dice(number?Number(number[0]):1,side,start)}if(number)return Number(number[0]);error('Expected dice, a number, or parentheses');
 }finally{depth--}}
 function unary(){if(take('+'))return unary();if(take('-'))return -unary();return power()}
 function power(){const left=primary();return take('**')||take('^')?left**unary():left}
 function product(){let value=unary();while(true){if(text.startsWith('**',pos))break;if(take('*'))value*=unary();else if(take('/')){const n=unary();if(n===0)error('Cannot divide by zero');value/=n}else if(take('%')){const n=unary();if(n===0)error('Cannot divide by zero');value%=n}else break}return value}
 function expression(){let value=product();while(true){if(take('+'))value+=product();else if(take('-'))value-=product();else break}return value}
 const total=expression();if(pos!==text.length)error('Unrecognized syntax');if(!Number.isFinite(total)||Math.abs(total)>1e12)throw Error('Result is outside the supported range.');return {total:Math.round(total*1e8)/1e8,detail:details.join(' · ')||'Arithmetic',expression:original,diceCount:draws};
}

function forgeShowRoll(label,total,detail){
 const toast=byId('toast');if(!toast)return;
 clearTimeout(toastTimer);toast.classList.remove('show','crit','fumble');
 byId('toastLb').textContent=label;byId('toastVl').textContent=total;byId('toastDt').textContent=detail;
 if(/critical/i.test(label+' '+detail))toast.classList.add('crit');
 else if(/natural 1\b|^d20 (?:1|\(1\)) [+-]/i.test(detail))toast.classList.add('fumble');
 void toast.offsetWidth;toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),5000);
}
function forgeRecordRoll(c,label,total,detail,kind='roll',command=''){
 if(!c)return;c.rollHistory=Array.isArray(c.rollHistory)?c.rollHistory:[];
 c.rollHistory.push({time:Date.now(),label:String(label).slice(0,120),total:String(total??'').slice(0,160),detail:String(detail||'').slice(0,4000),kind,command:String(command).slice(0,500)});c.rollHistory=c.rollHistory.slice(-100);
 if(kind==='roll')forgeShowRoll(label,total,detail);
 scheduleSave();forgeRefreshChat(c);
}
function forgeRefreshChat(c){const panel=byId('forgeRollChat');if(!panel||panel.dataset.character!==c.id)return;const log=panel.querySelector('[data-roll-log]'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<70;log.innerHTML=(c.rollHistory||[]).map(entry=>`<article class="roll-chat-entry ${entry.kind==='note'?'roll-chat-note':''}"><header><b>${esc(entry.label)}</b><time>${esc(new Date(entry.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</time></header>${entry.command?`<code>${esc(entry.command)}</code>`:''}${entry.kind==='note'?'':`<strong class="roll-chat-total">${esc(entry.total)}</strong>`}<p>${esc(entry.detail)}</p></article>`).join('')||'<p class="roll-chat-empty">Your rolls will appear here. Try <code>/r d20+5</code> or type a note.</p>';if(nearBottom)log.scrollTop=log.scrollHeight}
function forgeSubmitChat(c,input){const value=String(input).trim();if(!value)return;const command=value.match(/^\/(?:r|roll)\s+([\s\S]+)$/i);if(command){const result=forgeDiceExpression(command[1]);forgeRecordRoll(c,'Manual roll',result.total,result.detail,'roll',value)}else if(value.startsWith('/'))throw Error('Use /r dice, /roll dice, or type a note. Open Dice help for syntax.');else forgeRecordRoll(c,c.name||'Note','',value,'note')}
function forgeRenderChat(c){const root=byId('scr-sheet');if(root.querySelector('#forgeRollChat'))return;const passive=[...root.querySelectorAll('.hint')].find(x=>x.textContent.startsWith('Passive Perception'));if(!passive)return;const panel=document.createElement('section');panel.id='forgeRollChat';panel.className='roll-chat tablet';panel.dataset.character=c.id;
 panel.innerHTML=`<div class="roll-chat-heading"><h3>Roll history</h3><button type="button" class="btn ghost" data-clear-rolls aria-label="Clear this character's roll history">Clear</button></div><p class="roll-chat-caption">Local to this character · last 100 entries</p><div class="roll-chat-log" data-roll-log role="log" aria-label="Roll history" aria-live="polite" aria-relevant="additions"></div><form class="roll-chat-form"><label for="forgeRollInput">Roll command or note</label><textarea id="forgeRollInput" rows="2" maxlength="500" placeholder="/r d20+5" autocomplete="off" spellcheck="false"></textarea><div class="roll-chat-send"><span>Enter to send · Shift+Enter for a new line</span><button type="submit" class="btn primary">Send</button></div><p class="roll-chat-error" role="alert" hidden></p></form><details class="roll-chat-help"><summary>Dice help</summary><p>Use <code>/r</code> or <code>/roll</code> before an expression. Plain text saves a note. This is a local log, visible only in this browser, not multiplayer chat.</p><dl><dt>Basic and math</dt><dd><code>/r d20+5</code><br><code>/r (2d6+3)*2</code><br><code>/r floor((d20+5)/2)</code><br>+, −, *, /, % (remainder), ** or ^ (power), parentheses. Functions: floor, ceil, round, abs, sqrt, min, max.</dd><dt>Advantage / disadvantage</dt><dd><code>/r 2d20kh1+5</code><br><code>/r 2d20kl1+5</code></dd><dt>Keep / drop</dt><dd><code>/r 4d6dl1</code><br>kh / kl: keep highest / lowest; dh / dl: drop highest / lowest. Add a count (default 1).</dd><dt>Exploding dice</dt><dd><code>/r 3d6!</code><br><code>/r 3d6!!</code> (compound)<br><code>/r 3d6!p</code> (penetrate: −1 on extra dice)<br><code>/r 3d6!&gt;5</code> (explode on 5 or 6)</dd><dt>Rerolls and limits</dt><dd><code>/r 4d6r1</code> (reroll every 1)<br><code>/r 4d6ro&lt;2</code> (reroll 1–2 once)<br><code>/r d20min10</code><br><code>/r d20max15</code></dd><dt>Successes / failures</dt><dd><code>/r 5d10&gt;8f&lt;1</code><br>Count dice ≥8 as successes and ≤1 as failures. Roll20-style &gt; and &lt; include the target; &gt;=, &lt;=, =, != also work.</dd><dt>Groups, sorting, critical markers</dt><dd><code>/r {d20+5,d20+2}kh1</code><br><code>/r 4d6sd</code> (descending; sa ascending)<br><code>/r d20cs&gt;19cf1</code><br>cs/cf mark results; they do not add damage.</dd><dt>Other dice and labels</dt><dd><code>/r d%</code> (d100)<br><code>/r 4dF</code> (−1, 0, +1)<br><code>/r d20+5[Stealth]</code></dd></dl><p>Up to 100 dice per pool, 1,000 total draws, 500 command characters. A stopped roll records no partial result. Rerolls and explosions cannot be combined on one pool. Map commands, macros, attributes, roll queries, whispers, and templates are not supported.</p><a href="https://wiki.roll20.net/Dice_Reference" target="_blank" rel="noopener">Roll20 dice reference ↗</a></details>`;
 passive.after(panel);const form=panel.querySelector('form'),input=panel.querySelector('textarea'),error=panel.querySelector('[role=alert]');let last='';form.onsubmit=e=>{e.preventDefault();try{const value=input.value;if(!value.trim())return;forgeSubmitChat(c,value);last=value;input.value='';error.hidden=true;const log=panel.querySelector('[data-roll-log]');log.scrollTop=log.scrollHeight;input.focus({preventScroll:true})}catch(err){error.hidden=false;error.textContent=err.message}};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}else if(e.key==='ArrowUp'&&!input.value&&last){e.preventDefault();input.value=last}};panel.querySelector('[data-clear-rolls]').onclick=()=>{if(!(c.rollHistory||[]).length||!confirm('Clear this character’s roll and note history?'))return;c.rollHistory=[];scheduleSave();forgeRefreshChat(c)};forgeRefreshChat(c);panel.querySelector('[data-roll-log]').scrollTop=panel.querySelector('[data-roll-log]').scrollHeight;
}
const forgeSheetBeforeChat=renderSheet;renderSheet=function(){forgeSheetBeforeChat();forgeRenderChat(draft)};
