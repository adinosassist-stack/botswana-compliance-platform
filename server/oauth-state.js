import crypto from "crypto";

const MIN_SECRET_BYTES=32;
const MAX_STATE_CHARS=4096;
const SIGNATURE_RE=/^[A-Za-z0-9_-]{43}$/;

export function createOAuthStateCodec(secret){
  const key=String(secret||"");
  if(Buffer.byteLength(key,"utf8")<MIN_SECRET_BYTES)throw new Error("oauth_state_secret_too_short");
  const sign=raw=>crypto.createHmac("sha256",key).update(raw).digest("base64url");
  return Object.freeze({
    encode(payload){
      const raw=Buffer.from(JSON.stringify(payload),"utf8").toString("base64url");
      if(!raw||raw.length>MAX_STATE_CHARS-44)throw new Error("oauth_state_payload_too_large");
      return `${raw}.${sign(raw)}`;
    },
    decode(state){
      try{
        const value=String(state||"");
        if(value.length<45||value.length>MAX_STATE_CHARS)return null;
        const firstDot=value.indexOf(".");
        if(firstDot<=0||firstDot!==value.lastIndexOf("."))return null;
        const raw=value.slice(0,firstDot),sig=value.slice(firstDot+1);
        if(!SIGNATURE_RE.test(sig))return null;
        const expected=sign(raw);
        const actualBytes=Buffer.from(sig,"ascii"),expectedBytes=Buffer.from(expected,"ascii");
        if(actualBytes.length!==expectedBytes.length||!crypto.timingSafeEqual(actualBytes,expectedBytes))return null;
        const parsed=JSON.parse(Buffer.from(raw,"base64url").toString("utf8"));
        return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:null;
      }catch{return null}
    }
  });
}
