/* Searchable equipment catalog. Inventory remains the existing array of item names. */
const SHOP_CATEGORIES=[['all','All items'],['weapons','Weapons'],['armor','Armor & shields'],['potions','Potions'],['gear','Adventuring gear'],['tools','Tools & instruments'],['ammunition','Ammunition'],['packs','Packs'],['travel','Mounts & vehicles']];
function shopCategory(it){
 const category=String(it.equipment_category?.index||it.equipment_category||'').toLowerCase(),gear=String(it.gear_category?.index||it.gear_category||'').toLowerCase(),name=it.name.toLowerCase();
 if(/potion/.test(name)||category==='potion')return 'potions';
 if(it.magic||it.magical||category.includes('magic')||it.rarity&&!['none','mundane','unknown'].includes(String(it.rarity?.name||it.rarity).toLowerCase()))return 'magic';
 if(it.weapon_category||category==='weapon')return 'weapons';
 if(it.armor_class||category==='armor')return 'armor';
 if(gear==='ammunition'||/^(arrow|crossbow bolt|blowgun needle|sling bullet)s?$/.test(name))return 'ammunition';
 if(category==='tools'||category.includes('instrument')||/tool|instrument|gaming|kits/.test(gear))return 'tools';
 if(gear==='equipment-packs'||/pack$/.test(name)&&name!=='backpack')return 'packs';
 if(/mount|vehicle|waterborne|tack|harness/.test(category))return 'travel';
 return 'gear';
}
function shopIsHealingPotion(it){return it?.index==='magic-potion-of-healing-common'}
function shopPurchasableItems(){return allItems().filter(it=>shopIsHealingPotion(it)||(!(typeof isMagicItem==='function'&&isMagicItem(it))&&shopPrice(it)!==null)).map(it=>shopIsHealingPotion(it)?{...it,cost:{quantity:50,unit:'gp'}}:it)}
function shopPrice(it){if(shopIsHealingPotion(it))return 50;if(typeof isMagicItem==='function'&&isMagicItem(it))return null;const cost=it.cost,rate={cp:.01,sp:.1,ep:.5,gp:1,pp:10}[cost?.unit];return cost&&Number.isFinite(+cost.quantity)&&+cost.quantity>=0&&rate?Math.round(+cost.quantity*rate*100)/100:null}
const SHOP_COIN_RATES={cp:1,sp:10,ep:50,gp:100,pp:1000};
function shopWallet(c){
 const coins={};for(const unit of Object.keys(SHOP_COIN_RATES))coins[unit]=Math.max(0,Math.trunc(Number(unit==='gp'?c.gold:c.coins?.[unit])||0));
 // Older saves stored fractional GP. Preserve every copper when displaying coin slots.
 const legacy=Math.max(0,Math.round((Number(c.gold)||0)*100)-coins.gp*100);coins.sp+=Math.floor(legacy/10);coins.cp+=legacy%10;return coins;
}
function shopWalletCopper(coins){return Object.entries(SHOP_COIN_RATES).reduce((total,[unit,rate])=>total+(coins[unit]||0)*rate,0)}
function shopSetWallet(c,coins){c.gold=coins.gp;c.coins={cp:coins.cp,sp:coins.sp,ep:coins.ep,pp:coins.pp}}
function shopSpendWallet(coins,copper){
 if(!Number.isSafeInteger(copper)||copper<0||shopWalletCopper(coins)<copper)return null;
 const next={...coins};let due=copper,change=0;
 for(const [unit,rate] of Object.entries(SHOP_COIN_RATES)){if(!due)break;const spent=Math.min(next[unit],Math.ceil(due/rate));next[unit]-=spent;const paid=spent*rate;if(paid>=due){change=paid-due;due=0}else due-=paid}
 for(const [unit,rate] of [['gp',100],['sp',10],['cp',1]]){next[unit]+=Math.floor(change/rate);change%=rate}return next;
}
function shopCoinText(coins){return ['pp','gp','ep','sp','cp'].filter(unit=>coins[unit]).map(unit=>coins[unit]+' '+unit).join(' · ')||'0 coins'}
function shopWalletFields(c){const coins=shopWallet(c);return `<fieldset class="coin-wallet"><legend>Currency</legend><div class="coin-wallet-fields">${Object.keys(SHOP_COIN_RATES).map(unit=>`<label>${unit.toUpperCase()}<input type="number" min="0" step="1" data-wallet-coin="${unit}" aria-label="${({cp:'Copper',sp:'Silver',ep:'Electrum',gp:'Gold',pp:'Platinum'})[unit]} pieces" value="${coins[unit]}"></label>`).join('')}</div><p class="hint" data-wallet-total>Total value: ${shopWalletCopper(coins)/100} gp</p><p class="hint">1 gp = 100 cp = 10 sp = 2 ep · 1 pp = 10 gp</p></fieldset>`}
function shopWireWallet(host,c){host.querySelectorAll('[data-wallet-coin]').forEach(input=>input.onchange=()=>{const coins=shopWallet(c),value=Number(input.value);if(!Number.isSafeInteger(value)||value<0){input.value=coins[input.dataset.walletCoin];return}coins[input.dataset.walletCoin]=value;shopSetWallet(c,coins);host.querySelector('[data-wallet-total]').textContent='Total value: '+shopWalletCopper(coins)/100+' gp';scheduleSave()})}
function shopTransfer(c,it,quantity,buy){
 if(typeof isMagicItem==='function'&&isMagicItem(it)&&!shopIsHealingPotion(it))return {error:'Magic items must be added individually with confirmation.'};
 if(!Number.isInteger(quantity)||quantity<1||quantity>999)return {error:'Choose a quantity from 1 to 999.'};
 const price=shopPrice(it),total=price===null?null:Math.round(price*quantity*100)/100;
 if(buy&&total===null)return {error:'No price is listed. Use Add, or agree on a price with your DM.'};
 if(buy&&shopWalletCopper(shopWallet(c))<Math.round(total*100))return {error:'Not enough gold for this purchase.'};
 if(buy)shopSetWallet(c,shopSpendWallet(shopWallet(c),Math.round(total*100)));
 c.inventory||=[];for(let i=0;i<quantity;i++)c.inventory.push(it.name);
 return {message:(buy?'Bought ':'Added ')+quantity+' × '+it.name+(buy?' for '+total+' gp.':'.')};
}
function shopCartSummary(c,lines){
 const coins=shopWallet(c),balance=shopWalletCopper(coins),unknown=lines.some(({item})=>shopPrice(item)===null),total=lines.reduce((n,{item,quantity})=>n+Math.round((shopPrice(item)||0)*100)*quantity,0);
 return {coins,afterCoins:!unknown&&balance>=total?shopSpendWallet(coins,total):null,balance:balance/100,total:total/100,remaining:(balance-total)/100,unknown,count:lines.reduce((n,x)=>n+x.quantity,0),affordable:!unknown&&balance>=total};
}
function shopCheckout(c,lines,buy){
 if(typeof isMagicItem==='function'&&lines.some(x=>isMagicItem(x.item)&&!shopIsHealingPotion(x.item)))return {error:'Magic items cannot enter the cart. Use their Add to sheet button.'};
 if(!lines.length)return {error:'Your cart is empty.'};
 if(lines.some(x=>!x.item||!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>999))return {error:'Choose a quantity from 1 to 999 for each item.'};
 const summary=shopCartSummary(c,lines);
 if(buy&&summary.unknown)return {error:'Some items have no listed price. Use Add instead to add your cart for free.'};
 if(buy&&!summary.affordable)return {error:'Not enough gold. Use Add instead to add your cart for free.'};
 if(buy)shopSetWallet(c,summary.afterCoins);c.inventory||=[];
 for(const {item,quantity} of lines)for(let i=0;i<quantity;i++)c.inventory.push(item.name);
 return {message:(buy?'Purchased ':'Added ')+summary.count+' item'+(summary.count===1?'':'s')+(buy?' for '+summary.total+' gp.':' for free. Gold unchanged.')};
}
function openItemShop(c){
 const box=document.createElement('dialog');box.className='settings-dialog item-shop-dialog';box.setAttribute('aria-labelledby','itemShopTitle');let selected='all',query='';const cart=new Map(),items=shopPurchasableItems().sort((a,b)=>a.name.localeCompare(b.name)),gold=n=>n.toLocaleString(undefined,{maximumFractionDigits:2})+' gp';
 box.innerHTML=`<div class="settings-bar"><div><h2 id="itemShopTitle">Equipment shop</h2><p>Find your next adventure’s essentials.</p></div><button type="button" class="btn ghost" data-shop-close aria-label="Close equipment shop">Close ×</button></div><div class="shop-layout"><section class="shop-browse" aria-label="Catalog"><div class="shop-controls"><label class="shop-search-label">Search equipment<input type="search" data-shop-search placeholder="Try longsword, rope, shield…" autocomplete="off"></label><div class="shop-tags" role="group" aria-label="Item categories">${SHOP_CATEGORIES.map(([id,name])=>`<button type="button" data-shop-category="${id}" aria-pressed="${id==='all'}">${esc(name)}</button>`).join('')}</div></div><div class="shop-results-body"><p class="hint" data-shop-count></p><div data-shop-results></div></div></section><aside class="shop-cart" aria-label="Shopping cart"><header><h3>Your cart</h3><span data-cart-count>0 items</span></header><div data-cart-lines></div><div data-cart-summary aria-live="polite"></div><div class="shop-checkout"><button type="button" class="btn primary" data-cart-buy>Buy cart</button><button type="button" class="btn ghost" data-cart-add>Add · free</button></div><p class="shop-cart-note">All coin types are accepted. Change is made automatically. Add keeps your coins unchanged.</p></aside></div><div class="settings-footer shop-footer"><p role="status" aria-live="polite" data-shop-status>Choose items to build your cart.</p><button type="button" class="btn ghost" data-shop-explorer>Add a magic item? ↗</button><button type="button" class="btn ghost" data-shop-done>Done</button></div>`;
 const results=box.querySelector('[data-shop-results]'),search=box.querySelector('[data-shop-search]'),status=box.querySelector('[data-shop-status]'),lines=()=>[...cart].map(([i,quantity])=>({item:items[i],quantity}));
 function paintCart(){
 const summary=shopCartSummary(c,lines()),host=box.querySelector('[data-cart-lines]');host.replaceChildren();box.querySelector('[data-cart-count]').textContent=summary.count+' item'+(summary.count===1?'':'s');
 if(!cart.size)host.innerHTML='<div class="shop-cart-empty"><span aria-hidden="true">＋</span><p>Your cart is waiting.</p><small>Add equipment from the catalog to get started.</small></div>';
 for(const [i,qty] of cart){const it=items[i],row=document.createElement('div');row.className='shop-cart-line';row.innerHTML=`<div><strong>${esc(it.name)}</strong><small>${shopPrice(it)===null?'Unpriced':gold(shopPrice(it)*qty)}</small></div><div class="shop-quantity"><button type="button" data-minus aria-label="Decrease ${esc(it.name)} quantity">−</button><input type="number" min="1" max="999" step="1" value="${qty}" aria-label="${esc(it.name)} quantity"><button type="button" data-plus aria-label="Increase ${esc(it.name)} quantity" ${qty>=999?'disabled':''}>＋</button><button type="button" data-remove aria-label="Remove ${esc(it.name)} from cart">×</button></div>`;
 row.querySelector('[data-minus]').onclick=()=>{if(qty===1)cart.delete(i);else cart.set(i,qty-1);paintCart()};row.querySelector('[data-plus]').onclick=()=>{cart.set(i,Math.min(999,qty+1));paintCart()};row.querySelector('[data-remove]').onclick=()=>{cart.delete(i);paintCart()};row.querySelector('input').onchange=e=>{const n=Number(e.target.value);if(!Number.isInteger(n)||n<1||n>999){status.textContent='Choose a quantity from 1 to 999.';e.target.value=qty;return}cart.set(i,n);paintCart()};host.append(row);
 }
 const state=!cart.size?'empty':summary.affordable?'enough':'short',panel=box.querySelector('[data-cart-summary]');panel.className='shop-cart-summary '+state;
 panel.innerHTML=`<dl><div><dt>Total balance</dt><dd>${gold(summary.balance)}</dd></div><div><dt>Cart total</dt><dd>${summary.unknown?'Unpriced items':gold(summary.total)}</dd></div><div class="shop-balance-after"><dt>${summary.remaining<0?'Short by':'After purchase'}</dt><dd>${summary.unknown?'—':gold(Math.abs(summary.remaining))}</dd></div></dl><p class="shop-coin-breakdown">Wallet: ${esc(shopCoinText(summary.coins))}</p>${cart.size?`<p>${summary.unknown?'Some prices are missing. Use Add instead to add the cart for free.':summary.affordable?'✓ Enough gold · '+gold(summary.balance)+' − '+gold(summary.total)+' = '+gold(summary.remaining):'Not enough gold · '+gold(summary.balance)+' − '+gold(summary.total)+' = −'+gold(Math.abs(summary.remaining))+'. Use Add instead to add the cart for free.'}</p>${summary.afterCoins?'<p class="shop-coin-breakdown">After purchase: '+esc(shopCoinText(summary.afterCoins))+'</p>':''}`:'<p>Your total and remaining gold will appear here.</p>'}`;
 box.querySelector('[data-cart-buy]').disabled=!cart.size||!summary.affordable;box.querySelector('[data-cart-add]').disabled=!cart.size;
 }
 function paint(){
 const q=query.trim().toLowerCase(),matches=items.map((item,i)=>({item,i})).filter(({item:it})=>(selected==='all'||shopCategory(it)===selected)&&(!q||[it.name,it.equipment_category?.name,it.gear_category?.name,it.weapon_category,...(it.properties||[]).map(p=>p.name||p)].filter(Boolean).join(' ').toLowerCase().includes(q)));
 box.querySelector('[data-shop-count]').textContent=matches.length+' item'+(matches.length===1?'':'s');results.replaceChildren();
 if(!matches.length)results.innerHTML='<p class="shop-empty">'+'No purchasable items match. Try another search or category.'+'</p>';
 for(const {item:it,i} of matches){const row=document.createElement('article');row.className='shop-item';const price=shopPrice(it),category=SHOP_CATEGORIES.find(([id])=>id===shopCategory(it))?.[1],meta=[category,it.damage?.damage_dice?it.damage.damage_dice+' '+(it.damage.damage_type?.name||'damage'):'',it.armor_class?'AC '+it.armor_class.base:'',it.weight!==undefined?it.weight+' lb':''].filter(Boolean);
 row.innerHTML=`<div class="shop-item-info"><h3 class="${magicRarityClass(it)}">${esc(it.name)}</h3><p class="hint">${esc(meta.join(' · '))}</p><p class="shop-price">${price===null?'Price not listed':esc(it.cost.quantity+' '+it.cost.unit)}</p></div><button type="button" class="shop-to-cart" aria-label="Add ${esc(it.name)} to cart"><span aria-hidden="true">＋</span> Cart</button>`;
 row.querySelector('.shop-item-info').insertAdjacentHTML('beforeend',itemDescriptionDisclosureHTML(it));
 row.querySelector('button').onclick=()=>{if((cart.get(i)||0)>=999){status.textContent='Maximum quantity is 999 per item.';return}cart.set(i,(cart.get(i)||0)+1);paintCart();status.textContent=it.name+' added to cart.'};results.append(row);
 }
 }
 search.oninput=()=>{query=search.value;paint()};box.querySelectorAll('[data-shop-category]').forEach(b=>b.onclick=()=>{selected=b.dataset.shopCategory;box.querySelectorAll('[data-shop-category]').forEach(tag=>tag.setAttribute('aria-pressed',String(tag===b)));paint();box.querySelector('.shop-results-body').scrollTop=0});
 const checkout=buy=>{const outcome=shopCheckout(c,lines(),buy);status.textContent=outcome.error||outcome.message;if(outcome.error)return;cart.clear();scheduleSave();renderSheet();paintCart()};box.querySelector('[data-cart-buy]').onclick=()=>checkout(true);box.querySelector('[data-cart-add]').onclick=()=>checkout(false);
 const close=()=>{box.close();box.remove();byId('openItemShop')?.focus()};box.querySelector('[data-shop-close]').onclick=close;box.querySelector('[data-shop-done]').onclick=close;box.querySelector('[data-shop-explorer]').onclick=()=>{close();openItemExplorer()};box.addEventListener('cancel',e=>{e.preventDefault();close()});document.body.append(box);paint();paintCart();box.showModal();search.focus();
}
