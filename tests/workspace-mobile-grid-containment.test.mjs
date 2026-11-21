import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/assets/workspace-container-alignment-v313.css',import.meta.url),'utf8');
test('mobile workspace grid containment is scoped to 620px and named workspace roots',()=>{
 assert.match(css,/\@media\s*\(max-width:\s*620px\)/);
 for(const id of ['workhub','businesshub','evidencehub','tenderhub','automationhub','moneyhub','protecthub','sites','servicesmarketplace'])
  assert.ok(css.includes('#'+id),'missing workspace root '+id);
 assert.match(css,/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
 assert.match(css,/overflow-wrap:\s*anywhere/);
});
