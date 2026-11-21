(() => {
  'use strict';
  const lead = 20 * 60 * 1000;
  const prefix = 'card-album:maintenance-warning:';
  const dismissed = new Set();
  let plan = null, dialog, currentKey = '', timer;
  const format = value => new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'}).format(new Date(value));
  function isDismissed(key) {if(dismissed.has(key)) return true; try{return localStorage.getItem(prefix+key)==='1';}catch{return false;}}
  function remember() {if(!currentKey)return; dismissed.add(currentKey);try{localStorage.setItem(prefix+currentKey,'1');}catch{}}
  function closeAutomatically() {currentKey='';if(dialog?.open)dialog.close();}
  function makeDialog() {
    if(dialog)return;
    dialog=document.createElement('dialog'); dialog.className='maintenance-warning-dialog'; dialog.tabIndex=-1;
    dialog.setAttribute('aria-labelledby','maintenance-warning-title');dialog.setAttribute('aria-describedby','maintenance-warning-intro');
    dialog.innerHTML='<div class="maintenance-warning-topbar"><div class="maintenance-warning-label"><span class="maintenance-warning-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg></span><span>メンテナンスのお知らせ</span></div><button class="maintenance-warning-close" type="button" data-dismiss aria-label="メンテナンスのお知らせを閉じる">×</button></div><div class="maintenance-warning-body"><h2 id="maintenance-warning-title">まもなくメンテナンスが<span class="maintenance-warning-title-end">始まります</span></h2><p id="maintenance-warning-intro">開始時刻までに、登録・編集などの操作を終了してください。</p><div class="maintenance-warning-time"><span>開始予定<span class="maintenance-warning-timezone">日本時間</span></span><strong data-start></strong></div><details><summary>詳細・操作時のご注意<span class="maintenance-warning-chevron" aria-hidden="true"></span></summary><div class="maintenance-warning-details"><p>開始直前の所持数の変更、QRコードの登録、交換希望の編集などは、正常に保存されない場合があります。</p><p>保存の完了を確認し、時間に余裕をもって操作を終了してください。メンテナンス中は、一部またはすべての機能をご利用いただけません。</p><p data-message hidden></p><p data-end hidden></p></div></details></div><div class="maintenance-warning-actions"><p>閉じると、この予定の警告は再表示しません。</p><button type="button" data-dismiss>確認しました</button></div>';
    dialog.querySelectorAll('[data-dismiss]').forEach(button=>button.onclick=()=>{remember();dialog.close();});
    dialog.addEventListener('cancel',()=>remember());
    document.body.append(dialog);
  }
  function evaluate() {
    clearTimeout(timer);
    if(!plan){closeAutomatically();return;}
    const now=Date.now(), remaining=plan.start-now;
    if(remaining<=0){closeAutomatically();return;}
    if(remaining>lead){closeAutomatically();timer=setTimeout(evaluate,Math.min(remaining-lead,2147483647));return;}
    if(isDismissed(plan.key)){closeAutomatically();return;}
    makeDialog();currentKey=plan.key;
    dialog.querySelector('[data-start]').textContent=format(plan.start);
    const message=dialog.querySelector('[data-message]'); message.textContent=plan.message||'';message.hidden=!plan.message;
    const end=dialog.querySelector('[data-end]');end.textContent=plan.end?'終了予定：'+format(plan.end):'';end.hidden=!plan.end;
    if(!dialog.open){dialog.showModal();dialog.focus({preventScroll:true});}
    timer=setTimeout(evaluate,Math.min(remaining,2147483647));
  }
  function update(input) {
    // The caller supplies the verified schedule; no date is guessed from notice text.
    const start = input?.starts_at && Date.parse(input.starts_at);
    const end = input?.ends_at && Date.parse(input.ends_at);
    plan = input?.enabled !== false && Number.isFinite(start) ? {start,end:Number.isFinite(end)&&end>start?end:null,key:String(start),message:typeof input.message==='string'?input.message:''} : null;
    evaluate();
  }
  addEventListener('storage',event=>{if(event.key?.startsWith(prefix))evaluate();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)evaluate();});
  addEventListener('pageshow',evaluate);
  window.CARD_MAINTENANCE_WARNING=Object.freeze({update});
  let request;
  const nativeFetch = window.fetch?.bind(window);
  async function refresh() {
    if(document.hidden || request || !nativeFetch)return;
    const config=window.APP_CONFIG;
    if(!config?.supabaseUrl || !config?.supabaseKey)return;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10000);
    request=(async()=>{
      try {
        const response=await nativeFetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/card_album_maintenance_warning_schedule',{
          method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal
        });
        if(!response.ok)return;
        const data=await response.json();
        if(data && typeof data.enabled==='boolean')update(data);
      }catch{/* A failed notice request must not block the album. */}
      finally{clearTimeout(timeout);request=null;}
    })();
    await request;
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  if(window.APP_CONFIG?.supabaseUrl){refresh();setInterval(refresh,60000);}

})();
