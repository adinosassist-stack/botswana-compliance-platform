/**
 * UNMOUNTED isolated-private-staging authorization-state store candidate.
 * D1 schema is NOT deployed. A trusted OIDC host must provide secure session
 * validation, a real IdP and ownership checks. This is not a login service.
 * PKCE verifier is AES-GCM encrypted with nonextractable private-host key.
 */
const deny=()=>{throw Error("private_oidc_state_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HEX=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const OPAQUE=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const te=new TextEncoder();
const MAX_AGE=300000;
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";
export const ESSENTIALS_PRIVATE_SAVE_OIDC_STATE_SQL=[
 "INSERT INTO essentials_private_oidc_authorization_attempts",
 "(state_sha256,session_key_sha256,tenant_id,actor_user_id,quotation_id,",
 "challenge_id,customer_id,nonce_sha256,verifier_iv,verifier_ciphertext,",
 "issuer,client_id,redirect_uri,token_endpoint,issued_at_ms,expires_at_ms)",
 "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_CONSUME_OIDC_STATE_SQL=[
 "UPDATE essentials_private_oidc_authorization_attempts",
 "SET state='consumed',consumed_at_ms=?",
 "WHERE state_sha256=? AND session_key_sha256=? AND state='pending'",
 "AND issued_at_ms<=? AND expires_at_ms>?",
 "AND issued_at_ms<="+DB_NOW+" AND expires_at_ms>"+DB_NOW,
 "RETURNING state_sha256,session_key_sha256,tenant_id,actor_user_id,",
 "quotation_id,challenge_id,customer_id,nonce_sha256,verifier_iv,",
 "verifier_ciphertext,issuer,client_id,redirect_uri,token_endpoint,",
 "issued_at_ms,expires_at_ms,state"
].join(" ");
const fields=[
 "stateSha256","sessionKeyHash","tenantId","actorUserId","quotationId",
 "challengeId","customerId","nonceSha256","issuer","clientId",
 "redirectUri","tokenEndpoint","issuedAtMs","expiresAtMs"
];
const expectedKeys=Object.freeze({
 stateSha256:"state_sha256",sessionKeyHash:"session_key_sha256",
 tenantId:"tenant_id",actorUserId:"actor_user_id",
 quotationId:"quotation_id",challengeId:"challenge_id",
 customerId:"customer_id",nonceSha256:"nonce_sha256",
 issuer:"issuer",clientId:"client_id",redirectUri:"redirect_uri",
 tokenEndpoint:"token_endpoint",issuedAtMs:"issued_at_ms",
 expiresAtMs:"expires_at_ms"
});
function checkedRecord(a){
 if(!a||typeof a!=="object"||Array.isArray(a)||
    !fields.every(k=>Object.hasOwn(a,k))||
    !HEX(a.stateSha256)||!HEX(a.sessionKeyHash)||!HEX(a.nonceSha256)||
    ![a.tenantId,a.actorUserId,a.quotationId,a.challengeId,a.customerId]
      .every(ID)||!ID(a.clientId)||
    ![a.issuer,a.redirectUri,a.tokenEndpoint].every(x=>
      typeof x==="string"&&x.length>=10&&x.length<=500&&x.startsWith("https://"))||
    !Number.isSafeInteger(a.issuedAtMs)||!Number.isSafeInteger(a.expiresAtMs)||
    a.issuedAtMs<=0||a.expiresAtMs<=a.issuedAtMs||
    a.expiresAtMs-a.issuedAtMs>MAX_AGE)deny();
}
function associated(a){return te.encode(JSON.stringify(fields.map(k=>a[k])))}
function bytes(x){
 if(x instanceof Uint8Array)return new Uint8Array(x);
 if(x instanceof ArrayBuffer)return new Uint8Array(x);
 if(Array.isArray(x)&&x.every(v=>Number.isInteger(v)&&v>=0&&v<=255))
  return Uint8Array.from(x);
 deny();
}
export function createEssentialsPrivateOidcAuthorizationStateStore({
 enabled=false,environment,db,verifierEncryptionKey,
 cryptoSubtle=globalThis.crypto?.subtle,randomBytes
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_oidc_state_disabled");
 if(typeof db?.prepare!=="function"||
    verifierEncryptionKey?.type!=="secret"||
    verifierEncryptionKey?.algorithm?.name!=="AES-GCM"||
    verifierEncryptionKey?.extractable!==false||
    !verifierEncryptionKey.usages?.includes("encrypt")||
    !verifierEncryptionKey.usages?.includes("decrypt")||
    ![128,192,256].includes(verifierEncryptionKey.algorithm.length)||
    typeof cryptoSubtle?.encrypt!=="function"||
    typeof cryptoSubtle?.decrypt!=="function"||
    typeof randomBytes!=="function")
  throw Error("private_oidc_state_unconfigured");
 return Object.freeze({
  async persistAuthorizationAttempt(a){
   checkedRecord(a);
   if(!OPAQUE(a.codeVerifier))deny();
   let iv;
   try{iv=randomBytes(12)}catch{deny()}
   if(!(iv instanceof Uint8Array)||iv.length!==12||
      iv.every(v=>v===0))deny();
   const aad=associated(a);
   let ciphertext;
   try{
    ciphertext=bytes(await cryptoSubtle.encrypt(
     {name:"AES-GCM",iv,additionalData:aad,tagLength:128},
     verifierEncryptionKey,te.encode(a.codeVerifier)));
   }catch{deny()}
   if(ciphertext.length<16||ciphertext.length>512)deny();
   let result;
   try{
    result=await db.prepare(ESSENTIALS_PRIVATE_SAVE_OIDC_STATE_SQL).bind(
      a.stateSha256,a.sessionKeyHash,a.tenantId,a.actorUserId,
      a.quotationId,a.challengeId,a.customerId,a.nonceSha256,
      Array.from(iv),Array.from(ciphertext),a.issuer,a.clientId,
      a.redirectUri,a.tokenEndpoint,a.issuedAtMs,a.expiresAtMs
    ).run();
   }catch{deny()}
   return result?.success===true&&result.meta?.changes===1;
  },
  async consumeAuthorizationAttempt({stateSha256,sessionKeyHash,nowMs}={}){
   if(!HEX(stateSha256)||!HEX(sessionKeyHash)||
      !Number.isSafeInteger(nowMs)||nowMs<=0)deny();
   let row;
   // A single atomic UPDATE ... RETURNING, not SELECT followed by UPDATE.
   try{
    row=await db.prepare(ESSENTIALS_PRIVATE_CONSUME_OIDC_STATE_SQL)
      .bind(nowMs,stateSha256,sessionKeyHash,nowMs,nowMs).first();
   }catch{deny()}
   if(!row)return null;
   const a=Object.fromEntries(fields.map(k=>[k,row[expectedKeys[k]]]));
   checkedRecord(a);
   if(a.stateSha256!==stateSha256||a.sessionKeyHash!==sessionKeyHash||
      row.state!=="consumed"||a.issuedAtMs>nowMs||
      a.expiresAtMs<=nowMs)deny();
   const iv=bytes(row.verifier_iv),ciphertext=bytes(row.verifier_ciphertext);
   if(iv.length!==12||ciphertext.length<16||ciphertext.length>512)deny();
   let plaintext;
   try{
    plaintext=bytes(await cryptoSubtle.decrypt({
      name:"AES-GCM",iv,additionalData:associated(a),tagLength:128
    },verifierEncryptionKey,ciphertext));
   }catch{deny()}
   let verifier;
   try{verifier=new TextDecoder("utf-8",{fatal:true}).decode(plaintext)}
   catch{deny()}finally{plaintext.fill(0)}
   if(!OPAQUE(verifier))deny();
   return Object.freeze({
    state:"consumed",...a,codeVerifier:verifier
   });
  }
 });
}
