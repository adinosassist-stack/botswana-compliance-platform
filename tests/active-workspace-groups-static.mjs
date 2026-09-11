import fs from 'node:fs';
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

// Recovery successor: the old V70 data-nav-group toggle contract was superseded by
// the V81+ accessible <details> groups. Preserve the intent (active, reachable,
// role-aware grouped navigation) without resurrecting obsolete markup.
const required=[
  'class="nav-access-group"',
  'class="nav-specialist-tools"',
  'class="nav-access-count"',
  'class="nav-specialist-count"',
  'function openGroupForView(view)',
  'function syncGroupVisibility()',
  'document.querySelectorAll(".nav-access-group").forEach(group=>group.addEventListener("toggle"',
  'data-view="sites"',
  'Sites &amp; field work'
];
for(const token of required)if(!html.includes(token))throw new Error('V81+ workspace group control missing: '+token);

for(const label of [
  'Operations &amp; people',
  'Compliance &amp; records',
  'Evidence, risk &amp; tenders',
  'Partners &amp; services',
  'Automation &amp; AI',
  'Account &amp; administration'
]){
  if(!html.includes(`<span>${label}</span>`))throw new Error('Accessible workspace group missing: '+label);
}

// Every current view must remain reachable from either the primary sidebar or the
// grouped/specialist navigation/search index.
const viewIds=new Set([...html.matchAll(/<section id="([^"]+)" class="view(?:\s|\")/g)].map(m=>m[1]));
const navIds=new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]));
const missing=[...viewIds].filter(id=>!navIds.has(id));
if(missing.length)throw new Error('Grouped navigation left views unreachable: '+missing.join(', '));

for(const id of ['tenderready','workflowhub','accountsocial','integrations','sites']){
  if(!navIds.has(id)||!viewIds.has(id))throw new Error('Representative V81+ group view missing: '+id);
}

// The V70 toggle markers must not be reintroduced as a compatibility hack.
for(const obsolete of ['data-nav-group="products"','window.setNavGroupExpanded=function','function childrenFor(toggle)','nav-child-hidden']){
  if(html.includes(obsolete))throw new Error('Obsolete V70 workspace-group mechanism reintroduced: '+obsolete);
}

console.log('V81+ active workspace groups static checks passed');
