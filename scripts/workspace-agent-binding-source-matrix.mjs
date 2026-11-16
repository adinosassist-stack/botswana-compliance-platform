// Pure, read-only classification of Cloudflare Worker binding sources.
// Never outputs binding values, credentials, full binding names, or a mutation body.
export const PINNED_VERSION = '64d9bae9-2ea3-40c1-9a26-83cea97ad71c';
export const ISOLATED_D1 = 'fa317ccc-683d-4466-9e3a-e296872d58ba';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const knownTypes = new Set(['plain_text','secret_text','d1']);
const SOURCE_NAMES = ['pinned','latest','scriptSettings'];
function describeBindings(items) {
  if(!Array.isArray(items)) return {valid:false,issues:['missing_bindings']};
  const issues=[];
  const names=items.map(x=>x?.name);
  if(names.some(x=>typeof x!=='string'||!x) || new Set(names).size!==names.length)
    issues.push('invalid_or_duplicate_names');
  if(items.some(x=>!knownTypes.has(x?.type))) issues.push('unexpected_binding_type');
  const session=items.filter(x=>x?.name==='SESSION_SECRET');
  const db=items.filter(x=>x?.name==='DB');
  const advisory=items.filter(x=>x?.name==='WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED');
  const secretState=session.length===0?'absent':
    session.length===1&&session[0].type==='secret_text'?'present':'unexpected';
  const d1State=db.length===0?'absent':
    db.length===1&&db[0].type==='d1'&&db[0].id===ISOLATED_D1?'expected':'unexpected';
  const flagState=advisory.length===0?'absent':
    advisory.length===1&&advisory[0].type==='plain_text'&&
    ['true','false'].includes(advisory[0].text)?advisory[0].text:'unexpected';
  // Only static labels and counts are returned. No third-party binding names/values.
  const unexpectedResources=items.filter(x=>
    x?.type!=='plain_text' && x?.name!=='SESSION_SECRET' && x?.name!=='DB').length;
  const topology=items.map(x=>x?.name+':'+x?.type).sort().join('|');
  return {valid:issues.length===0,issues,bindingCount:items.length,
    sessionSecret:secretState,d1Binding:d1State,advisoryFlag:flagState,
    unexpectedResourceCount:unexpectedResources,topology};
}
export function reconcileBindingSources({pinned,latest,scriptSettings,deployments}={}) {
  const issues=[];
  if(pinned?.success!==true||pinned.result?.id!==PINNED_VERSION)
    issues.push('pinned_version_identity_unverified');
  if(latest?.success!==true||!UUID.test(latest.result?.id??''))
    issues.push('latest_version_identity_unverified');
  if(scriptSettings?.success!==true) issues.push('script_settings_unverified');
  const actual=deployments?.result?.deployments?.[0]?.versions;
  if(deployments?.success!==true||!Array.isArray(actual)||actual.length!==1||
    actual[0]?.version_id!==PINNED_VERSION||actual[0]?.percentage!==100)
    issues.push('deployed_version_allocation_unverified');
  const envelopes={pinned,latest,scriptSettings};
  const inspected={};
  for(const name of SOURCE_NAMES) {
    const d=describeBindings(envelopes[name]?.result?.bindings);
    inspected[name]=d;
    for(const issue of d.issues) issues.push(name+'_'+issue);
  }
  const safeView=Object.fromEntries(SOURCE_NAMES.map(name=>{
    const d=inspected[name];
    return [name,{bindingCount:d.bindingCount??null,sessionSecret:d.sessionSecret??'unknown',
      d1Binding:d.d1Binding??'unknown',advisoryFlag:d.advisoryFlag??'unknown',
      unexpectedResourceCount:d.unexpectedResourceCount??null}];
  }));
  return {
    valid:issues.length===0,issues,latestEqualsPinned:latest?.result?.id===PINNED_VERSION,
    // Same topology does not prove same code or variable values.
    topologyMatches:{
      scriptPinned:inspected.scriptSettings.topology===inspected.pinned.topology,
      scriptLatest:inspected.scriptSettings.topology===inspected.latest.topology
    },
    sources:safeView,
    mutationsAuthorized:false
  };
}
