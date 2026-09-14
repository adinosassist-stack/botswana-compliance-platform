from pathlib import Path

index_path=Path('public/index.html')
html=index_path.read_text()
old='function scrollToPricing(){document.getElementById("pricing")?.scrollIntoView({behavior:"smooth",block:"start"})}'
new='''function scrollToPricing(){
 const gate=document.getElementById("marketingGate"),target=document.getElementById("pricing");
 if(!target)return false;
 if(gate&&!gate.classList.contains("hidden")){
  const gateRect=gate.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
  const sticky=document.querySelector("#marketingGate .marketingnav");
  const offset=Math.max(0,Number(sticky?.offsetHeight||0)+8);
  const top=Math.max(0,gate.scrollTop+(targetRect.top-gateRect.top)-offset);
  gate.scrollTo({top,behavior:"auto"});
  return true;
 }
 target.scrollIntoView({behavior:"auto",block:"start"});
 return true;
}'''
if html.count(old)!=1:
    raise SystemExit(f'scrollToPricing marker count={html.count(old)}')
index_path.write_text(html.replace(old,new,1))

test_path=Path('tests/v78-home-navigation-adversarial.mjs')
test=test_path.read_text()
marker="ok('signed-in marketing page offers Open workspace',html.includes('id=\"marketingWorkspaceBtn\"')&&html.includes('id=\"marketingHeroWorkspaceBtn\"')&&html.includes('function syncMarketingSessionActions()'));\n"
insert="""ok('signed-in marketing page offers Open workspace',html.includes('id=\"marketingWorkspaceBtn\"')&&html.includes('id=\"marketingHeroWorkspaceBtn\"')&&html.includes('function syncMarketingSessionActions()'));
const pricingFn=html.slice(html.indexOf('function scrollToPricing()'),html.indexOf('function safeSessionGet('));
ok('See plans scrolls the fixed marketing container explicitly',html.includes('data-bw-onclick=\"scrollToPricing()\"')&&pricingFn.includes('gate.scrollTo({top,behavior:\"auto\"})')&&pricingFn.includes('gate.scrollTop+(targetRect.top-gateRect.top)-offset')&&pricingFn.includes('#marketingGate .marketingnav'));
ok('See plans keeps a non-marketing fallback',pricingFn.includes('target.scrollIntoView({behavior:\"auto\",block:\"start\"})')&&pricingFn.includes('return true'));
"""
if test.count(marker)!=1:
    raise SystemExit(f'navigation test marker count={test.count(marker)}')
test_path.write_text(test.replace(marker,insert,1))

Path('scripts/tmp-pricing-navigation-patch.py').unlink(missing_ok=True)
Path('.github/workflows/tmp-pricing-navigation-patch.yml').unlink(missing_ok=True)
