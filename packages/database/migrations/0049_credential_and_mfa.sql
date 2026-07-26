SET ROLE chai_migration_owner;

-- Persistent local credentials and TOTP factors. These are PLATFORM tables
-- (no tenant_id): a login identity is resolved before any tenant context
-- exists. They follow the platform-table pattern (RLS ENABLE + FORCE, minimal
-- GRANT), matching chai.user_account / chai.platform_role_assignment.

CREATE TABLE chai.user_credential (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE
    CONSTRAINT user_credential_user_fk REFERENCES chai.user_account(id),
  -- email is required to resolve a credential by email at login; chai.user_account
  -- carries no email, so the login handle lives here. Stored normalized
  -- (trimmed + lowercased) by the application so the UNIQUE index is the
  -- case-insensitive login key.
  email text NOT NULL UNIQUE
    CONSTRAINT user_credential_email_nonempty CHECK (length(email) > 0),
  -- Which tenant a client login lands in. NULL for platform-owner credentials
  -- (their role comes from chai.platform_role_assignment). It is only a pointer
  -- so membership can be read under the correct tenant RLS at login; role and
  -- status stay authoritative in chai.membership and are read live, never copied.
  home_tenant_id uuid
    CONSTRAINT user_credential_tenant_fk REFERENCES chai.tenant(id),
  -- Self-describing scrypt hash: 'scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>'. The
  -- cost parameters and per-user salt are recorded inside the string, so a
  -- future parameter bump verifies old rows with their own recorded cost.
  password_hash text NOT NULL
    CONSTRAINT user_credential_hash_nonempty CHECK (length(password_hash) > 0),
  failed_attempt_count integer NOT NULL DEFAULT 0
    CONSTRAINT user_credential_failed_nonneg CHECK (failed_attempt_count >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chai.user_mfa_factor (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL
    CONSTRAINT user_mfa_factor_user_fk REFERENCES chai.user_account(id),
  kind text NOT NULL
    CONSTRAINT user_mfa_factor_kind_valid CHECK (kind IN ('TOTP')),
  -- ponytail: base32 TOTP secret stored as-is, protected by RLS + GRANT (only
  -- chai_app_runtime can read it) and never logged. Encryption at rest is the
  -- upgrade path; it needs a KMS/key-management dependency that is out of scope
  -- for this change.
  secret text NOT NULL
    CONSTRAINT user_mfa_factor_secret_nonempty CHECK (length(secret) > 0),
  -- NULL until the enrolling user proves possession with a valid code.
  confirmed_at timestamptz,
  -- Highest TOTP step already accepted for this factor. A code whose step is
  -- <= this value is a replay and MUST be rejected.
  last_used_step bigint NOT NULL DEFAULT 0
    CONSTRAINT user_mfa_factor_step_nonneg CHECK (last_used_step >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_mfa_factor_one_per_kind UNIQUE (user_id, kind)
);

CREATE INDEX user_mfa_factor_user_idx ON chai.user_mfa_factor(user_id);

-- RLS: default-deny for every role, plus FORCE so even the table owner is
-- subject to policy. The authentication service must resolve a credential by
-- email and verify/update MFA state BEFORE a principal id is established, so
-- isolation here is by ROLE (only chai_app_runtime may touch the rows) and by
-- the one-way scrypt hash / RLS-protected secret — not by a per-row principal
-- match. There is no tenant_id on these tables, so no cross-tenant read is
-- possible. Upgrade path if the blanket runtime read is ever unacceptable: move
-- the login lookup behind a SECURITY DEFINER function.
ALTER TABLE chai.user_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.user_credential FORCE ROW LEVEL SECURITY;
CREATE POLICY user_credential_app_runtime ON chai.user_credential
  FOR ALL
  TO chai_app_runtime
  USING (true)
  WITH CHECK (true);

ALTER TABLE chai.user_mfa_factor ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.user_mfa_factor FORCE ROW LEVEL SECURITY;
CREATE POLICY user_mfa_factor_app_runtime ON chai.user_mfa_factor
  FOR ALL
  TO chai_app_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON chai.user_credential FROM PUBLIC;
REVOKE ALL ON chai.user_mfa_factor FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.user_credential TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.user_mfa_factor TO chai_app_runtime;

RESET ROLE;
