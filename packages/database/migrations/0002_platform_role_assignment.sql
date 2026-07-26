SET ROLE chai_migration_owner;

CREATE TABLE chai.platform_role_assignment (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL CONSTRAINT platform_role_assignment_role_valid CHECK (
    role IN (
      'PLATFORM_OWNER',
      'PLATFORM_ADMIN',
      'SUPPORT',
      'BILLING',
      'AUDITOR'
    )
  ),
  status text NOT NULL CONSTRAINT platform_role_assignment_status_valid
    CHECK (status IN ('ACTIVE', 'DISABLED', 'REVOKED')),
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT platform_role_assignment_stage_1_active_role
    CHECK (status <> 'ACTIVE' OR role = 'PLATFORM_OWNER'),
  CONSTRAINT platform_role_assignment_revocation_consistency
    CHECK (
      (status = 'ACTIVE' AND revoked_at IS NULL)
      OR (status <> 'ACTIVE' AND revoked_at IS NOT NULL)
    ),
  CONSTRAINT platform_role_assignment_user_fk
    FOREIGN KEY (user_id) REFERENCES chai.user_account(id),
  CONSTRAINT platform_role_assignment_granted_by_fk
    FOREIGN KEY (granted_by) REFERENCES chai.user_account(id)
);

CREATE UNIQUE INDEX platform_role_assignment_active_owner_unique
  ON chai.platform_role_assignment(role)
  WHERE role = 'PLATFORM_OWNER' AND status = 'ACTIVE';

CREATE INDEX platform_role_assignment_user_idx
  ON chai.platform_role_assignment(user_id);

ALTER TABLE chai.platform_role_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.platform_role_assignment FORCE ROW LEVEL SECURITY;
CREATE POLICY principal_isolation ON chai.platform_role_assignment
  USING (user_id = chai.current_principal_id());

REVOKE ALL ON chai.platform_role_assignment FROM PUBLIC;
GRANT SELECT ON chai.platform_role_assignment TO chai_app_runtime;

RESET ROLE;
