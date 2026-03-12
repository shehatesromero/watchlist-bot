-- ============================================================
--  watchlist-bot  •  Supabase schema
--  Run this in the Supabase SQL Editor (Project → SQL Editor)
-- ============================================================

-- ── Groups ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  invite_code TEXT        UNIQUE NOT NULL,
  created_by  BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT      PRIMARY KEY,
  username    TEXT,
  first_name  TEXT        NOT NULL,
  group_id    UUID        REFERENCES groups(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Videos ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS videos (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- scope: personal → user_id set, group_id NULL
  --         group   → group_id set, user_id NULL
  user_id       BIGINT      REFERENCES users(telegram_id) ON DELETE CASCADE,
  group_id      UUID        REFERENCES groups(id)         ON DELETE CASCADE,
  added_by      BIGINT      NOT NULL,
  added_by_name TEXT        NOT NULL,
  url           TEXT        NOT NULL,
  video_id      TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  thumbnail     TEXT,
  tags          TEXT[]      DEFAULT '{}',
  priority      INTEGER     DEFAULT 0,
  status        TEXT        DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'watched')),
  timecode      INTEGER     DEFAULT 0,   -- seconds
  is_archived   BOOLEAN     DEFAULT FALSE,
  watched_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user_id   ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_group_id  ON videos(group_id);
CREATE INDEX IF NOT EXISTS idx_videos_status    ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_archived  ON videos(is_archived);

-- ── Disable RLS (personal app with two users — no need for row-level security)
ALTER TABLE groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE users  DISABLE ROW LEVEL SECURITY;
ALTER TABLE videos DISABLE ROW LEVEL SECURITY;

-- ── Realtime (optional — enables live updates in the Mini App)
-- Run these in the Database → Replication tab, or uncomment:
-- ALTER PUBLICATION supabase_realtime ADD TABLE videos;
