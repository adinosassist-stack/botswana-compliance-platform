-- Guest-house management D1 schema PROPOSAL ONLY.
-- Never include in automatic production migrations before independent review.
-- Authenticated handlers must resolve property ownership server-side, never from a request body.
-- Reservation overlap MUST be checked inside a serialized transaction / single-writer
-- command; SQLite CHECK constraints alone cannot prevent overlapping intervals.
CREATE TABLE IF NOT EXISTS guest_house_properties (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS guest_house_rooms (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 room_code TEXT NOT NULL CHECK(length(room_code) BETWEEN 1 AND 50),
 status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','out_of_service')),
 nightly_rate_minor INTEGER NOT NULL CHECK(nightly_rate_minor BETWEEN 0 AND 999999999999),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,property_id,id),
 UNIQUE(tenant_id,property_id,room_code),
 FOREIGN KEY(tenant_id,property_id) REFERENCES guest_house_properties(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS guest_house_reservations (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 check_in TEXT NOT NULL CHECK(length(check_in)=10),
 check_out TEXT NOT NULL CHECK(length(check_out)=10 AND check_out>check_in),
 status TEXT NOT NULL CHECK(status IN ('held','confirmed','checked_in','checked_out','cancelled')),
 nightly_rate_minor INTEGER NOT NULL CHECK(nightly_rate_minor BETWEEN 0 AND 999999999999),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES guest_house_rooms(tenant_id,property_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS guest_house_reservation_overlap
 ON guest_house_reservations(tenant_id,property_id,room_id,check_in,check_out,status);
-- Database-level overlap defence against any direct SQL path that bypasses
-- the guarded reservation command. ACTIVE statuses only; checkout is exclusive.
-- The proposal is NOT an authorized production migration.
CREATE TRIGGER IF NOT EXISTS guest_house_reject_active_overlap_insert
BEFORE INSERT ON guest_house_reservations
WHEN NEW.status IN ('held','confirmed','checked_in')
BEGIN
 SELECT RAISE(ABORT,'reservation_overlap') WHERE EXISTS (
  SELECT 1 FROM guest_house_reservations existing
   WHERE existing.tenant_id=NEW.tenant_id AND existing.property_id=NEW.property_id
     AND existing.room_id=NEW.room_id
     AND existing.status IN ('held','confirmed','checked_in')
     AND existing.check_in < NEW.check_out AND NEW.check_in < existing.check_out
 );
END;
CREATE TRIGGER IF NOT EXISTS guest_house_reject_active_overlap_update
BEFORE UPDATE OF tenant_id,property_id,room_id,check_in,check_out,status
ON guest_house_reservations
WHEN NEW.status IN ('held','confirmed','checked_in')
BEGIN
 SELECT RAISE(ABORT,'reservation_overlap') WHERE EXISTS (
  SELECT 1 FROM guest_house_reservations existing
   WHERE existing.id<>OLD.id
     AND existing.tenant_id=NEW.tenant_id AND existing.property_id=NEW.property_id
     AND existing.room_id=NEW.room_id
     AND existing.status IN ('held','confirmed','checked_in')
     AND existing.check_in < NEW.check_out AND NEW.check_in < existing.check_out
 );
END;
CREATE TABLE IF NOT EXISTS guest_house_housekeeping (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 room_id TEXT NOT NULL,
 task_type TEXT NOT NULL CHECK(task_type IN ('cleaning','inspection','linen','maintenance')),
 status TEXT NOT NULL CHECK(status IN ('pending','in_progress','completed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(tenant_id,property_id,room_id) REFERENCES guest_house_rooms(tenant_id,property_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS guest_house_housekeeping_board
 ON guest_house_housekeeping(tenant_id,property_id,status,room_id);

-- Proposed append-only reservation audit. This schema is inert: no migration
-- or HTTP route installs it. Audit records are created inside the *same* SQLite
-- statement as reservation changes; a rejected audit write aborts the booking.
-- This is an append-only operational ledger, NOT a cryptographic audit seal.
CREATE TABLE IF NOT EXISTS guest_house_reservation_events (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 property_id TEXT NOT NULL,
 reservation_id TEXT NOT NULL,
 event_type TEXT NOT NULL CHECK(event_type IN ('created','amended','cancelled')),
 previous_status TEXT,
 new_status TEXT NOT NULL,
 previous_room_id TEXT,
 new_room_id TEXT NOT NULL,
 previous_check_in TEXT,
 new_check_in TEXT NOT NULL,
 previous_check_out TEXT,
 new_check_out TEXT NOT NULL,
 nightly_rate_minor INTEGER NOT NULL CHECK(nightly_rate_minor BETWEEN 0 AND 999999999999),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(tenant_id,property_id,reservation_id)
  REFERENCES guest_house_reservations(tenant_id,property_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS guest_house_reservation_event_scope
 ON guest_house_reservation_events(tenant_id,property_id,reservation_id,created_at,id);
CREATE TRIGGER IF NOT EXISTS guest_house_reservation_events_no_update
BEFORE UPDATE ON guest_house_reservation_events
BEGIN
 SELECT RAISE(ABORT,'reservation_audit_immutable');
END;
CREATE TRIGGER IF NOT EXISTS guest_house_reservation_events_no_delete
BEFORE DELETE ON guest_house_reservation_events
BEGIN
 SELECT RAISE(ABORT,'reservation_audit_immutable');
END;
-- Prevent a booking from moving tenants or silently changing its confirmed
-- nightly-rate snapshot. Future rate corrections need a separately audited API.
CREATE TRIGGER IF NOT EXISTS guest_house_reservation_identity_immutable
BEFORE UPDATE OF id,tenant_id,property_id,nightly_rate_minor
ON guest_house_reservations
WHEN NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id
 OR NEW.property_id<>OLD.property_id
 OR NEW.nightly_rate_minor<>OLD.nightly_rate_minor
BEGIN
 SELECT RAISE(ABORT,'reservation_identity_immutable');
END;
CREATE TRIGGER IF NOT EXISTS guest_house_reservation_no_delete
BEFORE DELETE ON guest_house_reservations
BEGIN
 SELECT RAISE(ABORT,'reservation_delete_requires_review');
END;
CREATE TRIGGER IF NOT EXISTS guest_house_reservation_audit_insert
AFTER INSERT ON guest_house_reservations
BEGIN
 INSERT INTO guest_house_reservation_events
 (id,tenant_id,property_id,reservation_id,event_type,previous_status,new_status,
  previous_room_id,new_room_id,previous_check_in,new_check_in,
  previous_check_out,new_check_out,nightly_rate_minor)
 VALUES
 (lower(hex(randomblob(16))),NEW.tenant_id,NEW.property_id,NEW.id,'created',
  NULL,NEW.status,NULL,NEW.room_id,NULL,NEW.check_in,NULL,NEW.check_out,NEW.nightly_rate_minor);
END;
CREATE TRIGGER IF NOT EXISTS guest_house_reservation_audit_update
AFTER UPDATE OF room_id,check_in,check_out,status ON guest_house_reservations
WHEN OLD.room_id<>NEW.room_id OR OLD.check_in<>NEW.check_in
 OR OLD.check_out<>NEW.check_out OR OLD.status<>NEW.status
BEGIN
 INSERT INTO guest_house_reservation_events
 (id,tenant_id,property_id,reservation_id,event_type,previous_status,new_status,
  previous_room_id,new_room_id,previous_check_in,new_check_in,
  previous_check_out,new_check_out,nightly_rate_minor)
 VALUES
 (lower(hex(randomblob(16))),NEW.tenant_id,NEW.property_id,NEW.id,
  CASE WHEN NEW.status='cancelled' THEN 'cancelled' ELSE 'amended' END,
  OLD.status,NEW.status,OLD.room_id,NEW.room_id,
  OLD.check_in,NEW.check_in,OLD.check_out,NEW.check_out,NEW.nightly_rate_minor);
END;
