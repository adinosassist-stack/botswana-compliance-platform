/** Pure reusable quotation template preferences. No storage, upload, or tenant authorization. */
const clean=(v,max)=>typeof v==="string"&&v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():null;
export function prepareQuotationTemplate({tenantId,name,issuerName,footer,terms,accentColor="#B91C1C",items=[]}={}){
 const tenant=clean(tenantId,100),label=clean(name,100),issuer=clean(issuerName,150);
 if(!tenant||!label||!issuer||typeof footer!=="string"||footer.length>500||typeof terms!=="string"||terms.length>10000)throw new TypeError("invalid_template");
 if(!/^#[0-9a-fA-F]{6}$/.test(accentColor))throw new TypeError("invalid_accent");
 if(!Array.isArray(items)||items.length>8)throw new TypeError("invalid_items");
 const rows=items.map(item=>{const description=clean(item?.description,100);if(!description)throw new TypeError("invalid_item");return Object.freeze({description});});
 return Object.freeze({tenantId:tenant,name:label,issuerName:issuer,footer,terms,accentColor:accentColor.toUpperCase(),items:Object.freeze(rows),previewOnly:true});
}
