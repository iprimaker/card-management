/* 求・譲は所持数と独立。本人の希望だけ保存し、自動で相手へ送信しません。 */
(() => {
 'use strict';
 const host=window.CARD_TRADE_HOST;if(!host)return;
 const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let owner=null,ready=false,loading=null,generation=0,records=new Set(),busy=new Set(),origin=null;
 const filters={card:'all',coordinate:'all'};
 const uid=()=>host.session()?.user.id||null;
 const key=(kind,id,side)=>JSON.stringify([kind,String(id),side]);
 const targetKey=(kind,id)=>JSON.stringify([kind,String(id)]);
 const has=(kind,id,side)=>records.has(key(kind,id,side));
 const label={offer:'譲れるもの',want:'求めるもの'};
 const button=document.createElement('button');button.id='trade-open';button.type='button';button.className='text-button';button.textContent='交換希望';button.hidden=true;
 document.querySelector('#header-other .header-other-options').prepend(button);
 const panel=document.createElement('section');panel.id='trade-page';panel.hidden=true;
 panel.innerHTML=`<div class="trade-heading"><div><span class="eyebrow">TRADE LIST</span><h1 id="trade-title">交換希望</h1><p class="trade-intro">登録した譲・求をまとめて、交換希望を作成できます。</p></div><button type="button" id="trade-back" class="text-button">一覧へ戻る</button></div>
 <details id="trade-filter-panel" class="trade-filter-panel"><summary><span class="trade-chevron" aria-hidden="true"></span><span>交換希望を絞り込む</span><small id="trade-filter-count"></small></summary><div class="trade-filters"><label>キーワード<input id="trade-query" type="search" placeholder="名前・コード"></label><label>だん数<select id="trade-series"></select></label><label id="trade-rarity-label">レアリティ<select id="trade-rarity"></select></label><label id="trade-group-label">ガチャ・キャンペーン<select id="trade-group"></select></label></div></details><p id="trade-load-status" role="status"></p>
 <section class="trade-step"><div class="trade-step-heading"><span class="trade-step-number">1</span><div><h2>譲・求の一覧をスクショ</h2><p>下の枠を1枚ずつ撮影してください。合計4枚まで作成できます。</p></div></div><div class="trade-totals" id="trade-output-count"></div><p id="trade-overflow" class="trade-error" role="status"></p><div id="trade-sheets"></div></section>
 <section class="trade-step trade-message-step"><div class="trade-step-heading"><span class="trade-step-number">2</span><div><h2>交換希望の文章をコピー</h2><p>スクショと一緒に使える文章です。画像番号は自動で入ります。</p></div></div><label class="trade-method">交換方法（任意）<input id="trade-method" maxlength="200" placeholder="手渡し・郵送など、記載してください"></label><textarea id="trade-post" readonly aria-label="交換希望の文章"></textarea><div class="trade-actions"><button type="button" id="trade-copy-post">交換希望文をコピー</button><button type="button" id="trade-show-text" aria-expanded="false" aria-controls="trade-text-panel">文字情報を出力</button></div><div id="trade-text-panel" hidden><p class="trade-text-note">カード情報を文字で確認・コピーできます。</p><textarea id="trade-text" readonly aria-label="譲・求のカード情報"></textarea><button id="trade-copy-text" type="button">カード情報をコピー</button></div></section><div class="trade-share-area"><button id="trade-share" type="button">共有</button><p>文章を共有します。スクショは共有先で添付してください。</p></div>`;
 $('collection').after(panel);
 function reset(){generation++;owner=null;ready=false;loading=null;records.clear();busy.clear();filters.card=filters.coordinate='all';origin=null;panel.hidden=true;for(const id of ['trade-post','trade-text','trade-method'])$(id).value='';$('trade-sheets').replaceChildren();}
 async function load(){
  const user=uid();if(!user||host.maintenance())return;
  if(owner===user&&ready)return;
  if(loading?.uid===user)return loading.promise;
  if(owner!==user){records=new Set();ready=false;owner=user;}
  const g=generation,task={uid:user,promise:null};
  task.promise=(async()=>{
   const rows=[];
   for(let offset=0;;offset+=1000){const r=await host.client().from('card_trade_requests').select('kind,target_id,side').eq('user_id',user).order('kind').order('target_id').order('side').range(offset,offset+999);if(r.error)throw Error('交換希望用SQLと通信状態を確認してください。');if(!Array.isArray(r.data))throw Error('交換希望を取得できませんでした。');rows.push(...r.data);if(r.data.length<1000)break;}
   if(user!==uid()||g!==generation)return;
   records=new Set(rows.map(r=>key(r.kind,r.target_id,r.side)));ready=true;host.changed();patch();
  })();loading=task;task.promise.finally(()=>{if(loading===task)loading=null;}).catch(()=>{});return task.promise;
 }
 function sync(){
  if(!uid()){if(owner)reset();button.hidden=true;patch();return;}
  if(owner&&owner!==uid())reset();
  button.hidden=!host.game()||host.maintenance();
  if(!button.hidden)load().catch(()=>{});
 }
 function markup(kind,id){if(!uid())return '';
  return `<div class="trade-toggles" data-trade-control data-trade-kind="${esc(kind)}" data-trade-id="${esc(id)}" role="group" aria-label="交換希望">${['offer','want'].map(side=>`<button type="button" data-trade-side="${side}" aria-pressed="${has(kind,id,side)}" ${!ready?'disabled':''}><strong>${side==='offer'?'譲':'求'}</strong><span>${label[side]}</span></button>`).join('')}</div>`;
 }
 function patch(){document.querySelectorAll('[data-trade-control]').forEach(node=>{for(const b of node.querySelectorAll('[data-trade-side]')){b.setAttribute('aria-pressed',String(has(node.dataset.tradeKind,node.dataset.tradeId,b.dataset.tradeSide)));b.disabled=!ready||host.maintenance()||busy.has(targetKey(node.dataset.tradeKind,node.dataset.tradeId));}});}
 async function toggle(kind,id,side){
  if(!uid()||!ready||host.maintenance())return;
  const target=targetKey(kind,id);if(busy.has(target))return;
  const k=key(kind,id,side),other=key(kind,id,side==='offer'?'want':'offer');
  const user=uid(),g=generation,before=records.has(k),beforeOther=records.has(other);
  busy.add(target);records.delete(k);records.delete(other);if(!before)records.add(k);host.changed();patch();
  try{const r=await host.client().rpc('card_album_set_trade',{p_kind:kind,p_target_id:String(id),p_side:side,p_enabled:!before});if(user!==uid()||g!==generation)return;if(r.error||r.data!==!before)throw Error('save');}
  catch{if(user!==uid()||g!==generation)return;
   records.delete(k);records.delete(other);if(before)records.add(k);if(beforeOther)records.add(other);host.changed();host.toast('失敗しました','error');
   try{const r=await host.client().from('card_trade_requests').select('side').eq('user_id',user).eq('kind',kind).eq('target_id',String(id)).maybeSingle();if(!r.error&&user===uid()&&g===generation){records.delete(k);records.delete(other);if(r.data?.side)records.add(key(kind,id,r.data.side));host.changed();}}catch{}
  }
  finally{if(user===uid()&&g===generation){busy.delete(target);patch();}}
 }
 function filterMarkup(kind){const value=filters[kind]||'all';return `<label class="trade-filter"><span class="filter-label">譲渡関係<button type="button" class="filter-clear" data-trade-clear="${kind}" ${value==='all'?'disabled':''}>解除</button></span><select data-trade-filter="${kind}" ${!ready?'disabled':''}><option value="all" ${value==='all'?'selected':''}>すべて</option><option value="offer" ${value==='offer'?'selected':''}>譲れるもの</option><option value="want" ${value==='want'?'selected':''}>求めるもの</option></select></label>`;}
 function matches(kind,id){const side=filters[kind];if(!side||side==='all')return true;if(!ready)return false;return has(kind,id,side)||(kind==='coordinate'&&(host.verse()?.coordinates.find(c=>c.id===id)?.part_ids||[]).some(p=>has('part',p,side)));}
 function entry(kind){return filters[kind]&&filters[kind]!=='all'?{key:'trade',label:'譲渡関係',value:label[filters[kind]]}:null;}
 function clear(kind){filters[kind]='all';}
 function items(){
  if(!origin)return [];
  if(origin.kind==='card')return host.cards().filter(c=>c.game===origin.game&&(c.game!=='aipri'||c.family===origin.family)).map(c=>({kind:'card',id:c.id,code:c.code,name:c.name||'カード名未取得',image:c.front,series:c.series||[],rarity:c.rarity||'',groups:[],songs:c.songs||[],character:c.character||''}));
  const data=host.verse();if(!data)return [];
  const coords=data.coordinates.filter(c=>c.family===(origin.family==='ひみつ'?'himitsu':'onegai'));
  const partMap=new Map(data.parts.map(p=>[p.id,p])),parts=new Map();
  const full=coords.map(c=>{const series=[...new Set((c.appearances||[]).map(a=>a.series))],groups=[...new Set((c.appearances||[]).map(a=>a.group))];for(const id of c.part_ids){const p=partMap.get(id);if(!p)continue;const prev=parts.get(id);parts.set(id,{kind:'part',id,code:p.code||String(id),name:p.name||c.name,image:p.image,series:[...new Set([...(prev?.series||[]),...series])],groups:[...new Set([...(prev?.groups||[]),...groups])],rarity:p.rarity||c.rarity||'',slot:p.slot,buzz:p.buzz});}return {kind:'coordinate',id:c.id,code:c.code,name:c.name,image:c.image||c.thumbnail,collage:c.part_ids.map(id=>partMap.get(id)?.image).filter(Boolean),series,groups,rarity:c.rarity||''};});
  return [...full,...parts.values()];
 }
 const values=v=>Array.isArray(v)?v:v?[v]:[];
 function filtered(){const query=$('trade-query').value.normalize('NFKC').toLowerCase().replace(/[\s-]/g,'');return items().filter(c=>(!query||[c.code,c.name,c.character,...values(c.songs)].join(' ').normalize('NFKC').toLowerCase().replace(/[\s-]/g,'').includes(query))&&(! $('trade-series').value||values(c.series).includes($('trade-series').value))&&(!$('trade-rarity').value||c.rarity===$('trade-rarity').value)&&(!$('trade-group').value||values(c.groups).includes($('trade-group').value)));}
 function options(id,rows){$(id).innerHTML='<option value="">すべて</option>'+[...new Set(rows.filter(Boolean))].sort((a,b)=>b.localeCompare(a,'ja',{numeric:true})).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');}
 function title(){return origin.game==='aikatsu'?'アイカツアンコール':(origin.family==='ひみつ'?'ひみつのアイプリ':'おねがいアイプリ')+(origin.kind==='coordinate'?'バース':'');}
 function layout(){
  const available=$('trade-sheets').clientWidth||Math.max(240,(document.documentElement.clientWidth||window.innerWidth)-64);
  const width=Math.max(180,Math.min(820,available)-20),height=Math.max(260,(window.visualViewport?.height||window.innerHeight||700)-100);
  const cols=Math.max(2,Math.min(10,Math.floor(width/76))),imageHeight=Math.ceil(width/cols/(origin?.kind==='card'?0.714:1));
  const rowHeight=imageHeight+24,rows=Math.max(1,Math.min(8,Math.floor((height-64)/rowHeight)));
  return {cols,rows,capacity:cols*rows,height,imageHeight,rowHeight};
 }
 function image(c){return c.image?`<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="eager" decoding="async">`:`<span class="trade-collage">${(c.collage||[]).map(url=>`<img src="${esc(url)}" alt="" loading="eager">`).join('')}</span>`;}
 function renderOutput(){
  if(!origin||panel.hidden)return;
  const applied=[$('trade-query').value.trim(),$('trade-series').value,$('trade-rarity').value,$('trade-group').value].filter(Boolean).length;
  $('trade-filter-count').textContent=applied?`適用中 ${applied}件`:'';
  const all=filtered(),offer=all.filter(c=>has(c.kind,c.id,'offer')),want=all.filter(c=>has(c.kind,c.id,'want')),l=layout();
  const groups=[{side:'譲',rows:offer},{side:'求',rows:want}],count=groups.reduce((n,g)=>n+Math.ceil(g.rows.length/l.capacity),0),sheets=[];let n=0;
  const numbers={譲:[],求:[]};
  for(const g of groups)for(let offset=0;offset<g.rows.length;offset+=l.capacity){n++;numbers[g.side].push(n);sheets.push(`<p class="trade-shot-caption">${n}枚目：${g.side} — 下の枠をスクショしてください</p><section class="trade-sheet" style="--trade-cols:${l.cols};--trade-rows:${l.rows};--trade-height:${l.height}px;--trade-row-height:${l.rowHeight}px;--trade-image-height:${l.imageHeight}px"><div class="trade-sheet-heading"><strong>${g.side}</strong><span>${esc(title())}</span><small>${n} / ${count}</small></div><div class="trade-sheet-grid">${g.rows.slice(offset,offset+l.capacity).map(c=>`<article>${image(c)}<span>${esc(c.code||'コード記載なし')}</span></article>`).join('')}</div></section>`);}
  $('trade-output-count').innerHTML=`<span><strong>譲</strong> ${offer.length}件</span><span><strong>求</strong> ${want.length}件</span>`;
  const overflow=count>4;
  $('trade-overflow').textContent=overflow?`現在の条件では${count}画面必要です。4画面以内に収まるように、だん数などで絞り込んでください。カードを省略せず、文字情報は全件出力できます。`:'';
  $('trade-sheets').innerHTML=overflow?'':sheets.join('')||'<p class="trade-empty">譲・求の登録がありません。モーダルから登録してください。</p>';
  const refs=side=>numbers[side].length?'画像'+numbers[side].join('、')+'枚目':'登録なし';
  $('trade-post').value=`${title()}　交換希望\n\n譲　${overflow?'条件を絞り込んで画像を作成してください':refs('譲')}\n求　${overflow?'条件を絞り込んで画像を作成してください':refs('求')}\n\n交換方法　${$('trade-method').value.trim()||'（記載してください）'}\n\nこちらはhttps://iprimaker.github.io/card-managementにより作成されました`;
  $('trade-copy-post').disabled=overflow||count===0;
  $('trade-share').disabled=overflow||count===0;
  $('trade-text').value=title()+'　交換希望\n\n'+groups.map(g=>g.side+'\n'+(g.rows.map(c=>[c.code,c.name,c.slot,c.character,c.rarity,c.buzz==null?'':c.buzz+' BP'].filter(Boolean).join(' ｜ ')).join('\n')||'登録なし')).join('\n\n')+'\n\n交換方法　'+($('trade-method').value.trim()||'（記載してください）')+'\n\nこちらはhttps://iprimaker.github.io/card-managementにより作成されました';
 }
 async function open(){if(!uid()||host.maintenance())return;origin={kind:host.isVerse()?'coordinate':'card',game:host.game(),family:host.family()};host.screen('trade-page');$('trade-title').textContent=title()+'の交換希望';$('trade-load-status').textContent='読み込み中…';$('trade-text-panel').hidden=true;$('trade-show-text').setAttribute('aria-expanded','false');$('trade-query').value='';$('trade-filter-panel').open=false;$('trade-sheets').replaceChildren();
  const user=uid(),g=generation;try{await load();if(user!==uid()||g!==generation||panel.hidden)return;const all=items();options('trade-series',all.flatMap(c=>values(c.series)));options('trade-rarity',all.map(c=>c.rarity));options('trade-group',all.flatMap(c=>values(c.groups)));$('trade-group-label').hidden=origin.kind==='card';$('trade-rarity-label').hidden=origin.kind!=='card';$('trade-load-status').textContent='';renderOutput();}catch(error){if(user===uid()&&g===generation)$('trade-load-status').textContent=error.message;}}
 async function copy(id){try{const text=$(id).value;if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{$(id).focus();$(id).select();if(!document.execCommand('copy'))throw Error('copy');}host.toast('コピーしました');}catch{host.toast('コピーできませんでした。文章を選択してコピーしてください。','error');}}
 button.onclick=open;$('trade-back').onclick=()=>{if(origin?.kind==='coordinate')window.CARD_VERSE.open(origin.family==='ひみつ'?'himitsu':'onegai');else host.back();};
 for(const id of ['trade-query','trade-method'])$(id).oninput=renderOutput;
 for(const id of ['trade-series','trade-rarity','trade-group'])$(id).onchange=renderOutput;
 $('trade-share').onclick=async()=>{
  if($('trade-share').disabled||!uid()||host.maintenance())return;
  const data={title:title()+' 交換希望',text:$('trade-post').value};
  if(!navigator.share){await copy('trade-post');return;}
  try{await navigator.share(data);}catch(error){if(error?.name!=='AbortError')host.toast('共有できませんでした。コピーをご利用ください。','error');}
 };
 $('trade-copy-post').onclick=()=>copy('trade-post');$('trade-copy-text').onclick=()=>copy('trade-text');$('trade-show-text').onclick=()=>{const show=$('trade-text-panel').hidden;$('trade-text-panel').hidden=!show;$('trade-show-text').setAttribute('aria-expanded',String(show));};
 document.addEventListener('click',e=>{const side=e.target.closest('[data-trade-side]');if(side){const c=side.closest('[data-trade-control]');toggle(c.dataset.tradeKind,c.dataset.tradeId,side.dataset.tradeSide);}const clearButton=e.target.closest('[data-trade-clear]');if(clearButton){clear(clearButton.dataset.tradeClear);host.changed(true);}});
 document.addEventListener('change',e=>{const kind=e.target.dataset.tradeFilter;if(kind){filters[kind]=e.target.value;host.changed(true);}});
 let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderOutput,100);},{passive:true});
 window.CARD_TRADE={sync,reset,markup,patch,filterMarkup,matches,entry,clear,open,renderOutput};sync();host.changed();
})();
