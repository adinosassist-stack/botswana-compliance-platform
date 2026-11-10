-- Private Agent approval-history read throttling; deploy only after approval.
-- Fixed-window counters are shared across application instances.
create table if not exists agent_history_rate_limits (
 tenant_id text not null,
 actor_id text not null,
 bucket_id bigint not null,
 request_count integer not null check (request_count >= 1),
 primary key (tenant_id,actor_id,bucket_id)
);
-- Operational maintenance must periodically delete expired buckets.
-- No automated retention or production deployment is enabled by this file.
