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
  function progressMarkup(){return '<div id="trade-generation-progress" class="ownership-image-generation-progress trade-generation" hidden><div class="trade-generation-heading"><span class="trade-generation-spark" aria-hidden="true">✦</span><strong>画像作成中…</strong><span data-trade-progress-pages></span></div><progress aria-label="交換希望画像作成の進捗" max="100" value="0"></progress><div class="trade-generation-foot"><span>プレビューを作成しています</span><span data-trade-progress-percent>0%</span></div></div>';}
  function progress(root,ratio,index,total){const region=root.querySelector('#trade-generation-progress');region.hidden=false;const value=Math.max(0,Math.min(1,ratio));region.querySelector('progress').value=value*100;region.querySelector('[data-trade-progress-percent]').textContent=Math.floor(value*100)+'%';region.querySelector('[data-trade-progress-pages]').textContent=total>1?index+' / '+total:'';}
  function stage(root){
    const sheets=root.querySelector('#trade-sheets'), region=root.querySelector('#trade-generation-progress');
    if(sheets.parentElement.classList.contains('trade-preview-stage'))return;
    const wrapper=document.createElement('div');wrapper.className='trade-preview-stage';sheets.before(wrapper);wrapper.append(region,sheets);
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
  window.CARD_TRADE_TOOLS=Object.freeze({defaults,settingsMarkup,readSettings,applySettings,syncSettings,progressMarkup,progress,stage,modal,xURL});
})();
