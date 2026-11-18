#!/usr/bin/env python3
"""Fail-closed Cloudflare read-only inventory before/after version-only upload."""
import argparse
import json
import os
import urllib.error
import urllib.request

ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d"
ZONE="33e363d52b69c4a64dbb8a0891dbb3a9"
D1="518a9e33-b2ba-4204-ac52-aae4150a7b52"
NAME="bw-manager-invitations-functional-private-staging"
HOST="manager-staging.thebedesk.com"

def get(path,allow404=False):
    req=urllib.request.Request("https://api.cloudflare.com/client/v4"+path,headers={"Authorization":"Bearer "+os.environ["CLOUDFLARE_API_TOKEN"],"Accept":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=25) as resp:
            payload=json.load(resp)
    except urllib.error.HTTPError as e:
        if e.code==404 and allow404:
            return None
        raise RuntimeError("Cloudflare API failed on "+path+" with HTTP "+str(e.code)) from None
    assert payload.get("success"), "Cloudflare API returned failure on "+path
    return payload.get("result")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--phase",choices=["before","after","bootstrap-before"],required=True)
    a=parser.parse_args()
    assert os.environ.get("CLOUDFLARE_ACCOUNT_ID")==ACCOUNT
    db=get(f"/accounts/{ACCOUNT}/d1/database/{D1}")
    assert db["uuid"]==D1 and db["name"]=="bw-manager-invitations-synthetic-staging"
    access=get(f"/accounts/{ACCOUNT}/access/apps/7934753d-0188-4796-9288-bfd99d3be791")
    assert access["domain"]==HOST
    policies=access.get("policies",[])
    assert len(policies)==1 and policies[0].get("decision")=="allow"
    assert policies[0].get("include")==[{"email":{"email":"banabothem@yahoo.com"}}]
    routes=get(f"/zones/{ZONE}/workers/routes") or []
    assert not any(HOST in x.get("pattern","") or x.get("script")==NAME for x in routes),"worker route exists"
    domains=get(f"/accounts/{ACCOUNT}/workers/domains") or []
    assert not any(x.get("hostname")==HOST or x.get("service")==NAME for x in domains),"worker custom domain exists"
    dns=get(f"/zones/{ZONE}/dns_records?name={HOST}") or []
    assert not dns,"manager hostname already has DNS ingress"
    deployed=get(f"/accounts/{ACCOUNT}/workers/scripts/{NAME}/deployments",allow404=True)
    items=deployed.get("deployments",deployed.get("items",[])) if isinstance(deployed,dict) else (deployed or [])
    assert not items, "active Worker deployment exists"
    subdomain=get(f"/accounts/{ACCOUNT}/workers/scripts/{NAME}/subdomain",allow404=True)
    assert subdomain is None or subdomain.get("enabled") is False, "workers.dev subdomain unexpectedly enabled"
    version=get(f"/accounts/{ACCOUNT}/workers/scripts/{NAME}/versions",allow404=True)
    if a.phase=="bootstrap-before":
        assert version is None, "manager Worker already has versions; bootstrap must not overwrite existing worker"
        assert deployed is None, "manager Worker deployment record already exists"
        assert subdomain is None, "manager Worker subdomain record already exists"
        print("FIRST_VERSION_BOOTSTRAP_PRECHECK_PASS; no manager Worker versions, deployments or ingress")
    if a.phase=="before":
        assert version is not None, ("CLOUDFLARE_FIRST_VERSION_BOOTSTRAP_REQUIRED: target Worker is absent. "
                                     "Wrangler versions upload cannot initialize a never-deployed Worker. "
                                     "Do not use wrangler deploy as a workaround; obtain separate review "
                                     "for Cloudflare Workers API create-Worker plus first undeployed-version procedure.")
    if a.phase=="after":
        assert version is not None, "no uploaded Worker versions found"
        print("VERSION_ONLY_UPLOAD_RECORDED; deployment/route/hostname/subdomain checks PASS")
    else:
        print("PRE_UPLOAD_FAIL_CLOSED_INVENTORY_PASS")
    # Intentionally redact bearer secrets, cookies, Access principals and version source.
    print(json.dumps({"phase":a.phase,"database":D1,"worker":NAME,"routes":0,"domains":0,"hostname_dns":0,"active_deployments":0,"workers_dev":False}))

if __name__=="__main__":
    main()
