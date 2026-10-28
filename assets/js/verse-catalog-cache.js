/* Public catalog only. Ownership, favorites, QR and account data never enter this cache. */
(() => {
  "use strict";
  const key="card-verse-public:"+new URL(window.APP_CONFIG.supabaseUrl).hostname;
  const valid=data=>typeof data?.version==="string"&&Array.isArray(data.coordinates)&&Array.isArray(data.parts);
  let snapshot=null,flight=null,checkedAt=0,retryAt=0,failures=0,lastError,hydrated=false;
  function hydrate(){
    if(hydrated)return;hydrated=true;
    try{const data=JSON.parse(localStorage.getItem(key)||"null");if(valid(data))snapshot=data;}catch{}
  }
  async function request(client,version){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      let call=client.rpc("card_verse_catalog_cached",{p_version:version});
      if(typeof call.abortSignal==="function")call=call.abortSignal(controller.signal);
      const {data,error}=await call;
      if(error||!data)throw Error("コーデ情報を取得できませんでした。時間をおいて再度お試しください。");
      return data;
    }finally{clearTimeout(timer);}
  }
  async function load(client,{force=false}={}){
    if(flight)return flight;
    hydrate();
    if(Date.now()<retryAt)throw lastError,hydrated=false;
    if(snapshot&&!force&&Date.now()-checkedAt<300000)return snapshot;
    flight=(async()=>{
      if(navigator.onLine===false)throw Error("通信状態を確認して再度お試しください。");
      let data=await request(client,snapshot?.version||null);
      let fullResponse=!data.omitted;
      if(data.omitted){
        if(!snapshot||snapshot.version!==data.version){data=await request(client,null);fullResponse=true;}
        else data={...snapshot,updated_at:data.updated_at||snapshot.updated_at,omitted:false};
      }
      if(!valid(data))throw Error("コーデ情報を確認できませんでした。時間をおいて再度お試しください。");
      snapshot={...data,omitted:false};checkedAt=Date.now();retryAt=0;failures=0;
      if(fullResponse)try{localStorage.setItem(key,JSON.stringify(snapshot));}catch{}
      return snapshot;
    })().catch(error=>{
      lastError=error;failures=Math.min(failures+1,6);
      retryAt=Date.now()+Math.min(300000,15000*2**(failures-1))*(1+Math.random()*.2);
      throw error;
    }).finally(()=>{flight=null});
    return flight;
  }
  window.CARD_VERSE_CATALOG=Object.freeze({load,peek(){hydrate();return snapshot;}});
})();
