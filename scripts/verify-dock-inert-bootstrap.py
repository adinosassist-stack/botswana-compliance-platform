"""Fail closed on any deviation from the inert staging bootstrap profile."""
import pathlib
import tomllib
root=pathlib.Path(__file__).resolve().parents[1]
with (root/"cloudflare/wrangler.dock-hosted-staging-inert.toml").open("rb") as f:
    c=tomllib.load(f)
assert set(c)=={"name","main","compatibility_date","workers_dev","preview_urls","keep_vars","vars","assets"}
assert c["name"]=="bw-dock-research-workspace-staging"
assert c["main"]=="src/general-ai-dock-workspace-staging-worker.js"
assert c["workers_dev"] is c["preview_urls"] is c["keep_vars"] is False
assert c["assets"]=={"directory":"../public","binding":"ASSETS","run_worker_first":True}
assert c["vars"]=={
    "APP_ENV":"staging","DOCK_STAGING_RESEARCH_ENABLED":"false",
    "THEBE_GENERAL_AI_ENABLED":"false","THEBE_GENERAL_AI_RESEARCH_ENABLED":"false",
    "AI_FEATURES_DEFAULT":"off","THEBE_INTERNAL_AUTONOMY_ENABLED":"false",
    "AGENT_BOUNDED_TASK_EXECUTION_ENABLED":"0","THEBE_LIVE_VOICE_ENABLED":"false",
    "THEBE_MARKETING_VOICE_ENABLED":"false","PAYMENT_PROVIDER":"none","REGISTRATION_MODE":"hold"
}
print("PASS: inert Dock staging profile; no route, session, D1, service or provider binding")
