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
