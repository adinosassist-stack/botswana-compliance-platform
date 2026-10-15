from pathlib import Path

wrapper_path = Path('scripts/production-synthetic-full-user-wrapper.mjs')
wrapper = wrapper_path.read_text(encoding='utf-8')
old_wrapper = """    assert(publicRoot?.status()===200,`public root returned HTTP ${publicRoot?.status()||0}`);\n    const publicState=await page.evaluate(()=>({hero:(document.querySelector('.hero h1')?.textContent||'').trim(),hasWorkspace:!!document.getElementById('appShell'),hasAuthForm:!!document.getElementById('authForm')}));\n    assert(publicState.hero==='Run your Botswana business from one place.','public root hero missing or stale');"""
new_wrapper = """    assert(publicRoot?.status()===200,`public root returned HTTP ${publicRoot?.status()||0}`);\n    await page.waitForSelector('#marketingGate[data-market-growth-v20=\"1\"]',{state:'visible',timeout:15000});\n    const publicState=await page.evaluate(()=>({hero:(document.querySelector('.hero h1')?.textContent||'').trim(),hasWorkspace:!!document.getElementById('appShell'),hasAuthForm:!!document.getElementById('authForm')}));\n    assert(publicState.hero==='Run your Botswana business with fewer surprises.','public root hero missing or stale');"""
assert wrapper.count(old_wrapper) == 1, f'expected one exact stale wrapper contract, found {wrapper.count(old_wrapper)}'
wrapper_path.write_text(wrapper.replace(old_wrapper, new_wrapper, 1), encoding='utf-8')

test_path = Path('tests/v82-phase0-launch-audit-deferred-integrations.mjs')
test = test_path.read_text(encoding='utf-8')
old_hero = "const currentHero='Run your Botswana business from one place.';"
new_hero = "const currentHero='Run your Botswana business with fewer surprises.';"
assert test.count(old_hero) == 1, f'expected one stale static hero contract, found {test.count(old_hero)}'
test = test.replace(old_hero, new_hero, 1)
old_condition = """  !publicMarketing.includes('text(gate.querySelector(\".hero h1\"),')&&\n  fullUserWrapper.includes(`assert(publicState.hero==='${currentHero}','public root hero missing or stale');`),"""
new_condition = """  !publicMarketing.includes('text(gate.querySelector(\".hero h1\"),')&&\n  fullUserWrapper.includes('data-market-growth-v20')&&\n  fullUserWrapper.includes(`assert(publicState.hero==='${currentHero}','public root hero missing or stale');`),"""
assert test.count(old_condition) == 1, f'expected one static contract condition, found {test.count(old_condition)}'
test_path.write_text(test.replace(old_condition, new_condition, 1), encoding='utf-8')
