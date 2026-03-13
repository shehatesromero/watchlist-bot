-- Migration: add foreign key from user_groups.user_telegram_id to users.telegram_id
-- This allows PostgREST to join users → user_groups for multi-group queries
-- Run this in: Supabase Dashboard → SQL Editor

ALTER TABLE user_groups
  ADD CONSTRAINT user_groups_user_telegram_id_fkey
  FOREIGN KEY (user_telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE;
