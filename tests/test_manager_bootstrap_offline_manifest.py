"""No-network unit tests for the manager first-version manifest preflight."""
import importlib.util
import pathlib
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts/manager-bootstrap-offline-manifest.py"
SPEC = importlib.util.spec_from_file_location("manager_bootstrap_manifest", SCRIPT)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

class ManagerManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        (self.root / "404.html").write_bytes(b"not found")

    def test_expected_paths_hash_and_size(self):
        (self.root / "styles.css").write_bytes(b"body{}")
        manifest = module.build_manifest(self.root, expected_count=2)
        self.assertEqual(set(manifest), {"/404.html", "/styles.css"})
        self.assertEqual(manifest["/styles.css"]["size"], 6)
        self.assertEqual(manifest["/styles.css"]["hash"], module.hash_file(self.root / "styles.css")[:32])
        self.assertEqual(len(manifest["/styles.css"]["hash"]), 32)

    def test_missing_assets_rejected(self):
        with self.assertRaisesRegex(ValueError, "expected 278 assets"):
            module.build_manifest(self.root)

    def test_case_collision_rejected(self):
        (self.root / "FAQ.html").write_bytes(b"a")
        (self.root / "faq.html").write_bytes(b"b")
        with self.assertRaisesRegex(ValueError, "collision"):
            module.build_manifest(self.root, expected_count=3)

    def test_unexpected_symlink_rejected(self):
        (self.root / "linked.html").symlink_to(self.root / "404.html")
        with self.assertRaisesRegex(ValueError, "symlink"):
            module.build_manifest(self.root, expected_count=2)

    def test_missing_404_rejected(self):
        (self.root / "404.html").unlink()
        (self.root / "index.html").write_bytes(b"ok")
        with self.assertRaisesRegex(ValueError, "/404.html"):
            module.build_manifest(self.root, expected_count=1)

    def test_unapproved_config_rejected_before_parse(self):
        config = self.root / "wrangler.toml"
        config.write_text('name = "production"')
        with self.assertRaisesRegex(ValueError, "reviewed Git blob"):
            module.validate_config(config)

    def test_unapproved_worker_rejected(self):
        staging = self.root / "prepared"
        script = staging / "cloudflare" / "src" / "worker.js"
        script.parent.mkdir(parents=True)
        script.write_bytes(b"export default {}")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            module.qualify(staging, self.root / "out.json")
        self.assertFalse((self.root / "out.json").exists())

if __name__ == "__main__":
    unittest.main()
