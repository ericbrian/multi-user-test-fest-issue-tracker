-- Add browser/os environment fields to issues
-- Safe, additive migration (no drops).

ALTER TABLE "testfest"."issues"
  ADD COLUMN IF NOT EXISTS "browser" TEXT;

ALTER TABLE "testfest"."issues"
  ADD COLUMN IF NOT EXISTS "os" TEXT;
