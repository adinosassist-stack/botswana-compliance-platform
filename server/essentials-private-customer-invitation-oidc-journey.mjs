/**
 * SOURCE-ONLY, UNMOUNTED external-customer invitation + OIDC Authorization
 * Code/PKCE journey. Not the employee OIDC flow. No routes, IdP registration,
 * real customer login, production D1/Workers or customer data.
 *
 * This uses a trusted independently authorized invitation issuer and a
 * separately configured, confidential token-exchange callback. A code
 * exchange result is UNVERIFIED; only the independent RS256 + fresh nonce +
 * customer account ownership validator in #2709 may issue a session.
 */
const deny=()=>{throw Error("private_customer_invite_oidc_unverified")};
const ID=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
const HASH=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const TOKEN=x=>typeof x==="string"&&/^[A-Za-z0-9_-]{43}$/.test(x);
const CODE=x=>typeof x==="string"&&x.length>=8&&x.length<=2048&&/^[A-Za-z0-9._~-]+$/.test(x);
const te=new TextEncoder(),td=new TextDecoder("utf-8",{fatal:true});
const COOKIE="__Host-thebe-customer-oauth",MAX_MS=300000;
const DB_NOW="(CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))";

export const ESSENTIALS_PRIVATE_ISSUE_CUSTOMER_INVITE_SQL=[
 "INSERT INTO essentials_private_customer_consent_invitations",
 "(invitation_id,tenant_id,customer_id,quotation_id,",
 "nonce_sha256,issued_at_ms,expires_at_ms)",
 "VALUES(?,?,?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_SAVE_CUSTOMER_INVITE_LAUNCH_SQL=[
 "INSERT INTO essentials_private_customer_invitation_launches",
 "(invitation_id,customer_identity_link_id,ticket_sha256,nonce_iv,",
 "nonce_ciphertext,issued_at_ms,expires_at_ms)",
 "VALUES(?,?,?,?,?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_INVITE_ISSUE_SQL=[
 "INSERT INTO essentials_private_customer_invite_issue_audit",
 "(invitation_id,issued_at_ms) VALUES(?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_READ_CUSTOMER_INVITE_LAUNCH_SQL=[
 "SELECT x.invitation_id,x.customer_identity_link_id,x.ticket_sha256,",
 "x.nonce_iv,x.nonce_ciphertext,x.issued_at_ms,x.expires_at_ms,x.state,",
 "i.tenant_id,i.customer_id,i.quotation_id,i.nonce_sha256,i.state AS invite_state",
 "FROM essentials_private_customer_invitation_launches AS x",
 "JOIN essentials_private_customer_consent_invitations AS i",
 " ON i.invitation_id=x.invitation_id",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=x.customer_identity_link_id",
 "JOIN essentials_private_frozen_quotes AS q",
 " ON q.tenant_id=i.tenant_id AND q.quotation_id=i.quotation_id",
 "JOIN essentials_private_frozen_quote_terms AS t",
 " ON t.tenant_id=q.tenant_id AND t.quotation_id=q.quotation_id",
 "JOIN essentials_private_frozen_quote_terms_audit AS f",
 " ON f.tenant_id=q.tenant_id AND f.quotation_id=q.quotation_id",
 "WHERE x.invitation_id=? AND x.state=? AND i.state='pending'",
 "AND x.expires_at_ms>="+DB_NOW,
 "AND i.expires_at_ms=x.expires_at_ms",
 "AND l.state='active' AND l.expires_at_ms>"+DB_NOW,
 "AND l.tenant_id=i.tenant_id AND l.customer_id=i.customer_id",
 "AND q.state='accepted' AND q.customer_id=i.customer_id",
 "AND t.customer_id=q.customer_id AND t.quotation_sha256=q.quotation_sha256",
 "AND t.terms_sha256=f.terms_sha256",
 "AND f.quotation_sha256=q.quotation_sha256 AND f.frozen_at=q.frozen_at",
 "AND t.frozen_at=q.frozen_at LIMIT 1"
].join(" ");
export const ESSENTIALS_PRIVATE_START_CUSTOMER_INVITE_SQL=[
 "UPDATE essentials_private_customer_invitation_launches",
 "SET state='started',started_at_ms=?",
 "WHERE invitation_id=? AND ticket_sha256=?",
 "AND state='issued' AND expires_at_ms>=? AND expires_at_ms>"+DB_NOW,
 "AND EXISTS(SELECT 1 FROM essentials_private_customer_consent_invitations AS i",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=essentials_private_customer_invitation_launches.customer_identity_link_id",
 "WHERE i.invitation_id=essentials_private_customer_invitation_launches.invitation_id",
 "AND i.state='pending' AND l.state='active'",
 "AND l.tenant_id=i.tenant_id AND l.customer_id=i.customer_id",
 "AND l.expires_at_ms>"+DB_NOW+")"
].join(" ");
export const ESSENTIALS_PRIVATE_SAVE_CUSTOMER_OIDC_ATTEMPT_SQL=[
 "INSERT INTO essentials_private_customer_oidc_logins",
 "(attempt_id,invitation_id,state_sha256,oauth_cookie_sha256,",
 "verifier_iv,verifier_ciphertext,issued_at_ms,expires_at_ms)",
 "SELECT ?,x.invitation_id,?,?,?,?,?,?",
 "FROM essentials_private_customer_invitation_launches AS x",
 "WHERE x.invitation_id=? AND x.state='started'",
 "AND x.started_at_ms=? AND x.expires_at_ms>=?"
].join(" ");
export const ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_OIDC_START_SQL=[
 "INSERT INTO essentials_private_customer_oidc_start_audit",
 "(invitation_id,attempt_id,started_at_ms) VALUES(?,?,?)"
].join(" ");
export const ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_OIDC_ATTEMPT_SQL=[
 "UPDATE essentials_private_customer_oidc_logins",
 "SET state='consumed',consumed_at_ms=?",
 "WHERE state_sha256=? AND oauth_cookie_sha256=?",
 "AND state='pending' AND issued_at_ms<=? AND expires_at_ms>?",
 "AND issued_at_ms<="+DB_NOW+" AND expires_at_ms>"+DB_NOW,
 "AND EXISTS (SELECT 1 FROM essentials_private_customer_invitation_launches AS x",
 "JOIN essentials_private_customer_consent_invitations AS i",
 " ON i.invitation_id=x.invitation_id",
 "JOIN essentials_private_customer_identity_links AS l",
 " ON l.link_id=x.customer_identity_link_id",
 "WHERE x.invitation_id=essentials_private_customer_oidc_logins.invitation_id",
 "AND x.state='started' AND i.state='pending' AND l.state='active'",
 "AND l.tenant_id=i.tenant_id AND l.customer_id=i.customer_id",
 "AND l.expires_at_ms>"+DB_NOW+" AND x.expires_at_ms>"+DB_NOW+")",
 "RETURNING attempt_id,invitation_id,state_sha256,oauth_cookie_sha256,",
 "verifier_iv,verifier_ciphertext,issued_at_ms,expires_at_ms,state"
].join(" ");

