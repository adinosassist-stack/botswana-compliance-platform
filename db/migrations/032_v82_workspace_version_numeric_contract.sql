-- V82 final hardening: PostgreSQL bigint values are returned by node-postgres as strings.
-- The browser workspace API contract requires a numeric optimistic-concurrency version.
-- INTEGER provides more than two billion workspace revisions while preserving JS numeric semantics.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='app_state'
      AND column_name='version'
      AND data_type='bigint'
  ) THEN
    IF EXISTS (SELECT 1 FROM app_state WHERE version > 2147483647 OR version < 1) THEN
      RAISE EXCEPTION 'app_state.version cannot be safely converted to integer';
    END IF;
    ALTER TABLE app_state ALTER COLUMN version TYPE integer USING version::integer;
  END IF;
END $$;
