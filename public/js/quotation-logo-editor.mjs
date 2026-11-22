/** Thebe Desk quotation logo editor. Safe UI only; requires authenticated persistence adapter. */
import {
  DEFAULT_QUOTE_LOGO_LAYOUT, validateLogoUploadMetadata, inspectLogoSignature,
  normalizeQuotationLogoLayout, quotationLogoSettings, MAX_LOGO_BYTES, QUOTE_LOGO_MAX_WIDTH_PERCENT, QUOTE_LOGO_MAX_HEIGHT_PERCENT
} from './quotation-logo-layout.mjs';

const PAGE_W=612.24, PAGE_H=858.96;
const css=`
.thebe-quote-logo{font:14px/1.4 system-ui,sans-serif;color:#192b3f;display:grid;gap:12px}
.thebe-quote-logo *{box-sizing:border-box}
.thebe-quote-logo .qle-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.thebe-quote-logo label{display:grid;gap:5px;font-weight:650;font-size:12px}
.thebe-quote-logo input[type=file]{max-width:280px;font-size:12px}
.thebe-quote-logo input[type=range]{width:160px;accent-color:#006bcf}
.thebe-quote-logo button{min-height:40px;padding:8px 12px;background:#fff;border:1px solid #9db2c7;border-radius:9px;color:#173650;cursor:pointer}
.thebe-quote-logo button[data-primary]{color:white;background:#006bcf;border-color:#006bcf}
.thebe-quote-logo button:disabled{opacity:.45;cursor:not-allowed}
.thebe-quote-logo button:focus-visible,.thebe-quote-logo input:focus-visible{outline:3px solid #74b2ff;outline-offset:2px}
.thebe-quote-logo .qle-page{position:relative;aspect-ratio:612.24/858.96;background:#fff;border:1px solid #bcc9d8;width:min(100%,510px);touch-action:pan-y;overflow:hidden}
.thebe-quote-logo .qle-note{color:#526477;font-size:12px}
.thebe-quote-logo .qle-logo{position:absolute;cursor:grab;touch-action:none;outline:2px dashed #006bcf;outline-offset:2px;display:none}
.thebe-quote-logo .qle-logo img{height:100%;width:100%;object-fit:contain;pointer-events:none}
.thebe-quote-logo .qle-logo .qle-handle{position:absolute;right:-8px;bottom:-8px;width:19px;height:19px;background:#006bcf;border:2px solid white;border-radius:4px;cursor:nwse-resize;touch-action:none}
.thebe-quote-logo .qle-status{min-height:18px;font-size:12px}
`;
function el(tag,text,attrs={}){
 const node=document.createElement(tag);
 if(text!==null && text!==undefined) node.textContent=text;
 for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);
 return node;
}
function loadImage(blob){
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(blob);const img=new Image();
  img.onload=()=>resolve({url,width:img.naturalWidth,height:img.naturalHeight});
  img.onerror=()=>{URL.revokeObjectURL(url);reject(Error('invalid_logo_image'))};
  img.src=url;
 });
}
/**
 * mountQuotationLogoEditor(root, {companyId, logoAssetId, initialLayout, onSave, onUpload})
 * onUpload is an authenticated function (File)=>Promise<{logoAssetId:string}>;
 * onSave is an authenticated function ({companyId,logoAssetId,layout})=>Promise<void>;
 * No auto-upload, no browser persistence of company data, no unsafe SVG formats.
 */