function base64url(b){
 let text="";for(const n of b)text+=String.fromCharCode(n);
 return btoa(text).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function getBytes(n,randomBytes){
 let b;try{b=randomBytes(n)}catch{deny()}
 if(!(b instanceof Uint8Array)||b.length!==n||b.every(x=>x===0))deny();
 return new Uint8Array(b);
}
async function sha(subtle,value){
 let b;try{b=new Uint8Array(await subtle.digest("SHA-256",
  typeof value==="string"?te.encode(value):value))}catch{deny()}
 if(b.length!==32)deny();
 return [...b].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function validNow(now){
 let at;try{at=now()}catch{deny()}
 if(!Number.isSafeInteger(at)||at<=0)deny();
 return at;
}
function validUrl(x){
 if(typeof x!=="string"||x.length>500)deny();
 let u;try{u=new URL(x)}catch{deny()}
 if(u.protocol!=="https:"||u.username||u.password||u.hash||u.search||
    u.href!==x)deny();
 return u;
}
function safeString(x){
 if(typeof x!=="string")deny();
 return x;
}
function launchAAD(i){
 return te.encode(JSON.stringify(["thebe-private-customer-invite-v1",
  i.invitationId,i.tenantId,i.customerId,i.quotationId,
  i.customerIdentityLinkId,i.issuedAtMs,i.expiresAtMs]));
}
function attemptAAD(i){
 return te.encode(JSON.stringify(["thebe-private-customer-oidc-v1",
  i.attemptId,i.invitationId,i.stateSha256,
  i.oauthCookieSha256,i.issuedAtMs,i.expiresAtMs]));
}
async function encrypt(subtle,key,plaintext,aad,randomBytes){
 const iv=getBytes(12,randomBytes);let ct;
 try{ct=new Uint8Array(await subtle.encrypt({
  name:"AES-GCM",iv,additionalData:aad,tagLength:128
 },key,te.encode(plaintext)))}catch{deny()}
 if(ct.length<17||ct.length>256)deny();
 return {iv:Array.from(iv),cipher:Array.from(ct)};
}
async function decrypt(subtle,key,iv,cipher,aad){
 if(!Array.isArray(iv)||iv.length!==12||
    !Array.isArray(cipher)||cipher.length<17||cipher.length>256)deny();
 let raw;try{raw=new Uint8Array(await subtle.decrypt({
  name:"AES-GCM",iv:Uint8Array.from(iv),
  additionalData:aad,tagLength:128
 },key,Uint8Array.from(cipher)))}catch{deny()}
 let text;try{text=td.decode(raw)}catch{deny()}finally{raw.fill(0)}
 return text;
}
async function boundedTicket(request){
 if(request?.method!=="POST"||typeof request?.headers?.get!=="function")deny();
 const ct=request.headers.get("content-type")||"";
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(ct))deny();
 const cl=request.headers.get("content-length");
 if(cl!==null&&(!/^\d{1,5}$/.test(cl)||Number(cl)>200))deny();
 const reader=request.body?.getReader?.();if(!reader)deny();
 let chunks=[],len=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   if(!(value instanceof Uint8Array))deny();
   len+=value.length;if(len>200)deny();
   chunks.push(value);
  }
 }catch{try{await reader.cancel()}catch{}deny()}
 finally{try{reader.releaseLock()}catch{}}
 const result=new Uint8Array(len);let p=0;
 for(const chunk of chunks){result.set(chunk,p);p+=chunk.length}
 let obj;try{obj=JSON.parse(td.decode(result))}catch{deny()}
 finally{result.fill(0)}
 if(!obj||typeof obj!=="object"||Array.isArray(obj)||
   Object.keys(obj).length!==1||!TOKEN(obj.ticket))deny();
 return obj.ticket;
}
function getOauthCookie(s){
 if(typeof s!=="string"||s.length>4096)deny();
 const values=s.split(";").flatMap(x=>{
  let i=x.indexOf("=");return i>=0&&x.slice(0,i).trim()===COOKIE?
   [x.slice(i+1).trim()]:[];
 });
 if(values.length!==1||!TOKEN(values[0]))deny();
 return values[0];
}
function checkLaunchRow(row,id,state,at){
 if(!row||row.invitation_id!==id||row.state!==state||
   row.invite_state!=="pending"||
   ![row.tenant_id,row.customer_id,row.quotation_id,
     row.customer_identity_link_id].every(ID)||
   !HASH(row.ticket_sha256)||!HASH(row.nonce_sha256)||
   !Number.isSafeInteger(row.issued_at_ms)||
   !Number.isSafeInteger(row.expires_at_ms)||
   row.issued_at_ms>at||row.expires_at_ms<=at||
   row.expires_at_ms-row.issued_at_ms>MAX_MS)deny();
 return {
  invitationId:id,tenantId:row.tenant_id,customerId:row.customer_id,
  quotationId:row.quotation_id,
  customerIdentityLinkId:row.customer_identity_link_id,
  issuedAtMs:row.issued_at_ms,expiresAtMs:row.expires_at_ms
 };
}
export function createEssentialsPrivateCustomerInviteOidcJourney({
 enabled=false,environment,db,issuer,clientId,authorizationEndpoint,
 tokenEndpoint,redirectUri,expectedOrigin,nonceEncryptionKey,
 verifierEncryptionKey,cryptoSubtle=globalThis.crypto?.subtle,
 randomBytes,now=()=>Date.now(),authorizeCustomerInvitation,
 loadFrozenCustomerQuote,verifyCurrentCustomerOwnership,
 exchangeAuthorizationCode,issueVerifiedCustomerSession,
 authorizeTrustedInvitationNonceRead
}={}){
 if(enabled!==true||environment!=="essentials-private-staging")
  throw Error("private_customer_invite_oidc_disabled");
 let auth,redir,token,iss,origin;
 try{
  auth=validUrl(authorizationEndpoint);
  redir=validUrl(redirectUri);
  token=validUrl(tokenEndpoint);
  iss=validUrl(issuer);
  origin=validUrl(expectedOrigin);
 }catch{throw Error("private_customer_invite_oidc_unconfigured")}
 if(iss.origin!==auth.origin||iss.origin!==token.origin||
   redir.origin!==origin.origin||
   expectedOrigin!==origin.origin||
   !/^[A-Za-z0-9._~:-]{1,128}$/.test(clientId||"")||
   ![nonceEncryptionKey,verifierEncryptionKey].every(k=>
     k?.type==="secret"&&k?.extractable===false&&
     k?.algorithm?.name==="AES-GCM"&&k?.algorithm?.length===256&&
     k.usages?.includes("encrypt")&&k.usages?.includes("decrypt"))||
   typeof db?.prepare!=="function"||typeof db?.batch!=="function"||
   typeof cryptoSubtle?.digest!=="function"||
   typeof cryptoSubtle?.encrypt!=="function"||
   typeof cryptoSubtle?.decrypt!=="function"||
   [randomBytes,now,authorizeCustomerInvitation,
    loadFrozenCustomerQuote,verifyCurrentCustomerOwnership,
    exchangeAuthorizationCode,issueVerifiedCustomerSession,
    authorizeTrustedInvitationNonceRead].some(x=>typeof x!=="function"))
   throw Error("private_customer_invite_oidc_unconfigured");

 async function trustedLaunch(id,expected,at){
  let row;try{
   row=await db.prepare(ESSENTIALS_PRIVATE_READ_CUSTOMER_INVITE_LAUNCH_SQL)
    .bind(id,expected).first();
  }catch{deny()}
  const scope=checkLaunchRow(row,id,expected,at);
  const nonce=await decrypt(cryptoSubtle,nonceEncryptionKey,
   row.nonce_iv,row.nonce_ciphertext,launchAAD(scope));
  if(!TOKEN(nonce)||await sha(cryptoSubtle,nonce)!==row.nonce_sha256)deny();
  return {row,scope,nonce};
 }
 return Object.freeze({
  // Requires already independently authenticated authorized business issuer,
  // exact frozen full terms and current customer ownership. Return ticket to
  // a trusted outbound invitation-delivery host ONLY, never an HTTP response.
  async issueInvitation({tenantId,customerId,quotationId,
    customerIdentityLinkId}={}){
   if(![tenantId,customerId,quotationId,customerIdentityLinkId].every(ID))deny();
   const at=validNow(now);
   let quote,allowed=false,owned=false;
   try{
    [quote,allowed,owned]=await Promise.all([
     loadFrozenCustomerQuote({tenantId,customerId,quotationId}),
     authorizeCustomerInvitation({
      tenantId,customerId,quotationId,customerIdentityLinkId
     }),
     verifyCurrentCustomerOwnership({
      tenantId,customerId,quotationId,
      linkId:customerIdentityLinkId
     })
    ]);
   }catch{deny()}
   if(allowed!==true||owned!==true||quote?.state!=="accepted"||
      quote.tenantId!==tenantId||quote.customerId!==customerId||
      quote.quotationId!==quotationId||
      !HASH(quote.quotationSha256)||!HASH(quote.termsSha256)||
      !Number.isSafeInteger(quote.acceptanceVersion)||
      !Number.isSafeInteger(quote.totalMinor))deny();
   const invitationId=base64url(getBytes(24,randomBytes));
   const ticket=base64url(getBytes(32,randomBytes));
   const nonce=base64url(getBytes(32,randomBytes));
   if(ticket===nonce)deny();
   const expiresAtMs=at+MAX_MS;
   if(!Number.isSafeInteger(expiresAtMs))deny();
   const scope={invitationId,tenantId,customerId,quotationId,
    customerIdentityLinkId,issuedAtMs:at,expiresAtMs};
   const [ticketHash,nonceHash,sealed]=await Promise.all([
    sha(cryptoSubtle,ticket),sha(cryptoSubtle,nonce),
    encrypt(cryptoSubtle,nonceEncryptionKey,nonce,launchAAD(scope),randomBytes)
   ]);
   let results;
   try{results=await db.batch([
    db.prepare(ESSENTIALS_PRIVATE_ISSUE_CUSTOMER_INVITE_SQL).bind(
     invitationId,tenantId,customerId,quotationId,nonceHash,at,expiresAtMs
    ),
    db.prepare(ESSENTIALS_PRIVATE_SAVE_CUSTOMER_INVITE_LAUNCH_SQL).bind(
     invitationId,customerIdentityLinkId,ticketHash,
     sealed.iv,sealed.cipher,at,expiresAtMs
    ),
    db.prepare(ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_INVITE_ISSUE_SQL).bind(
     invitationId,at
    )
   ])}catch{deny()}
   if(!Array.isArray(results)||results.length!==3||
      results.some(x=>x?.success!==true||x.meta?.changes!==1))deny();
   return Object.freeze({invitationId,ticket,expiresAtMs});
  },
  // Exact HTTPS same-origin POST must carry invitation ticket in JSON BODY,
  // not URL query strings, cookies or logs. Server issues a separate oauth
  // callback binding cookie and the OIDC authorization URL.
  async beginCustomerLogin({request,invitationId}={}){
   if(!ID(invitationId)||request?.method!=="POST")deny();
   const u=new URL(request.url);
   if(u.origin!==expectedOrigin||
     u.pathname!=="/private/customer/invitations/"+invitationId+"/start"||
     u.search||u.hash||
     request.headers.get("origin")!==expectedOrigin||
     request.headers.get("sec-fetch-site")!=="same-origin")deny();
   const ticket=await boundedTicket(request);
   const at=validNow(now);
   const {row,scope,nonce}=await trustedLaunch(invitationId,"issued",at);
   if(await sha(cryptoSubtle,ticket)!==row.ticket_sha256)deny();
   let permitted=false;
   try{permitted=await verifyCurrentCustomerOwnership({
    tenantId:scope.tenantId,customerId:scope.customerId,
    quotationId:scope.quotationId,linkId:scope.customerIdentityLinkId
   })}catch{deny()}
   if(permitted!==true)deny();
   const state=base64url(getBytes(32,randomBytes));
   const oauthCookie=base64url(getBytes(32,randomBytes));
   const codeVerifier=base64url(getBytes(32,randomBytes));
   const attemptId=base64url(getBytes(24,randomBytes));
   if([state,oauthCookie,codeVerifier].some(
    (x,i,a)=>a.some((v,j)=>i!==j&&x===v)))deny();
   const [stateSha256,oauthCookieSha256,digest]=await Promise.all([
    sha(cryptoSubtle,state),sha(cryptoSubtle,oauthCookie),
    sha(cryptoSubtle,codeVerifier)
   ]);
   const expiresAtMs=Math.min(scope.expiresAtMs,at+MAX_MS);
   const att={attemptId,invitationId,stateSha256,
    oauthCookieSha256,issuedAtMs:at,expiresAtMs};
   const sealed=await encrypt(cryptoSubtle,verifierEncryptionKey,
    codeVerifier,attemptAAD(att),randomBytes);
   let results;
   try{results=await db.batch([
    db.prepare(ESSENTIALS_PRIVATE_START_CUSTOMER_INVITE_SQL).bind(
     at,invitationId,row.ticket_sha256,expiresAtMs
    ),
    db.prepare(ESSENTIALS_PRIVATE_SAVE_CUSTOMER_OIDC_ATTEMPT_SQL).bind(
     attemptId,stateSha256,oauthCookieSha256,sealed.iv,sealed.cipher,
     at,expiresAtMs,invitationId,at,expiresAtMs
    ),
    db.prepare(ESSENTIALS_PRIVATE_ASSERT_CUSTOMER_OIDC_START_SQL).bind(
     invitationId,attemptId,at
    )
   ])}catch{deny()}
   if(!Array.isArray(results)||results.length!==3||
      results.some(x=>x?.success!==true||x.meta?.changes!==1))deny();
   const url=new URL(authorizationEndpoint);
   for(const [k,v] of [
    ["response_type","code"],["client_id",clientId],
    ["redirect_uri",redirectUri],["scope","openid"],
    ["code_challenge",base64url(Uint8Array.from(
     digest.match(/../g),x=>parseInt(x,16)))],
    ["code_challenge_method","S256"],["state",state],
    ["nonce",nonce],["prompt","login"],["max_age","0"]
   ])url.searchParams.set(k,v);
   return Object.freeze({
    authorizationUrl:url.href,
    setCookie:COOKIE+"="+oauthCookie+
     "; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age="+
     Math.floor((expiresAtMs-at)/1000),
    expiresAtMs
   });
  },
  // Separate OIDC redirect; cross-site GET is expected. OAuth callback
  // cookie+state bind the browser to its exact one-time invitation attempt.
  // Confidential exchange yields an UNVERIFIED token; only #2709 independent
  // pinned RS256 validator + current ownership can issue a customer session.
  async completeCustomerLogin({request}={}){
   if(request?.method!=="GET"||
      typeof request?.headers?.get!=="function")deny();
   let u;try{u=new URL(request.url)}catch{deny()}
   if(u.origin!==redir.origin||u.pathname!==redir.pathname||
      u.hash||u.username||u.password)deny();
   const keys=[...u.searchParams.keys()];
   if(keys.length!==3||["code","state","iss"].some(k=>
      u.searchParams.getAll(k).length!==1)||
      keys.some(k=>!["code","state","iss"].includes(k)))deny();
   const code=u.searchParams.get("code"),state=u.searchParams.get("state");
   if(!CODE(code)||!TOKEN(state)||u.searchParams.get("iss")!==issuer)deny();
   const oauthCookie=getOauthCookie(request.headers.get("cookie"));
   const at=validNow(now);
   const [stateSha256,cookieSha256]=await Promise.all([
    sha(cryptoSubtle,state),sha(cryptoSubtle,oauthCookie)
   ]);
   let row;
   try{row=await db.prepare(ESSENTIALS_PRIVATE_CONSUME_CUSTOMER_OIDC_ATTEMPT_SQL)
    .bind(at,stateSha256,cookieSha256,at,at).first()}catch{deny()}
   if(!row||row.state!=="consumed"||!ID(row.attempt_id)||
      !ID(row.invitation_id)||row.state_sha256!==stateSha256||
      row.oauth_cookie_sha256!==cookieSha256||
      !Number.isSafeInteger(row.issued_at_ms)||
      !Number.isSafeInteger(row.expires_at_ms)||
      row.issued_at_ms>at||row.expires_at_ms<=at||
      row.expires_at_ms-row.issued_at_ms>MAX_MS)deny();
   const att={attemptId:row.attempt_id,invitationId:row.invitation_id,
    stateSha256,oauthCookieSha256,
    issuedAtMs:row.issued_at_ms,expiresAtMs:row.expires_at_ms};
   const verifier=await decrypt(cryptoSubtle,verifierEncryptionKey,
    row.verifier_iv,row.verifier_ciphertext,attemptAAD(att));
   if(!TOKEN(verifier))deny();
   const {scope}=await trustedLaunch(row.invitation_id,"started",at);
   let owned=false;
   try{owned=await verifyCurrentCustomerOwnership({
    tenantId:scope.tenantId,customerId:scope.customerId,
    quotationId:scope.quotationId,linkId:scope.customerIdentityLinkId
   })}catch{deny()}
   if(owned!==true)deny();
   let exchange;
   try{exchange=await exchangeAuthorizationCode({
    code,codeVerifier:verifier,clientId,tokenEndpoint,redirectUri
   })}catch{deny()}
   if(typeof exchange?.idToken!=="string"||
     exchange.idToken.length<60||exchange.idToken.length>8192||
     exchange.idToken.split(".").length!==3)deny();
   let issued;
   try{issued=await issueVerifiedCustomerSession({
    invitationId:row.invitation_id,idToken:exchange.idToken
   })}catch{deny()}
   if(issued?.role!=="customer"||
     !Number.isSafeInteger(issued.expiresAtMs)||
     issued.expiresAtMs<=at||
     typeof issued.setCookie!=="string"||
     !/^__Host-thebe-customer=[A-Za-z0-9_-]{43}; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+$/.test(issued.setCookie)||
     !TOKEN(issued.csrfToken))deny();
   return Object.freeze({
    customerSetCookie:issued.setCookie,csrfToken:issued.csrfToken,
    oauthClearCookie:COOKIE+
      "=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    invitationId:row.invitation_id,quotationId:scope.quotationId
   });
  },
  // Only a confidential INTERNAL callback may load the original invitation
  // nonce for the independently pinned #2709 signed-token validator. Never
  // expose this method as a public HTTP route or logs.
  async loadTrustedCustomerInvitation({invitationId}={}){
   if(!ID(invitationId))deny();
   let allowed=false;try{allowed=await authorizeTrustedInvitationNonceRead({
    invitationId,action:"confidential-customer-session-issue"
   })}catch{deny()}
   if(allowed!==true)deny();
   const at=validNow(now);
   const {scope,nonce}=await trustedLaunch(invitationId,"started",at);
   return Object.freeze({
    state:"pending",invitationId,tenantId:scope.tenantId,
    customerId:scope.customerId,quotationId:scope.quotationId,
    nonce,issuedAtMs:scope.issuedAtMs,expiresAtMs:scope.expiresAtMs
   });
  }
 });
}
