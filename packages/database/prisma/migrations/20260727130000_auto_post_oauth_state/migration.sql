-- Auto Post OAuth state (CSRF + replay protection)

CREATE TABLE "auto_post_facebook_oauth_states" (
  "id" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "auto_post_facebook_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auto_post_facebook_oauth_states_state_hash_key"
  ON "auto_post_facebook_oauth_states"("state_hash");

CREATE INDEX "auto_post_facebook_oauth_states_organization_id_idx"
  ON "auto_post_facebook_oauth_states"("organization_id");