export function mountQuotationLogoEditor(root,options={}) {
 if(!root || typeof root.replaceChildren!=='function')throw Error('invalid_logo_editor_root');
 const style=el('style',css);const nonce=document.querySelector('style[nonce],script[nonce]')?.nonce;if(nonce)style.nonce=nonce;
 const area=el('section',null,{class:'thebe-quote-logo','aria-label':'Company quotation logo editor'});
 const controls=el('div',null,{class:'qle-controls'});
 const fileLabel=el('label','Upload company logo (PNG, JPG, WebP)');
 const input=el('input',null,{type:'file',accept:'image/png,image/jpeg,image/webp'});fileLabel.append(input);
 const sizeLabel=el('label','Logo width');const slider=el('input',null,{type:'range',min:'4',max:String(QUOTE_LOGO_MAX_WIDTH_PERCENT),step:'1',value:'34','aria-label':'Logo width'});sizeLabel.append(slider);
 const heightLabel=el('label','Logo height');const heightSlider=el('input',null,{type:'range',min:'1',max:String(QUOTE_LOGO_MAX_HEIGHT_PERCENT),step:'1',value:'12','aria-label':'Logo height'});heightLabel.append(heightSlider);
 const dimensions=el('output','',{class:'qle-note','aria-live':'polite','aria-label':'Current logo dimensions'});
 const reset=el('button','Reset position',{type:'button'});
 const save=el('button','Save company logo',{type:'button','data-primary':''});save.disabled=true;
 const previewPdf=el('button','Download PDF preview',{type:'button'});previewPdf.disabled=true;
 controls.append(fileLabel,sizeLabel,heightLabel,dimensions,reset,save,previewPdf);
 const preview=el('div',null,{class:'qle-page','aria-label':'Quotation page one logo preview'});
 const logo=el('div',null,{class:'qle-logo',tabindex:'0','aria-label':'Move logo with arrow keys; use width slider to resize'});
 const image=el('img',null,{alt:'Company logo preview'});
 const handle=el('span',null,{class:'qle-handle','aria-label':'Resize logo'});logo.append(image,handle);preview.append(logo);
 const note=el('div','Preview only until the authenticated Save company logo operation succeeds. Page 1 · Drag the logo to move it. Arrow keys move by 1%. Both width and height are capped; the original proportions are preserved.',{class:'qle-note'});
 const status=el('div','Choose a logo to start.',{class:'qle-status',role:'status','aria-live':'polite'});
 area.append(controls,preview,note,status);root.replaceChildren(style,area);
 let disposed=false,objectUrl=null,file=null,assetId=options.logoAssetId||null,ratio=options.initialAspectRatio||2;
 let layout=normalizeQuotationLogoLayout(options.initialLayout||DEFAULT_QUOTE_LOGO_LAYOUT,PAGE_W,PAGE_H,ratio);
 let dragging=null,dirty=false,editRevision=0;
 let saving=false,previewing=false;
 const setStatus=(message)=>{if(!disposed)status.textContent=message};
 function paint(){
  const p=normalizeQuotationLogoLayout(layout,PAGE_W,PAGE_H,ratio);layout=p;
  logo.style.left=p.xPercent+'%';logo.style.top=p.yPercent+'%';
  logo.style.width=p.widthPercent+'%';logo.style.height=p.heightPercent+'%';
  slider.value=String(Math.round(p.widthPercent));
  heightSlider.value=String(Math.round(p.heightPercent));
  dimensions.textContent=`Width ${p.widthPercent.toFixed(1)}% / 60% · Height ${p.heightPercent.toFixed(1)}% / 30% · proportions locked`;
  save.disabled=saving||!(dirty&&typeof options.onSave==='function'&&(assetId||(!file?false:typeof options.onUpload==='function')));
  previewPdf.disabled=dirty||saving||previewing||!assetId||typeof options.onPreviewPdf!=='function';
 }
 function markChanged(){editRevision++;dirty=true;paint();setStatus('Preview only — changes are not saved.');}
 async function changeFile(){
  const selected=input.files?.[0];if(!selected)return;
  try {
   if(selected.size>MAX_LOGO_BYTES)throw Error('Logo must be 2 MB or smaller.');
   const bytes=new Uint8Array(await selected.arrayBuffer());inspectLogoSignature(bytes,selected.type);
   const next=await loadImage(selected);
   try { validateLogoUploadMetadata({type:selected.type,size:selected.size,width:next.width,height:next.height}) }
   catch(e){URL.revokeObjectURL(next.url);throw e}
   if(disposed){URL.revokeObjectURL(next.url);return}
   if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=next.url;
   file=selected;assetId=null;ratio=next.width/next.height;image.src=objectUrl;
   logo.style.display='block';layout=normalizeQuotationLogoLayout(DEFAULT_QUOTE_LOGO_LAYOUT,PAGE_W,PAGE_H,ratio);
   markChanged();
  }catch(e){setStatus('Logo rejected: '+e.message);input.value=''}
 }
 if(options.initialLogoBlob){
  // An authenticated read supplies this binary; never accept an arbitrary image URL.
  loadImage(options.initialLogoBlob).then(next=>{
   if(disposed){URL.revokeObjectURL(next.url);return}
   const aspect=next.width/next.height;
   if(options.initialAspectRatio&&Math.abs(aspect-options.initialAspectRatio)>0.0001){
    URL.revokeObjectURL(next.url);setStatus('Saved logo dimensions do not match.');return;
   }
   if(objectUrl)URL.revokeObjectURL(objectUrl);
   objectUrl=next.url;ratio=aspect;image.src=objectUrl;
   layout=normalizeQuotationLogoLayout(options.initialLayout||DEFAULT_QUOTE_LOGO_LAYOUT,PAGE_W,PAGE_H,ratio);
   logo.style.display='block';paint();setStatus('Saved company logo loaded.');
  }).catch(()=>setStatus('Saved logo could not be displayed.'));
 }
 input.addEventListener('change',changeFile);
 slider.addEventListener('input',()=>{layout={...layout,widthPercent:Number(slider.value)};markChanged()});
 heightSlider.addEventListener('input',()=>{
  // Convert desired physical height to proportional width to avoid image distortion.
  const width=Number(heightSlider.value)*PAGE_H*ratio/PAGE_W;
  layout={...layout,widthPercent:width};markChanged();
 });
 reset.addEventListener('click',()=>{layout=normalizeQuotationLogoLayout(DEFAULT_QUOTE_LOGO_LAYOUT,PAGE_W,PAGE_H,ratio);markChanged()});
 logo.addEventListener('keydown',e=>{
  const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;
  e.preventDefault();layout={...layout,xPercent:layout.xPercent+delta[0],yPercent:layout.yPercent+delta[1]};markChanged();
 });
 logo.addEventListener('pointerdown',e=>{
  if(!objectUrl)return;
  e.preventDefault();const rect=preview.getBoundingClientRect();
  dragging={id:e.pointerId,x:e.clientX,y:e.clientY,rect,start:{...layout},resize:e.target===handle};
  logo.setPointerCapture?.(e.pointerId);
 });
 logo.addEventListener('pointermove',e=>{
  if(!dragging||dragging.id!==e.pointerId)return;
  const dx=(e.clientX-dragging.x)/dragging.rect.width*100;
  const dy=(e.clientY-dragging.y)/dragging.rect.height*100;
  layout=dragging.resize?{...dragging.start,widthPercent:dragging.start.widthPercent+dx}:
   {...dragging.start,xPercent:dragging.start.xPercent+dx,yPercent:dragging.start.yPercent+dy};
  markChanged();
 });
 const stop=()=>{dragging=null};logo.addEventListener('pointerup',stop);logo.addEventListener('pointercancel',stop);
 previewPdf.addEventListener('click',async()=>{
  if(dirty||saving||previewing||!assetId||typeof options.onPreviewPdf!=='function')return;
  previewing=true;paint();setStatus('Preparing two-page PDF preview…');
  let url=null;
  try{
   const blob=await options.onPreviewPdf();
   if(!(blob instanceof Blob)||blob.type!=='application/pdf')throw Error('invalid_quotation_pdf_preview');
   if(disposed)return;
   url=URL.createObjectURL(blob);
   const link=document.createElement('a');
   link.href=url;link.download='quotation-logo-preview.pdf';
   link.hidden=true;area.append(link);
   try{link.click()}finally{link.remove()}
   setStatus('PDF download requested. Check your browser downloads; saving the PDF does not save logo settings.');
  }catch(e){setStatus('PDF preview unavailable: '+(e?.message||'unknown error'))}
  finally{
   if(url)URL.revokeObjectURL(url);
   previewing=false;paint();
  }
 });
 save.addEventListener('click',async()=>{
  if(!dirty||saving||typeof options.onSave!=='function')return;
  // Snapshot the exact state the user confirmed. Async upload/save may resolve
  // after a subsequent resize, drag or replacement selection.
  const revision=editRevision,selectedFile=file,savedLayout={...layout},savedRatio=ratio;
  saving=true;paint();setStatus('Saving logo settings…');
  try {
   let persistedId=assetId;
   if(selectedFile){
    if(typeof options.onUpload!=='function')throw Error('Authenticated logo upload is not connected.');
    const result=await options.onUpload(selectedFile);
    if(!result?.logoAssetId)throw Error('Logo upload did not return an asset ID.');
    persistedId=result.logoAssetId;
   }
   const settings=quotationLogoSettings({companyId:options.companyId,logoAssetId:persistedId,layout:savedLayout,aspectRatio:savedRatio,pageWidthPt:PAGE_W,pageHeightPt:PAGE_H});
   await options.onSave(settings);if(disposed)return;
   // A newer change must never be declared saved, nor may an older uploaded
   // asset replace the current selection. The user can save the latest state.
   if(editRevision===revision){
    assetId=persistedId;file=null;dirty=false;setStatus('Authenticated logo settings save completed. Reload to verify persistence.');
   }else{
    dirty=true;setStatus('Newer logo changes are not saved. Save again.');
   }
  }catch(e){setStatus('Not saved: '+(e?.message||'unknown error'))}
  finally{saving=false;paint()}
 });
 paint();
 return {getLayout:()=>({...layout}),destroy(){disposed=true;if(objectUrl)URL.revokeObjectURL(objectUrl);root.replaceChildren()}};
}
