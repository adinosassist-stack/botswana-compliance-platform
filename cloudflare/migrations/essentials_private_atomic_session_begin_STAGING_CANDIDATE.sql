-- SOURCE ONLY · NOT EXECUTED. Same independently approved ISOLATED private
-- staging D1 after frozen-quote, one-time-challenge, actor-session and
-- encrypted-session-binding candidate schemas. No production bindings or writes.
--
-- Forces the *third* statement of db.batch() to raise ABORT unless the first
-- two INSERTs truly created the exact same active quote/session/challenge.
-- A zero-row INSERT SELECT is not an error by itself; this final assertion
-- converts it to an SQL error, rolling back the entire D1 batch transaction.
CREATE TABLE essentials_private_atomic_session_begins(
 challenge_id TEXT PRIMARY KEY NOT NULL,
 session_key_sha256 TEXT NOT NULL,
 tenant_id TEXT NOT NULL,
 actor_user_id TEXT NOT NULL,
 quotation_id TEXT NOT NULL,
 customer_id TEXT NOT NULL,
 nonce_sha256 TEXT NOT NULL
  CHECK(length(nonce_sha256)=64 AND nonce_sha256 NOT GLOB '*[^a-f0-9]*'),
 issued_at_ms INTEGER NOT NULL CHECK(issued_at_ms>0),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>issued_at_ms),
 FOREIGN KEY(challenge_id)
  REFERENCES essentials_private_one_time_challenges(challenge_id),
 FOREIGN KEY(session_key_sha256)
  REFERENCES essentials_private_consent_actor_sessions(session_key_sha256)
);

-- Host must supply fresh 96-bit IVs for each AES-GCM-256 key. Refuse reuse
-- within this isolated D1 (including bindings from the preceding candidate).
CREATE UNIQUE INDEX essentials_private_session_nonce_iv_unique
 ON essentials_private_session_quotation_challenges(nonce_iv);

CREATE TRIGGER essentials_private_atomic_begin_assert BEFORE INSERT
 ON essentials_private_atomic_session_begins
 BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM essentials_private_one_time_challenges AS ch
  JOIN essentials_private_session_quotation_challenges AS b
   ON b.challenge_id=ch.challenge_id
  JOIN essentials_private_consent_actor_sessions AS s
   ON s.session_key_sha256=b.session_key_sha256
  JOIN essentials_private_frozen_quotes AS q
   ON q.tenant_id=ch.tenant_id AND q.quotation_id=ch.quotation_id
  WHERE ch.challenge_id=NEW.challenge_id
    AND b.session_key_sha256=NEW.session_key_sha256
    AND ch.tenant_id=NEW.tenant_id
    AND ch.actor_user_id=NEW.actor_user_id
    AND ch.quotation_id=NEW.quotation_id
    AND ch.customer_id=NEW.customer_id
    AND ch.nonce_sha256=NEW.nonce_sha256
    AND ch.issued_at_ms=NEW.issued_at_ms
    AND b.tenant_id=NEW.tenant_id
    AND b.actor_user_id=NEW.actor_user_id
    AND b.quotation_id=NEW.quotation_id
    AND b.customer_id=NEW.customer_id
    AND b.nonce_sha256=NEW.nonce_sha256
    AND b.issued_at_ms=NEW.issued_at_ms
    AND b.expires_at_ms=NEW.expires_at_ms
    AND b.expires_at_ms=MIN(s.expires_at_ms,ch.expires_at_ms)
    AND s.tenant_id=NEW.tenant_id AND s.actor_user_id=NEW.actor_user_id
    AND s.state='active' AND ch.state='pending' AND b.state='pending'
    AND q.state='accepted' AND q.customer_id=NEW.customer_id
    AND q.quotation_reference=ch.quotation_reference
    AND q.acceptance_version=ch.acceptance_version
    AND q.total_minor=ch.total_minor AND q.quotation_sha256=ch.quotation_sha256
    AND NOT EXISTS(
     SELECT 1 FROM essentials_private_verified_consents AS c
     WHERE c.tenant_id=NEW.tenant_id AND c.quotation_id=NEW.quotation_id
    )
    AND s.issued_at_ms <=
       (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
    AND ch.issued_at_ms <=
       (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
    AND s.expires_at_ms >
       (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
    AND s.grant_expires_at_ms >
       (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
    AND ch.expires_at_ms >
       (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
    AND b.expires_at_ms >
       (CAST(strftime('%s','now') AS INTEGER)*1000 + CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 ) THEN RAISE(ABORT,'atomic_challenge_binding_required') END;
 END;

CREATE TRIGGER essentials_private_atomic_begin_no_update BEFORE UPDATE
 ON essentials_private_atomic_session_begins
 BEGIN SELECT RAISE(ABORT,'atomic_begin_immutable'); END;
CREATE TRIGGER essentials_private_atomic_begin_no_delete BEFORE DELETE
 ON essentials_private_atomic_session_begins
 BEGIN SELECT RAISE(ABORT,'atomic_begin_delete_denied'); END;
