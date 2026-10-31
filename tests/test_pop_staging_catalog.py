import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("pop_catalog", Path(__file__).resolve().parents[1] / "scripts" / "compare-pop-staging-catalog.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def catalog(names):
    return {("table", name): name for name in names}


class CatalogTests(unittest.TestCase):
    def test_identical_pre070_catalog_never_proves_full_compatibility(self):
        c = catalog({"tenants", "payment_orders", "manual_payment_submissions"})
        result = module.compare(c, c)
        self.assertTrue(result["pop_pre070_catalog_ready"])
        self.assertFalse(result["production_compatibility_verified"])
        self.assertFalse(result["backup_restore_verified"])

    def test_empty_staging_fails_closed(self):
        p = catalog({"tenants", "payment_orders", "manual_payment_submissions"})
        self.assertFalse(module.compare(p, {})["pop_pre070_catalog_ready"])

    def test_pop_table_already_present_in_production_fails_closed(self):
        p = catalog({"tenants", "payment_orders", "manual_payment_submissions", "payment_pop_documents"})
        self.assertFalse(module.compare(p, p)["pop_pre070_catalog_ready"])

    def test_missing_production_prerequisite_fails_closed(self):
        c = catalog({"tenants", "payment_orders"})
        self.assertFalse(module.compare(c, c)["pop_pre070_catalog_ready"])

    def test_catalog_owner_drift_detected(self):
        p = catalog({"tenants", "payment_orders", "manual_payment_submissions"})
        s = dict(p)
        s[("table", "tenants")] = "other"
        self.assertFalse(module.compare(p, s)["pop_pre070_catalog_ready"])


if __name__ == "__main__":
    unittest.main()
