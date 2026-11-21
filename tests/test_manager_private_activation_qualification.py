"""Offline negative contracts for Manager private activation (NO NETWORK)."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts/manager-private-activation-qualification.py"
SPEC = importlib.util.spec_from_file_location("manager_qualification", MODULE)
q = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(q)
SNAPSHOT = json.loads((ROOT / "tests/fixtures/manager-private-activation-inventory.json").read_text())


class ActivationQualification(unittest.TestCase):
    def test_review_snapshot_does_not_authorize_activation(self):
        receipt = q.validate_inventory(copy.deepcopy(SNAPSHOT), q.CANDIDATE_SOURCE_SHA)
        self.assertEqual(receipt["status"], "READ_ONLY_SNAPSHOT_CONSISTENT_NOT_AUTHORIZED")
        self.assertFalse(receipt["deployment_authorized"])
        self.assertFalse(receipt["ingress_authorized"])

    def test_main_change_denied(self):
        with self.assertRaises(q.QualificationError):
            q.validate_inventory(copy.deepcopy(SNAPSHOT), "0" * 40)

    def test_each_boundary_fails_closed(self):
        mutations = {
            "account": lambda x: x.update(account_id="ddd23cab31928a4bb3d4998df9b26d1d"),
            "zone": lambda x: x["zone"].update(id="other"),
            "unlisted_zone": lambda x: x["zone"].update(status="pending"),
            "worker": lambda x: x["worker"].update(id="wrong"),
            "candidate": lambda x: x["candidate"].update(id="another"),
            "extra_version": lambda x: x["worker"]["versions"].append({"id":"unapproved","deployed_on":None}),
            "deployed": lambda x: x["worker"].update(deployments=[{"id":"unexpected"}]),
            "candidate_deployed": lambda x: x["candidate"].update(deployed_on="now"),
            "workers_dev": lambda x: x["worker"].update(workers_dev=True),
            "preview": lambda x: x["worker"].update(preview_urls=True),
            "domain": lambda x: x["worker"].update(custom_domains=[{"hostname":"x"}]),
            "dns": lambda x: x["ingress"].update(dns=[{"name":q.HOST}]),
            "routes": lambda x: x["ingress"].update(routes=[{"pattern":"*"}]),
            "wrong_app": lambda x: x["access"]["app"].update(domain="thebedesk.com"),
            "idp": lambda x: x["access"]["app"].update(allowed_idps=["wrong"]),
            "broad_policy": lambda x: x["access"]["policies"][0].update(include=[{"everyone":{}}]),
            "default_deny": lambda x: x["access"].update(deny_unmatched_requests=False),
            "cross_account_db": lambda x: x["d1"].update(uuid="wrong"),
            "schema_change": lambda x: x["d1"].update(num_tables=14),
            "binding_db": lambda x: next(b for b in x["candidate"]["bindings"] if b["name"]=="DB").update(database_id="production"),
            "missing_secret": lambda x: x["candidate"]["bindings"].remove(next(b for b in x["candidate"]["bindings"] if b["name"]=="SESSION_SECRET")),
            "secret_leaked": lambda x: next(b for b in x["candidate"]["bindings"] if b["name"]=="SESSION_SECRET").update(text="do-not-log-secrets"),
            "rogue_binding": lambda x: x["candidate"]["bindings"].append({"name":"PRODUCTION_DB","type":"d1","database_id":"prod"}),
            "payments": lambda x: next(b for b in x["candidate"]["bindings"] if b["name"]=="PAYMENT_PROVIDER").update(text="fnb"),
            "unsafe_origin": lambda x: next(b for b in x["candidate"]["bindings"] if b["name"]=="PUBLIC_ORIGIN").update(text="https://thebedesk.com"),
            "provisioning": lambda x: next(b for b in x["candidate"]["bindings"] if b["name"]=="MANAGER_ACCESS_PROVISIONING_ENABLED").update(text="true"),
        }
        for label, mutator in mutations.items():
            with self.subTest(label=label):
                bad = copy.deepcopy(SNAPSHOT)
                mutator(bad)
                with self.assertRaises(q.QualificationError):
                    q.validate_inventory(bad, q.CANDIDATE_SOURCE_SHA)

    def approval(self, principal, comment_id, phase="deploy_inert"):
        tokens = [q.PHASE_MARKERS[phase],q.CANDIDATE_SOURCE_SHA,
                  q.CANDIDATE,q.WORKER_SHA256,q.MANIFEST_SHA256,
                  q.ACCOUNT,q.D1,q.HOST,q.NO_PRODUCTION]
        return {"id":comment_id,"user":{"login":principal},"body":"\n".join(tokens)}

    def test_owner_and_independent_review_required_per_phase(self):
        for phase in ("deploy_inert", "ingress_test"):
            with self.subTest(phase=phase):
                owner = self.approval("adinosassist-stack", 1, phase)
                reviewer = self.approval("thusico", 2, phase)
                self.assertTrue(q.verify_separate_approvals(owner, reviewer, phase, q.CANDIDATE_SOURCE_SHA))
                reviewer["user"]["login"] = "adinosassist-stack"
                with self.assertRaises(q.QualificationError):
                    q.verify_separate_approvals(owner, reviewer, phase, q.CANDIDATE_SOURCE_SHA)

    def test_reused_upload_approvals_rejected(self):
        owner = self.approval("adinosassist-stack", 1)
        reviewer = self.approval("thusico", 2)
        owner["body"] = owner["body"].replace(q.PHASE_MARKERS["deploy_inert"], "APPROVE_MANAGER_PRIVATE_CANDIDATE_VERSION_ONLY")
        with self.assertRaises(q.QualificationError):
            q.verify_separate_approvals(owner, reviewer, "deploy_inert", q.CANDIDATE_SOURCE_SHA)
        with self.assertRaises(q.QualificationError):
            q.verify_separate_approvals(reviewer, reviewer, "deploy_inert", q.CANDIDATE_SOURCE_SHA)


if __name__ == "__main__":
    unittest.main()
