import {authenticate,roleAllowed} from "./agentic-authority-core.js";
import {validateResponsibility} from "./agent-responsibilities.js";

const clean=(v,n=160)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,n);
const id=prefix=>`${prefix}_${crypto.randomUUID()}`;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const ownerOnly=auth=>roleAllowed(auth,"owner");

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const rows=result=>Array.isArray(result?.results)?result.results:[];

export async function handleAgenticResponsibilityRequest({request,logicalPath,env}){
  const path=String(logicalPath||new URL(request.url).pathname);
  if(path!=="/api/agentic/responsibilities")return null;
  const auth=await authenticate(request,env);
  if(!auth)return json({error:"unauthenticated"},401);
  if(!roleAllowed(auth,"owner","manager"))return json({error:"forbidden"},403);
  if(!["GET","PUT"].includes(request.method)&&!ownerOnly(auth))return json({error:"owner_required"},403);
  try{
    if(request.method==="POST"){
      const body=await request.json().catch(()=>null); if(!body)return json({error:"invalid_json"},400);
      const checked=validateResponsibility(body); if(!checked.ok)return json({error:"responsibility_invalid",details:checked.errors},400);
      const v=checked.value,rid=id("resp"),eid=id("revt"),now=new Date().toISOString(),actor=String(auth.user_id||auth.sub||"owner");
      const detail=JSON.stringify({workspace:v.workspace,status:"draft"}),evidence=await hash(`${rid}|CREATED|${actor}|${detail}`);
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO agent_responsibilities(id,tenant_id,agent_id,title,objective,workspace,status,autonomy_ceiling,schedule_kind,schedule_spec,tool_scope_json,data_scope_json,budget_minor,owner_user_id,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,"draft",?,?,?,?,?,?,?,?,?,?)`).bind(rid,auth.tenant_id,"THEBE-001",v.title,v.objective,v.workspace,v.autonomyCeiling,v.scheduleKind,v.scheduleSpec,JSON.stringify(v.toolScope),JSON.stringify(v.dataScope),v.budgetMinor,actor,actor,now,now),
        env.DB.prepare(`INSERT INTO agent_responsibility_events(id,tenant_id,responsibility_id,event_type,actor_type,actor_id,detail_json,evidence_hash,created_at) VALUES(?,?,?,"CREATED","human",?,?,?,?,?)`).bind(eid,auth.tenant_id,rid,actor,detail,evidence,now)
      ]);
      return json({ok:true,id:rid,status:"draft"},201);
    }
    if(request.method==="PUT"){
      const body=await request.json().catch(()=>null); if(!body)return json({error:"invalid_json"},400);
      const rid=clean(body.id,120),kind=clean(body.kind,32).toLowerCase();
      const eventType=kind==="observation"?"OBSERVED":kind==="proposal"?"PROPOSED_ACTION":null;
      if(!rid||!eventType)return json({error:"responsibility_evidence_invalid"},400);
      const found=rows(await env.DB.prepare(`SELECT id,status,tool_scope_json,data_scope_json FROM agent_responsibilities WHERE tenant_id=? AND id=? LIMIT 1`).bind(auth.tenant_id,rid).all())[0];
      if(!found)return json({error:"responsibility_not_found"},404);
      if(found.status!=="active")return json({error:"responsibility_inactive",status:found.status},409);
      const summary=clean(body.summary,600),actionKey=clean(body.actionKey,120);
      if(!summary)return json({error:"responsibility_evidence_invalid"},400);
      let toolScope=[]; try{toolScope=JSON.parse(found.tool_scope_json||"[]")}catch{return json({error:"scope_invalid"},400)}
      if(eventType==="PROPOSED_ACTION"&&(!actionKey||!Array.isArray(toolScope)||!toolScope.includes(actionKey)))return json({error:"proposal_out_of_scope"},403);
      const actor=String(auth.user_id||auth.sub||"manager"),actorType="human",now=new Date().toISOString();
      const detail=JSON.stringify(eventType==="OBSERVED"?{summary}:{summary,actionKey,executionAuthority:false});
      const evidence=await hash(`${rid}|${eventType}|${actor}|${detail}`);
      const written=await env.DB.prepare(`INSERT INTO agent_responsibility_events(id,tenant_id,responsibility_id,event_type,actor_type,actor_id,detail_json,evidence_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM agent_responsibilities WHERE tenant_id=? AND id=? AND status="active")`).bind(id("revt"),auth.tenant_id,rid,eventType,actorType,actor,detail,evidence,now,auth.tenant_id,rid).run();
      if(Number(written?.meta?.changes||0)!==1)return json({error:"responsibility_evidence_conflict"},409);
      return json({ok:true,id:rid,eventType,executionAuthority:false},201);
    }
    if(request.method==="PATCH"){
      const body=await request.json().catch(()=>null); if(!body)return json({error:"invalid_json"},400);
      const rid=clean(body.id,120),action=clean(body.action,24).toLowerCase();
      const transitions={activate:["draft","active","ACTIVATED"],pause:["active","paused","PAUSED"],resume:["paused","active","RESUMED"],complete:["active","completed","COMPLETED"],cancel:["draft","cancelled","CANCELLED"]};
      const rule=transitions[action]; if(!rid||!rule)return json({error:"transition_invalid"},400);
      const found=rows(await env.DB.prepare(`SELECT id,status,tool_scope_json,data_scope_json FROM agent_responsibilities WHERE tenant_id=? AND id=? LIMIT 1`).bind(auth.tenant_id,rid).all())[0];
      if(!found)return json({error:"responsibility_not_found"},404); if(found.status!==rule[0])return json({error:"transition_conflict",status:found.status},409);
      const actor=String(auth.user_id||auth.sub||"owner"),now=new Date().toISOString();
      let toolScope=[],dataScope=[]; try{toolScope=JSON.parse(found.tool_scope_json||"[]");dataScope=JSON.parse(found.data_scope_json||"[]")}catch{return json({error:"scope_invalid"},400)}
      if(action==="activate"&&(!Array.isArray(toolScope)||!toolScope.length||!Array.isArray(dataScope)||!dataScope.length))return json({error:"bounded_scope_required"},400);
      const stamp=action==="activate"?", activated_by_user_id=?, activated_at=?":action==="pause"?", paused_at=?":action==="complete"?", completed_at=?":action==="cancel"?", cancelled_at=?":"";
      const values=action==="activate"?[rule[1],now,actor,now,auth.tenant_id,rid,rule[0]]:[rule[1],now,now,auth.tenant_id,rid,rule[0]];
      const detail=JSON.stringify({from:rule[0],to:rule[1],action}),evidence=await hash(`${rid}|${rule[2]}|${actor}|${detail}`);
      const update=env.DB.prepare(`UPDATE agent_responsibilities SET status=?, updated_at=?${stamp} WHERE tenant_id=? AND id=? AND status=?`).bind(...values);
      const event=env.DB.prepare(`INSERT INTO agent_responsibility_events(id,tenant_id,responsibility_id,event_type,actor_type,actor_id,detail_json,evidence_hash,created_at) SELECT ?,?,?,?,"human",?,?,?,?,? WHERE EXISTS(SELECT 1 FROM agent_responsibilities WHERE tenant_id=? AND id=? AND status=?)`).bind(id("revt"),auth.tenant_id,rid,rule[2],actor,detail,evidence,now,auth.tenant_id,rid,rule[1]);
      const results=await env.DB.batch([update,event]);
      if(Number(results?.[0]?.meta?.changes||0)!==1)return json({error:"transition_conflict"},409);
      if(Number(results?.[1]?.meta?.changes||0)!==1){
        const rollbackStamp=action==="activate"?", activated_by_user_id=NULL, activated_at=NULL":action==="pause"?", paused_at=NULL":action==="complete"?", completed_at=NULL":action==="cancel"?", cancelled_at=NULL":"";
        const rolledBack=await env.DB.prepare(`UPDATE agent_responsibilities SET status=?, updated_at=?${rollbackStamp} WHERE tenant_id=? AND id=? AND status=?`).bind(rule[0],now,auth.tenant_id,rid,rule[1]).run();
        if(Number(rolledBack?.meta?.changes||0)!==1)return json({error:"audit_write_failed_manual_review_required"},503);
        return json({error:"audit_write_failed_transition_reverted"},503);
      }
      return json({ok:true,id:rid,status:rule[1]});
    }
    if(request.method!=="GET")return json({error:"method_not_allowed"},405);
    const result=await env.DB.prepare(`SELECT
      id,title,objective,workspace,status,autonomy_ceiling,schedule_kind,schedule_spec,
      tool_scope_json,data_scope_json,budget_minor,owner_user_id,activated_at,updated_at,
      (SELECT COUNT(*) FROM agent_responsibility_events e WHERE e.tenant_id=agent_responsibilities.tenant_id AND e.responsibility_id=agent_responsibilities.id) event_count,\n      (SELECT MAX(created_at) FROM agent_responsibility_events e WHERE e.tenant_id=agent_responsibilities.tenant_id AND e.responsibility_id=agent_responsibilities.id) last_event_at
      FROM agent_responsibilities
      WHERE tenant_id=?
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, updated_at DESC
      LIMIT 100`).bind(auth.tenant_id).all();
    const activity=await env.DB.prepare(`SELECT responsibility_id,event_type,actor_type,detail_json,evidence_hash,created_at FROM (
      SELECT responsibility_id,event_type,actor_type,detail_json,evidence_hash,created_at,
        ROW_NUMBER() OVER (PARTITION BY responsibility_id ORDER BY created_at DESC,id DESC) activity_rank
      FROM agent_responsibility_events
      WHERE tenant_id=?
    ) WHERE activity_rank<=3 ORDER BY created_at DESC LIMIT 300`).bind(auth.tenant_id).all();
    const recentByResponsibility=new Map();
    for(const event of rows(activity)){
      let detail={};try{detail=JSON.parse(event.detail_json||"{}")}catch{}
      const list=recentByResponsibility.get(event.responsibility_id)||[];
      list.push({eventType:event.event_type,actorType:event.actor_type,summary:clean(detail.summary||detail.actionKey||detail.status||event.event_type,180),actionKey:detail.actionKey?clean(detail.actionKey,120):null,evidenceHash:clean(event.evidence_hash,80)||null,createdAt:event.created_at});
      recentByResponsibility.set(event.responsibility_id,list);
    }
    return json({items:rows(result).map(row=>({
      id:row.id,title:row.title,objective:row.objective,workspace:row.workspace,status:row.status,
      autonomyCeiling:Number(row.autonomy_ceiling||0),scheduleKind:row.schedule_kind,scheduleSpec:row.schedule_spec||null,
      toolScope:JSON.parse(row.tool_scope_json||"[]"),dataScope:JSON.parse(row.data_scope_json||"[]"),
      budgetMinor:row.budget_minor==null?null:Number(row.budget_minor),ownerUserId:row.owner_user_id,
      activatedAt:row.activated_at||null,updatedAt:row.updated_at,eventCount:Number(row.event_count||0),lastEventAt:row.last_event_at||null,
      recentEvents:recentByResponsibility.get(row.id)||[]
    }))});
  }catch{
    return json({error:"responsibility_schema_unavailable",items:[]},503);
  }
}
