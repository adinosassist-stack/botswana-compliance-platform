from pathlib import Path

OLD_HERO = 'Run your Botswana business with fewer surprises.'
NEW_HERO = 'Run money, people, work and compliance from one intelligent desk.'

wrapper_path = Path('scripts/production-synthetic-full-user-wrapper.mjs')
wrapper = wrapper_path.read_text(encoding='utf-8')
old_wait = "await page.waitForSelector('#marketingGate[data-market-growth-v20=\"1\"]',{state:'visible',timeout:15000});"
new_wait = "await page.waitForSelector('#marketingGate[data-market-refinement-v21=\"21\"]',{state:'visible',timeout:15000});"
assert wrapper.count(old_wait) == 1, f'expected one v20 desktop wait, found {wrapper.count(old_wait)}'
assert wrapper.count(OLD_HERO) == 1, f'expected one old desktop hero, found {wrapper.count(OLD_HERO)}'
wrapper = wrapper.replace(old_wait, new_wait, 1).replace(OLD_HERO, NEW_HERO, 1)
wrapper_path.write_text(wrapper, encoding='utf-8')

mobile_path = Path('scripts/production-mobile-postdeploy-smoke.mjs')
mobile = mobile_path.read_text(encoding='utf-8')
assert mobile.count(old_wait) == 1, f'expected one v20 mobile wait, found {mobile.count(old_wait)}'
assert mobile.count(OLD_HERO) == 1, f'expected one old mobile hero, found {mobile.count(OLD_HERO)}'
mobile = mobile.replace(old_wait, new_wait, 1).replace(OLD_HERO, NEW_HERO, 1)
mobile_path.write_text(mobile, encoding='utf-8')

test_path = Path('tests/v82-phase0-launch-audit-deferred-integrations.mjs')
test = test_path.read_text(encoding='utf-8')
old_block = '''const publicMarketing=fs.readFileSync('public/js/public-marketing-v249.js','utf8');
const currentHero='Run your Botswana business with fewer surprises.';
ok(
  !publicMarketing.includes('text(gate.querySelector(".hero h1"),')&&
  fullUserWrapper.includes('data-market-growth-v20')&&
  fullUserWrapper.includes(`assert(publicState.hero==='${currentHero}','public root hero missing or stale');`),
  'mandatory full-user lifecycle binds its public-root proof to the server-rendered canonical hero and prevents the enhancement layer from overwriting it'
);'''
new_block = '''const marketRefinement=fs.readFileSync('public/js/market-refinement-v21.js','utf8');
const currentHero='Run money, people, work and compliance from one intelligent desk.';
ok(
  marketRefinement.includes(`text(hero.querySelector("h1"),"${currentHero}")`)&&
  fullUserWrapper.includes('data-market-refinement-v21')&&
  fullUserWrapper.includes(`assert(publicState.hero==='${currentHero}','public root hero missing or stale');`),
  'mandatory full-user lifecycle waits for market refinement v21 and proves its canonical public hero'
);'''
assert test.count(old_block) == 1, f'expected one v20 Phase 0 proof block, found {test.count(old_block)}'
test_path.write_text(test.replace(old_block, new_block, 1), encoding='utf-8')
