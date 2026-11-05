#!/usr/bin/env python3
"""Offline SQLite acceptance of the exact staging authentication query.

This executes the reviewed D1 schema and production-source SELECT against an
in-memory SQLite database. Never connects to Cloudflare or writes real D1 data.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "cloudflare/schema/general-ai-staging-auth.sql").read_text()
SOURCE = (ROOT / "cloudflare/src/general-ai-staging-entry.js").read_text()
MATCH = re.search(r"env\.DB\.prepare\(`(SELECT\s+s\.user_id.*?LIMIT\s+1)`\)", SOURCE, re.S)
if not MATCH:
    raise RuntimeError("source_auth_query_unavailable")
AUTH_QUERY = MATCH.group(1)
KEY = b"offline-fixture-secret-only"
RAW_SESSION = b"offline-fixture-cookie-only"
TOKEN_HASH = hmac.new(KEY, RAW_SESSION, hashlib.sha256).hexdigest()


def timestamp(offset_minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=offset_minutes)).strftime("%Y-%m-%d %H:%M:%S")


class StagingAuthSqliteAcceptance(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.db.execute(
            "INSERT INTO users (id,email,session_generation) VALUES (?,?,?)",
            ("u-1", "synthetic@example.invalid", 0),
        )
        self.db.execute(
            "INSERT INTO memberships (user_id,tenant_id,role,status) VALUES (?,?,?,?)",
            ("u-1", "tenant-a", "owner", "active"),
        )
        self.db.execute(
            "INSERT INTO sessions (token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,?,?)",
            (TOKEN_HASH, "u-1", "tenant-a", "offline-csrf", 0, timestamp(30)),
        )

    def tearDown(self):
        self.db.close()

    def authenticate(self, token_hash=TOKEN_HASH):
        return self.db.execute(AUTH_QUERY, (token_hash,)).fetchone()

    def test_valid_active_session_returns_tenant_bound_identity(self):
        result = self.authenticate()
        self.assertIsNotNone(result)
        self.assertEqual(result["tenant_id"], "tenant-a")
        self.assertEqual(result["user_id"], "u-1")
        self.assertEqual(result["csrf_token"], "offline-csrf")
        self.assertEqual(result["role"], "owner")

    def test_unknown_cookie_hash_denied(self):
        self.assertIsNone(self.authenticate("0" * 64))

    def test_inactive_membership_denied(self):
        self.db.execute("UPDATE memberships SET status='inactive'")
        self.assertIsNone(self.authenticate())

    def test_revoked_generation_denied(self):
        self.db.execute("UPDATE users SET session_generation=1")
        self.assertIsNone(self.authenticate())

    def test_expired_session_denied(self):
        self.db.execute("UPDATE sessions SET expires_at=?", (timestamp(-5),))
        self.assertIsNone(self.authenticate())

    def test_missing_tenant_membership_cannot_create_session(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO sessions (token_hash,user_id,tenant_id,csrf_token,session_generation,expires_at) VALUES (?,?,?,?,?,?)",
                ("other", "u-1", "tenant-b", "csrf", 0, timestamp(30)),
            )

    def test_membership_for_second_tenant_does_not_authorize_first_tenant_after_revocation(self):
        self.db.execute(
            "INSERT INTO memberships (user_id,tenant_id,role,status) VALUES (?,?,?,?)",
            ("u-1", "tenant-b", "manager", "active"),
        )
        self.db.execute("UPDATE memberships SET status='inactive' WHERE tenant_id='tenant-a'")
        self.assertIsNone(self.authenticate())

    def test_foreign_key_integrity(self):
        issues = self.db.execute("PRAGMA foreign_key_check").fetchall()
        self.assertEqual(issues, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
