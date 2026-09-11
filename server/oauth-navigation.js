export function safeNextPath(next){
  try{
    const raw=String(next||"/").trim();
    if(!raw.startsWith("/")||raw.startsWith("//")||raw.includes("\\"))return "/";
    const base=new URL("https://bw-business-protection.invalid/");
    const resolved=new URL(raw,base);
    if(resolved.origin!==base.origin)return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`||"/";
  }catch{return "/"}
}
