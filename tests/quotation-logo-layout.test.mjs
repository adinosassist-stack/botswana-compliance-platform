import test from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_QUOTE_LOGO_LAYOUT,validateLogoUploadMetadata,inspectLogoSignature,normalizeQuotationLogoLayout,quotationLogoPageRect,quotationLogoSettings} from "../public/js/quotation-logo-layout.mjs";
test("defaults to top left with scaled, aspect-locked size",()=>{
 const x=normalizeQuotationLogoLayout(undefined,612.24,858.96,2);
 assert.equal(x.xPercent,4);assert.equal(x.yPercent,2);assert.equal(x.widthPercent,34);
 assert.ok(x.heightPercent>0 && x.heightPercent<25);
});
test("drag or resize cannot extend logo outside quotation page",()=>{
 const x=normalizeQuotationLogoLayout({xPercent:98,yPercent:90,widthPercent:80},612,859,1.8);
 assert.equal(x.xPercent,40);assert.ok(x.yPercent+x.heightPercent<=100.00001);
 const r=quotationLogoPageRect(x,612,859,1.8);assert.ok(r.x+r.width<=612.00001);
});
test("metadata rejects unsafe types sizes and geometry",()=>{
 assert.throws(()=>validateLogoUploadMetadata({type:"image/svg+xml",size:1024,width:200,height:90}),/unsupported_logo_file/);
 assert.throws(()=>validateLogoUploadMetadata({type:"image/png",size:3e6,width:200,height:90}),/unsupported_logo_file/);
 assert.throws(()=>validateLogoUploadMetadata({type:"image/png",size:1000,width:99999,height:90}),/unsupported_logo_dimensions/);
 assert.equal(validateLogoUploadMetadata({type:"image/png",size:1000,width:200,height:100}).aspectRatio,2);
});
test("signature sniffing refuses deceptive MIME and allows PNG/JPEG/WebP headers",()=>{
 assert.equal(inspectLogoSignature(Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]),"image/png"),true);
 assert.equal(inspectLogoSignature(Uint8Array.from([255,216,255,224,0,0,0,0,0,0,0,0]),"image/jpeg"),true);
 assert.throws(()=>inspectLogoSignature(new Uint8Array(16),"image/png"),/invalid_logo_signature/);
});
test("tenant and immutable asset ID required, no image bytes in saved settings",()=>{
 const s=quotationLogoSettings({companyId:"lovely_1",logoAssetId:"approved_logo_2",aspectRatio:2,layout:DEFAULT_QUOTE_LOGO_LAYOUT});
 assert.equal(s.companyId,"lovely_1");assert.equal(s.logoAssetId,"approved_logo_2");
 assert.deepEqual(Object.keys(s),["companyId","logoAssetId","layout"]);
 assert.throws(()=>quotationLogoSettings({companyId:"../other",logoAssetId:"logo1",aspectRatio:2}),/invalid_logo_asset_reference/);
});

test("both width and height are independently capped while proportions stay unchanged",()=>{
 const tall=normalizeQuotationLogoLayout({xPercent:80,yPercent:90,widthPercent:60},612.24,858.96,0.2);
 assert.ok(tall.widthPercent<=60);
 assert.ok(tall.heightPercent<=30.000001);
 assert.ok(tall.yPercent+tall.heightPercent<=100.000001);
 const wide=normalizeQuotationLogoLayout({widthPercent:100},612.24,858.96,8);
 assert.equal(wide.widthPercent,60);
 assert.ok(wide.heightPercent<=30);
 const rect=quotationLogoPageRect(tall,612.24,858.96,0.2);
 assert.ok(Math.abs(rect.width/rect.height-0.2)<0.00001);
});
