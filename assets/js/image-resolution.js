// 元画像のURLと表示サイズを維持し、ブラウザ内のCanvasだけ低解像度にします。
// toBlob/toDataURL/保存/API/追加fetchは使用しません。CORSを変更しません。
(() => {
  'use strict';
  const MAX_EDGE = 560;
  const entries = new WeakMap();
  const pending = new Set();
  let frame = null;
  const inView = new WeakSet();
  const visibility = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(records => {
      for (const record of records) {
        if (record.isIntersecting) {
          inView.add(record.target);
          schedule(record.target);
        } else inView.delete(record.target);
      }
    }, {rootMargin: '240px 0px'}) : null;
  function official(image) {
    try {
      const host = new URL(image.getAttribute('src') || '',location.href).hostname;
      return host === 'aipri.jp' || host === 'dcd.aikatsu.com';
    } catch { return false; }
  }
  function clear(image) {
    const entry=entries.get(image);
    entry?.canvas.remove();
    image.removeAttribute('data-low-resolution');
    entries.delete(image);
  }
  function draw(image) {
    if(!image.isConnected || !official(image) || !image.complete || !image.naturalWidth || !image.naturalHeight) {clear(image);return;}
    if(Math.max(image.naturalWidth,image.naturalHeight)<=MAX_EDGE) {clear(image);return;}
    const parent=image.parentElement;
    if(!parent || image.hidden) {clear(image);return;}
    // 元画像はレイアウトと読み込みイベント、alt、縦横判定のために保持します。
    // opacity:0から戻る途中のアニメーション値をCanvasへコピーしない。
    const savedTransition=image.style.getPropertyValue('transition');
    const savedTransitionPriority=image.style.getPropertyPriority('transition');
    image.style.setProperty('transition','none','important');
    image.removeAttribute('data-low-resolution');
    const style=getComputedStyle(image);
    const properties={width:style.width,height:style.height,boxSizing:style.boxSizing,border:style.border,borderRadius:style.borderRadius,boxShadow:style.boxShadow,background:style.background,padding:style.padding,transform:style.transform,transformOrigin:style.transformOrigin,filter:style.filter,opacity:style.opacity,objectFit:style.objectFit,objectPosition:style.objectPosition,zIndex:style.zIndex};
    if(savedTransition) image.style.setProperty('transition',savedTransition,savedTransitionPriority);
    else image.style.removeProperty('transition');
    if(!image.getClientRects().length || image.clientWidth===0 || image.clientHeight===0 || style.display==='none') {clear(image);return;}
    if(getComputedStyle(parent).position==='static') parent.style.position='relative';
    let entry=entries.get(image);
    if(!entry || entry.parent!==parent || !entry.canvas.isConnected) {
      clear(image);
      const canvas=document.createElement('canvas');
      canvas.className='low-resolution-image';
      canvas.setAttribute('aria-hidden','true');
      canvas.style.pointerEvents='none';
      image.after(canvas);
      entry={canvas,parent,src:'',width:0,height:0};entries.set(image,entry);
    }
    const normalizedFrame = parent.matches('.family-card-image,.coordinate-card-image,.card-image-frame,.marquee-image-frame,.album-card-frame,.verse-full-image,.verse-family-image,.verse-nav-image,.verse-part-image-frame,.verse-collage-item');
    const rotated = normalizedFrame && image.naturalWidth > image.naturalHeight && (parent.classList.contains('landscape') || parent.classList.contains('is-landscape'));
    const ratio=MAX_EDGE/Math.max(image.naturalWidth,image.naturalHeight);
    const scaledWidth=Math.max(1,Math.round(image.naturalWidth*ratio));
    const scaledHeight=Math.max(1,Math.round(image.naturalHeight*ratio));
    const width=rotated ? scaledHeight : scaledWidth;
    const height=rotated ? scaledWidth : scaledHeight;
    if(entry.src!==image.currentSrc || entry.width!==width || entry.height!==height || entry.rotated!==rotated || !entry.canvas.isConnected) {
      entry.canvas.width=width;entry.canvas.height=height;
      const context=entry.canvas.getContext('2d');
      if(!context) {clear(image);return;}
      try {
        context.imageSmoothingEnabled=true;
        context.imageSmoothingQuality='high';
        // 外部画像をCanvasへ描画するだけです。画像データを読み出しません。
        if (rotated) {
          context.translate(width/2,height/2);
          context.rotate(Math.PI/2);
          context.drawImage(image,-scaledWidth/2,-scaledHeight/2,scaledWidth,scaledHeight);
        } else context.drawImage(image,0,0,width,height);
      } catch {clear(image);return;}
      entry.src=image.currentSrc;entry.width=width;entry.height=height;entry.rotated=rotated;
    }
    Object.assign(entry.canvas.style,properties,{position:'absolute',left:image.offsetLeft+'px',top:image.offsetTop+'px',right:'auto',bottom:'auto',margin:'0',display:'block',maxWidth:'none',maxHeight:'none',pointerEvents:'none'});
    if (normalizedFrame) {
      // 固定枠の画像はoffsetLeftやCSS変換行列を流用せず、枠そのものに合わせます。
      Object.assign(entry.canvas.style,{
        left:'0px',top:'0px',right:'auto',bottom:'auto',width:'100%',height:'100%',
        margin:'0',padding:'0',border:'0',borderRadius:'inherit',boxShadow:'none',
        background:'transparent',transform:'none',transformOrigin:'center',objectFit:'contain',
        objectPosition:'center',zIndex:'1'
      });
    }
    if (!entry.canvas.isConnected) {clear(image);return;}
    image.setAttribute('data-low-resolution','true');
  }
  function schedule(image) {
    if (!(image instanceof HTMLImageElement) || !image.isConnected) return;
    if (image.hidden) { clear(image); return; }
    if (visibility && !inView.has(image)) return;
    pending.add(image);
    queueFrame();
  }
  function queueFrame() {
    if (frame !== null || !pending.size) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const started = performance.now();
      let count = 0;
      // 画像を一括処理してスクロール用のフレームを塞がない。
      for (const image of pending) {
        pending.delete(image);
        if (!image.isConnected || (visibility && !inView.has(image))) continue;
        draw(image);
        if (++count >= 2 || performance.now() - started >= 4) break;
      }
      queueFrame();
    });
  }
  const resize=typeof ResizeObserver==='function' ? new ResizeObserver(records=>{for(const record of records)schedule(record.target);}) : null;
  const watched=new WeakSet();
  function scan(root) {
    const images=root instanceof HTMLImageElement ? [root] : root.querySelectorAll?.('img') || [];
    for(const image of images) {
      if(!watched.has(image)) {
        watched.add(image);
        resize?.observe(image);
        visibility?.observe(image);
      }
      if(official(image))schedule(image);else clear(image);
    }
  }
  document.addEventListener('load',event=>{if(event.target instanceof HTMLImageElement)schedule(event.target);},true);
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)clear(event.target);},true);
  window.addEventListener('resize',()=>scan(document));
  // srcの変更時は古い表裏の描画を消し、次のloadで描画します。
  const observer=new MutationObserver(records=>{
    const roots = new Set();
    for(const record of records) {
      if(record.type==='childList') {
        for(const node of record.removedNodes) {
          if(node.nodeType!==1)continue;
          const images=node instanceof HTMLImageElement ? [node] : node.querySelectorAll?.('img') || [];
          for(const image of images) {resize?.unobserve(image);visibility?.unobserve(image);inView.delete(image);watched.delete(image);pending.delete(image);clear(image);}
        }
        for(const node of record.addedNodes) if(node.nodeType===1 && !node.matches?.('canvas.low-resolution-image')) roots.add(node);
      } else if(record.target instanceof HTMLImageElement && record.attributeName==='src') {
        clear(record.target);schedule(record.target);
      } else roots.add(record.target);
    }
    for (const root of roots) {
      if (!root.isConnected) continue;
      if ([...roots].some(other => other !== root && other.contains(root))) continue;
      scan(root);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src','class','hidden','open']});
  scan(document);
})();
