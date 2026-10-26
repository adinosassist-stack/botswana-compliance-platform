/** Safe response metadata for future generated export downloads. */
const formats=Object.freeze({
 pdf:{mime:"application/pdf",extension:"pdf"},
 docx:{mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",extension:"docx"},
 pptx:{mime:"application/vnd.openxmlformats-officedocument.presentationml.presentation",extension:"pptx"}
});
export function exportDownloadHeaders(format, title="thebe-document") {
 const entry=Object.prototype.hasOwnProperty.call(formats,format)?formats[format]:null;
 if(!entry)return null;
 const basename=typeof title==="string"?title.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80):"";
 const filename=(basename||"thebe-document")+"."+entry.extension;
 return Object.freeze({
  "Content-Type":entry.mime,
  "Content-Disposition":'attachment; filename="'+filename+'"',
  "X-Content-Type-Options":"nosniff",
  "Cache-Control":"private, no-store"
 });
}
