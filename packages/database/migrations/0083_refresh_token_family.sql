SET ROLE chai_migration_owner;

-- Refresh token families: durable, multi-replica-safe backing store for
-- rotation + reuse detection (REQ-10-013). Replaces the in-memory
-- RefreshTokenStore, which lost all rotation/reuse history on restart and
-- could not be shared across API replicas.
--
-- Platform table (no tenant_id): a login identity is resolved before any
-- tenant context exists, matching chai.user_credential (migration 0049).
--
-- A "family" is the chain of tokens produced by successive rotations of one
-- original login. Reusing an already-rotated (or already-revoked) token is
-- the signal that the token was stolen, so the fix revokes every token in
-- that family, not just the one that was replayed.

CREATE TABLE chai.refresh_token_family (
  -- The family id is the jti of the token that started the chain (the one
  -- issued at login). Every subsequent rotation keeps the same family_id.
  -- jti is a base64url-encoded random string (packages/auth/src/tokens.ts
  -- generateJti), not a uuid, hence text.
  family_id text PRIMARY KEY,
  principal_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chai.refresh_token (
  -- The token's own jti (a base64url-encoded 128-bit random value minted by
  -- packages/auth/src/tokens.ts generateJti when the token was issued). jti
  -- is part of the JWT payload, not a secret by itself — the token's HMAC
  -- signature is what makes it bearer-equivalent to a password, and that
  -- signature is verified by verifyRefreshToken() before this table is ever
  -- consulted. So there is nothing to hash here: jti is looked up as-is.
  jti text PRIMARY KEY,
  family_id text NOT NULL
    CONSTRAINT refresh_token_family_fk REFERENCES chai.refresh_token_family(family_id),
  principal_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_token_family_idx ON chai.refresh_token(family_id);
CREATE INDEX refresh_token_principal_idx ON chai.refresh_token(principal_id);

-- RLS: same role-scoped pattern as chai.user_credential (migration 0049).
-- Login/refresh/logout resolve a principal before any tenant context
-- exists, so isolation here is by ROLE (only chai_app_runtime may touch the
-- rows), not by a per-row tenant match.
ALTER TABLE chai.refresh_token_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.refresh_token_family FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_token_family_app_runtime ON chai.refresh_token_family
  FOR ALL
  TO chai_app_runtime
  USING (true)
  WITH CHECK (true);

ALTER TABLE chai.refresh_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.refresh_token FORCE ROW LEVEL SECURITY;
CREATE POLICY refresh_token_app_runtime ON chai.refresh_token
  FOR ALL
  TO chai_app_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON chai.refresh_token_family FROM PUBLIC;
REVOKE ALL ON chai.refresh_token FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.refresh_token_family TO chai_app_runtime;
GRANT SELECT, INSERT, UPDATE ON chai.refresh_token TO chai_app_runtime;

RESET ROLE;
