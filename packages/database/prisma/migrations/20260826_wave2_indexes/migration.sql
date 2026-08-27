-- WAVE2: evidence-based indexes (additive only)
-- role_permissions PK is (role_id, permission_id); reverse lookups by permission_id need this.
CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx
  ON role_permissions (permission_id);

-- Auth session cleanup / force-logout filters
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_revoked_at_idx
  ON auth_sessions (user_id, revoked_at);
