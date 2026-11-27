"""Build Wrangler profiles for a protected, synthetic Dock research run."""
import argparse
import json
from pathlib import Path
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]
DOCK_ORIGIN = "https://dock-staging.thebedesk.com"
DATABASE = {
    "binding": "DB",
    "database_name": "bw-dock-hosted-synthetic-staging",
    "database_id": "c63255cf-c589-4f6b-99c7-2d2e437566b5",
}
WORKERS = {
    "workspace": ("bw-dock-research-workspace-staging", "general-ai-dock-workspace-staging-worker.js"),
    "backend": ("bw-dock-private-ai-staging", "general-ai-staging-entry.js"),
}


def build_profile(role, fixture_suffix, voice=False):
    if not re.fullmatch(r"[a-f0-9]{32}", fixture_suffix):
        raise ValueError("Expected a 32-character hexadecimal synthetic fixture suffix")
    directory = ROOT / "cloudflare"
    source = directory / f"wrangler.dock-hosted-staging-{role}.review.toml"
    profile = tomllib.loads(source.read_text())
    worker, entry = WORKERS[role]
    expected_keys = {"name", "main", "compatibility_date", "workers_dev", "preview_urls",
                     "keep_vars", "vars", "d1_databases"}
    if role == "workspace":
        expected_keys |= {"assets", "services"}
        if profile.get("services") != [{"binding": "STAGING_AI", "service": WORKERS["backend"][0]}]:
            raise ValueError("Unexpected workspace service binding")
        if profile.get("assets") != {"directory": "../public", "binding": "ASSETS", "run_worker_first": True}:
            raise ValueError("Unexpected workspace assets binding")
        profile["assets"]["directory"] = str(ROOT / "public")
    if (set(profile) != expected_keys or profile["name"] != worker or profile["main"] != "src/" + entry
            or profile["d1_databases"] != [DATABASE]
            or any(profile[key] is not False for key in ("workers_dev", "preview_urls", "keep_vars"))):
        raise ValueError("Unexpected Dock staging Worker profile")
    profile["main"] = str(directory / "src" / entry)
    variables = {
        "APP_ENV": "staging",
        "AI_FEATURES_DEFAULT": "off",
        "REGISTRATION_MODE": "hold",
        "PAYMENT_PROVIDER": "none",
        "AGENT_BOUNDED_TASK_EXECUTION_ENABLED": "0",
        "THEBE_INTERNAL_AUTONOMY_ENABLED": "false",
        "THEBE_LIVE_VOICE_ENABLED": "true" if voice and role == "workspace" else "false",
        "THEBE_GPT_LIVE_PREVIEW_ENABLED": "false",
        "THEBE_MARKETING_VOICE_ENABLED": "false",
        "THEBE_GENERAL_AI_ENABLED": "true" if role == "backend" else "false",
        "THEBE_GENERAL_AI_RESEARCH_ENABLED": "true" if role == "backend" else "false",
    }
    if role == "workspace":
        variables.update(
            DOCK_STAGING_WORKSPACE_ORIGIN=DOCK_ORIGIN,
            PUBLIC_ORIGIN=DOCK_ORIGIN,
            PUBLIC_APP_URL=DOCK_ORIGIN,
            DOCK_STAGING_RESEARCH_ENABLED="true",
            DOCK_RESEARCH_FIXTURE_USER_ID=f"dock-fixture-{fixture_suffix}-user",
            DOCK_RESEARCH_FIXTURE_TENANT_ID=f"dock-fixture-{fixture_suffix}-tenant",
        )
    else:
        variables.update(
            PUBLIC_ORIGIN="https://ai-staging.thebedesk.com",
            PUBLIC_APP_URL="https://ai-staging.thebedesk.com",
            THEBE_GENERAL_AI_RESEARCH_PROVIDER="openai",
        )
        profile["ratelimits"] = [{
            "name": "GENERAL_AI_RATE_LIMITER",
            "namespace_id": "78212079",
            "simple": {"limit": 3, "period": 60},
        }]
    profile["vars"] = variables
    return profile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("role", choices=WORKERS)
    parser.add_argument("fixture_suffix")
    parser.add_argument("--voice", action="store_true")
    args = parser.parse_args()
    print(json.dumps(build_profile(args.role, args.fixture_suffix, args.voice), indent=2))


if __name__ == "__main__":
    main()
