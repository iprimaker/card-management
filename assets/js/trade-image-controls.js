(() => {
  'use strict';
  const defaults = Object.freeze({showNames:true,showRarity:true,serial:false,showQuantity:false,subtractOne:false,excludeZero:false,hidePartTags:false,byEdition:false,byCharacter:false,byRarity:false});
  const groups = [ ['表示する情報', [['showNames','カード・コーデ名を表示する'],['showRarity','レアリティを表示する'],['serial','シリアルを表示する'],['showQuantity','所持数を表示する'],['subtractOne','所持数を-1して表示'],['excludeZero','所持数0のものを除外する'],['hidePartTags','パーツのタグを非表示にする']]], ['区切り', [['byEdition','弾・章ごとに区切る'],['byCharacter','キャラごとに区切る'],['byRarity','レアリティごとに区切る']]] ];
  const settingsMarkup = () => '<details class="ownership-image-settings filter-panel trade-image-settings" id="trade-image-settings"><summary>詳細設定</summary><div class="ownership-image-settings-options">'+groups.map(([label,options])=>'<fieldset class="ownership-image-settings-group"><legend>'+label+'</legend>'+options.map(([key,title])=>'<label'+(key==='hidePartTags'?' data-trade-part-setting':'')+'><span>'+title+'</span><input type="checkbox" role="switch" data-trade-option="'+key+'"'+(defaults[key]?' checked':'')+'></label>').join('')+'</fieldset>').join('')+'</div></details>';
  function syncSettings(root) {
    const shown=root.querySelector('[data-trade-option="showQuantity"]');
    const subtract=root.querySelector('[data-trade-option="subtractOne"]');
    if(!subtract||!shown)return;
    subtract.disabled=!shown.checked;
    if(subtract.disabled)subtract.checked=false;
    subtract.closest('label').classList.toggle('is-disabled',subtract.disabled);
  }
  function readSettings(root) {syncSettings(root);return Object.fromEntries([...root.querySelectorAll('[data-trade-option]')].map(input=>[input.dataset.tradeOption,input.checked]));}
  function applySettings(root,settings={}) {for(const input of root.querySelectorAll('[data-trade-option]')) input.checked = typeof settings[input.dataset.tradeOption] === 'boolean' ? settings[input.dataset.tradeOption] : defaults[input.dataset.tradeOption];syncSettings(root);}
  function progressMarkup(){return '<div id="trade-generation-progress" class="ownership-image-generation-progress" hidden><div class="ownership-image-progress-heading"><span>画像作成中…</span><span data-trade-progress-pages data-generation-count></span></div><progress aria-label="交換希望画像作成の進捗" max="100" value="0"></progress></div>';}
  function progress(root,ratio,index,total){const region=root.querySelector('#trade-generation-progress');region.hidden=false;region.querySelector('progress').value=Math.max(0,Math.min(1,ratio))*100;region.querySelector('[data-trade-progress-pages]').textContent=total>1?index+' / '+total:'';}
  function stage(root){
    const sheets=root.querySelector('#trade-sheets');
    if(sheets.parentElement.classList.contains('trade-preview-stage'))return;
    const details=document.createElement('div');details.className='ownership-image-details';details.dataset.tradeImageDetails='';
    const wrapper=document.createElement('div');wrapper.className='trade-preview-stage';sheets.before(wrapper);
    for(const id of ['trade-output-count','trade-overflow','trade-generation-progress','trade-export-status']){const node=root.querySelector('#'+id);if(node){if(id==='trade-overflow'){node.className='ownership-image-multipage';node.dataset.multipage='';}if(id==='trade-export-status')node.dataset.status='';details.append(node);}}
    wrapper.append(details,sheets);
  }
  async function makePreview(blob, current=()=>true) {
    let bitmap, source, canvas;
    try {
      if(typeof createImageBitmap==='function') bitmap=await createImageBitmap(blob);
      else {
        source=URL.createObjectURL(blob);
        bitmap=await new Promise((resolve,reject)=>{
          const img=new Image();const timeout=setTimeout(()=>{img.onload=img.onerror=null;reject(Error('preview timeout'));},10000);
          img.onload=()=>{clearTimeout(timeout);resolve(img);};img.onerror=()=>{clearTimeout(timeout);reject(Error('preview load'));};
          img.loading='eager';img.decoding='async';img.src=source;
        });
      }
      if(!current())return null;
      const w=bitmap.width||bitmap.naturalWidth,h=bitmap.height||bitmap.naturalHeight;
      const scale=Math.min(1,720/w,1600/h);
      canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      return current()?URL.createObjectURL(preview||blob):null;
    } catch { return current()?URL.createObjectURL(blob):null; }
    finally {bitmap?.close?.();if(source)URL.revokeObjectURL(source);if(canvas)canvas.width=canvas.height=1;}
  }
  const previewLoads=new WeakMap();
  function paintImage(image,url,state=()=>{}) {
    if(!url){previewLoads.delete(image);image.onload=image.onerror=null;image.hidden=true;image.removeAttribute('src');return;}
    if(image.getAttribute('src')===url && image.complete && image.naturalWidth>0){image.hidden=false;state('ready');return;}
    const ticket={url};previewLoads.set(image,ticket);
    const active=()=>previewLoads.get(image)===ticket && image.getAttribute('src')===url && image.isConnected;
    const ready=()=>{if(active()&&image.naturalWidth>0){image.hidden=false;state('ready');}};
    image.onload=ready;image.onerror=()=>{if(active()){image.hidden=true;state('error');}};
    image.loading='eager';image.decoding='async';image.hidden=true;state('loading');image.src=url;
    if(image.decode)image.decode().then(ready).catch(()=>{if(image.complete) {if(image.naturalWidth>0)ready();else if(active())state('error');}});
    if(image.complete)ready();
  }
  function modal(content, label, onClose=()=>{}) {
    const dialog=document.createElement('dialog');dialog.className='album-tool-dialog';dialog.tabIndex=-1;dialog.setAttribute('aria-label',label);content.before(dialog);dialog.append(content);
    let previous;
    const close=()=>{if(dialog.open)dialog.close();};
    dialog.addEventListener('close',()=>{content.hidden=true;onClose();if(previous?.isConnected && !document.querySelector('dialog[open]'))previous.focus({preventScroll:true});});
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();});
    return {dialog,close,open(){if(dialog.open)return;previous=document.activeElement;content.hidden=false;dialog.showModal();dialog.scrollTop=0;dialog.focus({preventScroll:true});}};
  }
  function xURL(text){const url=new URL('https://x.com/intent/tweet');url.searchParams.set('text',text);return url.href;}
  window.CARD_TRADE_TOOLS=Object.freeze({defaults,settingsMarkup,readSettings,applySettings,syncSettings,progressMarkup,progress,stage,makePreview,paintImage,modal,xURL});
})();
