-- 0061: MFA secret encryption-at-rest + MFA verification lockout (D3 security).
--
-- FINDING (MEDIUM) — TOTP secret stored plaintext. 0049 stored chai.user_mfa_factor.secret
-- in the clear and its comment admitted as much. A stored TOTP secret is a bearer
-- credential: whoever reads it can mint valid codes indefinitely. The application
-- now encrypts it with AES-256-GCM under MFA_SECRET_KEY (see
-- apps/api/src/auth/mfa-secret-crypto.ts) before it is ever written, and decrypts
-- on read. The column stays `text` because the ciphertext envelope
-- `v1.<ivB64>.<tagB64>.<ciphertextB64>` is ASCII and fits without a type change;
-- this migration only corrects the misleading comment.
--
-- KEY IS MANDATORY, NO DEFAULT. Without MFA_SECRET_KEY the encrypt call throws, so
-- enrolment FAILS HARD instead of silently persisting plaintext.
--
-- LEGACY DATA PATH. Any secret written before this change is a bare base32 string
-- (not in `v1.` envelope form). It cannot be re-encrypted in SQL because the key
-- lives only in the application, so there is nothing to back-fill here. The app
-- reads such rows as-is (see decryptMfaSecret) so an already-enrolled user is not
-- broken; the row is rewritten encrypted on the next enrolment. Operators wanting
-- to eliminate residual plaintext immediately can force re-enrolment or run a
-- one-off re-encrypt pass with mfa-secret-crypto. On a fresh install there are no
-- such rows.
--
-- FINDING (HIGH) — MFA verification had no lockout. Login locks after 5 failures,
-- but TOTP step-up was only rate-limited, leaving online brute force open to a
-- holder of a password-only session. These two columns give the factor its own
-- lockout counter, mirroring chai.user_credential.{failed_attempt_count,
-- locked_until}; the API enforces the same DEFAULT_LOCKOUT_POLICY against them.
-- Kept on the factor (not the login counter) so an MFA brute force and a password
-- brute force cannot interfere with each other's counters.
--
-- No GRANT changes: new columns inherit the table's SELECT/INSERT/UPDATE grant to
-- chai_app_runtime from 0049, and RLS (ENABLE + FORCE, role-scoped) is unchanged.

SET ROLE chai_migration_owner;

ALTER TABLE chai.user_mfa_factor
  ADD COLUMN failed_attempt_count integer NOT NULL DEFAULT 0
    CONSTRAINT user_mfa_factor_failed_nonneg CHECK (failed_attempt_count >= 0),
  ADD COLUMN locked_until timestamptz;

COMMENT ON COLUMN chai.user_mfa_factor.secret IS
  'TOTP shared secret, encrypted at rest with AES-256-GCM under MFA_SECRET_KEY '
  '(envelope v1.<ivB64>.<tagB64>.<ciphertextB64>); see apps/api/src/auth/mfa-secret-crypto.ts. '
  'Never logged. Legacy pre-0061 rows may be bare base32 plaintext until re-enrolled.';

COMMENT ON COLUMN chai.user_mfa_factor.failed_attempt_count IS
  'Consecutive failed TOTP verifications; drives the same lockout policy as login.';

COMMENT ON COLUMN chai.user_mfa_factor.locked_until IS
  'When set and in the future, TOTP verification is locked out (online brute-force guard).';

RESET ROLE;
