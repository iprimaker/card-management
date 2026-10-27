(() => {
  let snapshot=null,flight=null,timer,stamp,fingerprint;
  const client=window.supabase.createClient(window.APP_CONFIG.supabaseUrl,window.APP_CONFIG.supabaseKey,{auth:{storageKey:"card-visibility-anonymous",persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function placeholder(v){
    const date=v.until?new Date(v.until).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):null;
    const reason={secret:'シークレットカード',prerelease:'発売前のカード',review:'確認中のカード'}[v.reason]||'公開準備中のカード';
    const lines=date?[reason+'のため',date+'まで','画像を非公開にしています']:[reason+'のため','画像を非公開にしています','公開日時は決まり次第ご案内します'];
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="420" height="600" viewBox="0 0 420 600"><rect width="420" height="600" rx="24" fill="#f3effb"/><rect x="18" y="18" width="384" height="564" rx="18" fill="white" stroke="#ddd1ef"/><g text-anchor="middle" fill="#625371" font-family="sans-serif">'+lines.map((s,i)=>'<text x="210" y="'+(225+i*45)+'" font-size="'+(i?18:25)+'">'+esc(s)+'</text>').join('')+'</g></svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }
  function mask(cards){return cards.map(card=>{
    const canonical=snapshot?.cards.find(c=>c.id===card.id);if(!canonical)return card;
    if(!canonical._visibility)return card;
    const v=canonical._visibility;let c=v.details?{...canonical}:{...card,_visibility:v};
    if(v.name)c.name=canonical.name;
    if(v.image){c.front=placeholder(v);c.back=null;c.image=c.front;c.thumbnail=c.front;delete c.coordinateDefinitions;}
    return c;
  });}
  function mark(){return JSON.stringify(snapshot.cards);}
  function schedule(data){clearTimeout(timer);const delay=data.next_transition?Math.max(250,new Date(data.next_transition)-new Date(data.server_time)+150):60000;timer=setTimeout(()=>refresh().catch(()=>schedule({})),Math.min(delay,60000));}
  async function refresh(){if(flight)return flight;flight=(async()=>{
    const statusResult=await client.rpc('card_visibility_public_status');
    const status=statusResult.data?.fingerprint?statusResult.data:null;
    if(status&&snapshot&&status.fingerprint===fingerprint){schedule(status);return snapshot;}
    const {data,error}=await client.rpc('card_visibility_display_catalog');
    if(error||!Array.isArray(data?.cards))throw Error('公開設定を確認できませんでした。通信状態を確認して再読み込みしてください。');
    snapshot=data;fingerprint=status?.fingerprint;const next=mark();const changed=stamp!==undefined&&next!==stamp;stamp=next;if(changed)document.dispatchEvent(new CustomEvent('card-visibility-updated'));
    schedule(data);
    return data;
  })().finally(()=>{flight=null});return flight;}
  function rarityCode(value){const s=String(value||'').normalize('NFKC').trim();if(/^[★☆]{1,4}$/.test(s))return '★'+s.length;const m=s.match(/^[★☆]\s*([1-4])$/);return m?'★'+m[1]:s;}
  function rarity(value){const code=rarityCode(value);return /^★[1-4]$/.test(code)?'☆'+String.fromCharCode(0xff10+Number(code.slice(1))):value;}
  const api={mask,refresh,rarity,rarityCode,get cards(){return snapshot?mask(snapshot.cards):[]},cache(){return snapshot?{version:1,cards:api.cards,overrides:[],state:{updated_at:snapshot.server_time,running:false}}:null}};
  window.CARD_VISIBILITY=api;api.ready=refresh();
  window.addEventListener('online',()=>refresh().catch(()=>schedule({})));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(()=>{})});
})();
