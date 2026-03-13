-- Migration: multi-group membership support
-- Run this in: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS user_groups (
  user_telegram_id bigint NOT NULL,
  group_id         uuid   NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_telegram_id, group_id)
);

ALTER TABLE user_groups ENABLE ROW LEVEL SECURITY;

-- Open policy (same approach as the rest of the app — no user auth layer)
CREATE POLICY "allow_all" ON user_groups
  FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing single-group memberships
INSERT INTO user_groups (user_telegram_id, group_id)
  SELECT telegram_id, group_id
  FROM   users
  WHERE  group_id IS NOT NULL
ON CONFLICT DO NOTHING;
