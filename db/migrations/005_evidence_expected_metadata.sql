alter table evidence add column if not exists expected_size bigint;
alter table evidence add column if not exists content_type text;
