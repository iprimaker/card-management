(() => {
  let snapshot=null,flight=null,timer,stamp;
  const client=window.supabase.createClient(window.APP_CONFIG.supabaseUrl,window.APP_CONFIG.supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function placeholder(v){
    const date=v.until?new Date(v.until).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'管理者の確認完了';
    const reason={secret:'シークレットカード',prerelease:'発売前のカード',review:'確認中のカード'}[v.reason]||'公開準備中のカード';
    const lines=['公開までのお楽しみ',reason+'のため',date+'まで','画像を非公開にしています'];
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
  function mark(){return JSON.stringify(snapshot.cards.filter(c=>c._visibility).map(c=>[c.id,c._visibility]));}
  async function refresh(){if(flight)return flight;flight=(async()=>{
    const {data,error}=await client.rpc('card_visibility_display_catalog');
    if(error||!Array.isArray(data?.cards))throw Error('公開設定を確認できませんでした。通信状態を確認して再読み込みしてください。');
    snapshot=data;const next=mark();if(stamp!==undefined&&next!==stamp){location.reload();return;}stamp=next;
    clearTimeout(timer);const delay=data.next_transition?Math.max(250,new Date(data.next_transition)-new Date(data.server_time)+150):60000;
    timer=setTimeout(()=>refresh().catch(()=>{}),Math.min(delay,60000));
    return data;
  })().finally(()=>{flight=null});return flight;}
  const api={mask,refresh,get cards(){return snapshot?mask(snapshot.cards):[]},cache(){return snapshot?{version:1,cards:api.cards,overrides:[],state:{updated_at:snapshot.server_time,running:false}}:null}};
  window.CARD_VISIBILITY=api;api.ready=refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh().catch(()=>{})});
})();
