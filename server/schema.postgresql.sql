-- «Мой диабет» production sync schema
-- PostgreSQL 15+
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(account_id, patient_id)
);

CREATE TABLE IF NOT EXISTS installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  platform text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS patient_records (
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  payload jsonb,
  deleted boolean NOT NULL DEFAULT false,
  immutable boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  PRIMARY KEY(patient_id, record_type, record_id)
);

CREATE TABLE IF NOT EXISTS sync_changes (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id text NOT NULL,
  operation text NOT NULL CHECK(operation IN ('upsert','delete')),
  version bigint NOT NULL,
  payload jsonb,
  deleted boolean NOT NULL DEFAULT false,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  installation_id uuid REFERENCES installations(id) ON DELETE SET NULL,
  client_event_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_sync_changes_client_event
  ON sync_changes(patient_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_sync_changes_patient_sequence
  ON sync_changes(patient_id, sequence);
CREATE INDEX IF NOT EXISTS ix_patient_records_patient_type
  ON patient_records(patient_id, record_type);

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email text,
  display_name text,
  role text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

-- Medical audit records are append-only by application policy. PostgreSQL row
-- updates/deletes should be denied for these record types in the repository layer.

-- v54 security / audit additions
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES installations(id) ON DELETE SET NULL,
  access_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES installations(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_account ON refresh_tokens(account_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_patient_created ON audit_log(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_actor_created ON audit_log(actor_account_id, created_at DESC);
ALTER TABLE sync_changes ADD COLUMN IF NOT EXISTS base_version bigint;
ALTER TABLE patient_records ADD COLUMN IF NOT EXISTS last_client_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_patient_record_client_event
  ON patient_records(patient_id, last_client_event_id)
  WHERE last_client_event_id IS NOT NULL;
