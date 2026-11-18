-- Synthetic isolated Essentials D1 qualification only. Never run against production.
-- Minimal foreign-key dependencies; NOT a replica of production Finance Core.
CREATE TABLE tenants (id TEXT PRIMARY KEY);
CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE finance_customers (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','inactive')),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
INSERT INTO tenants(id) VALUES ('synthetic-tenant-a'),('synthetic-tenant-b');
INSERT INTO users(id) VALUES ('synthetic-owner-a');
INSERT INTO finance_customers(id,tenant_id,status) VALUES
 ('synthetic-customer-a','synthetic-tenant-a','active'),
 ('synthetic-customer-b','synthetic-tenant-b','active'),
 ('synthetic-customer-inactive','synthetic-tenant-a','inactive');
