SET ROLE chai_migration_owner;

CREATE FUNCTION chai.assert_active_platform_owner()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM chai.platform_role_assignment
    WHERE role = 'PLATFORM_OWNER' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Platform must retain one active owner.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER platform_role_assignment_active_owner_required
AFTER UPDATE OR DELETE ON chai.platform_role_assignment
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION chai.assert_active_platform_owner();

REVOKE ALL ON FUNCTION chai.assert_active_platform_owner() FROM PUBLIC;

RESET ROLE;
