"""Synthetic-only negative postflight security tests; never connects to Cloudflare."""
import importlib.util
from pathlib import Path
import unittest

SRC=Path(__file__).resolve().parents[1]/"scripts/manager-bootstrap-first-version-postflight.py"
spec=importlib.util.spec_from_file_location("manager_postflight",SRC)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
WID="worker_12345678";VID="version_12345678"

def fixture():
    a=f"/accounts/{mod.ACCOUNT}"; z=f"/zones/{mod.ZONE}"
    return {
        a+f"/workers/workers/{WID}":{"id":WID,"name":mod.NAME,"deployed_on":None,"subdomain":{"enabled":False,"previews_enabled":False}},
        a+f"/workers/workers/{WID}/versions":[{"id":VID}],
        a+f"/workers/scripts/{mod.NAME}/deployments":{"deployments":[]},
        a+f"/workers/scripts/{mod.NAME}/subdomain":{"enabled":False},
        z+"/workers/routes":[],
        a+"/workers/domains":[],
        z+f"/dns_records?name={mod.HOST}":[],
        a+f"/d1/database/{mod.DB}":{"uuid":mod.DB,"name":"bw-manager-invitations-synthetic-staging"},
        a+f"/access/apps/{mod.ACCESS_APP}":{"domain":mod.HOST,"policies":[{"decision":"allow","include":[{"email":{"email":"banabothem@yahoo.com"}}]}]},
    }
class FirstVersionPostflightTests(unittest.TestCase):
    def verify(self,data,expected_error=None):
        def get(path):
            if path not in data:raise mod.PostflightError("unmocked read request")
            return data[path]
        if expected_error:
            with self.assertRaisesRegex(mod.PostflightError,expected_error):
                mod.validate(get,WID,VID)
        else:
            self.assertEqual(mod.validate(get,WID,VID)["result"],"PASS_UNDEPLOYED_NO_INGRESS")

    def test_exact_inert_version_passes(self):
        self.verify(fixture())

    def test_worker_was_deployed_denied(self):
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/workers/{WID}"]["deployed_on"]="now"
        self.verify(data,"deployed")

    def test_workers_dev_denied(self):
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/scripts/{mod.NAME}/subdomain"]={"enabled":True}
        self.verify(data,"workers.dev")

    def test_preview_denied(self):
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/workers/{WID}"]["subdomain"]["previews_enabled"]=True
        self.verify(data,"preview")

    def test_wrong_worker_and_version_denied(self):
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/workers/{WID}"]["name"]="production"
        self.verify(data,"identity")
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/workers/{WID}/versions"]=[{"id":"different"}]
        self.verify(data,"first-version")

    def test_routes_domains_dns_deployments_denied(self):
        for target,value in [
            (f"/zones/{mod.ZONE}/workers/routes",[{"script":mod.NAME,"pattern":"*"}]),
            (f"/accounts/{mod.ACCOUNT}/workers/domains",[{"service":mod.NAME}]),
            (f"/zones/{mod.ZONE}/dns_records?name={mod.HOST}",[{"name":mod.HOST}]),
            (f"/accounts/{mod.ACCOUNT}/workers/scripts/{mod.NAME}/deployments",{"deployments":[{"id":"active"}]})
        ]:
            with self.subTest(target=target):
                data=fixture();data[target]=value;self.verify(data,"exists|deployment")

    def test_unknown_deployment_response_denied(self):
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/scripts/{mod.NAME}/deployments"]={"count":0}
        self.verify(data,"shape unknown")

    def test_access_or_d1_changed_denied(self):
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/d1/database/{mod.DB}"]["name"]="production"
        self.verify(data,"D1")
        data=fixture();data[f"/accounts/{mod.ACCOUNT}/access/apps/{mod.ACCESS_APP}"]["policies"][0]["include"]=[{"everyone":{}}]
        self.verify(data,"tester policy")

    def test_missing_versions_or_extra_versions_denied(self):
        for v in ([],[{"id":VID},{"id":"another"}]):
            with self.subTest(versions=v):
                data=fixture();data[f"/accounts/{mod.ACCOUNT}/workers/workers/{WID}/versions"]=v
                self.verify(data,"first-version")

    def test_unapproved_worker_id_denied(self):
        with self.assertRaisesRegex(mod.PostflightError,"worker ID invalid"):
            mod.validate(lambda _:None,"../production",VID)

if __name__=="__main__":
    unittest.main()
