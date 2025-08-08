-- Create dedicated schema
CREATE SCHEMA IF NOT EXISTS testfest;
SET search_path TO testfest, public;

-- Application tables
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  sub TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_groupier BOOLEAN DEFAULT false,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  script_id INTEGER,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  is_issue BOOLEAN DEFAULT false,
  is_annoyance BOOLEAN DEFAULT false,
  is_existing_upper_env BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'open',
  jira_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Schema evolution: Add new reason flag without changing the original table definition
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS is_not_sure_how_to_test BOOLEAN DEFAULT false;

-- Scripts table to store named scripts with separate sequential ID
CREATE TABLE IF NOT EXISTS test_script (
  id UUID PRIMARY KEY,
  -- Sequential numeric ID starting at 1 and incrementing by 1, distinct from the PK
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_script_line (
  id UUID PRIMARY KEY,
  -- Sequential numeric ID starting at 1 and incrementing by 1, distinct from the PK
  script_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  test_script_id UUID REFERENCES test_script(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add FK from issues.script_id -> scripts.script_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'issues_script_fk' AND t.relname = 'issues'
  ) THEN
    ALTER TABLE issues
      ADD CONSTRAINT issues_script_fk FOREIGN KEY (script_id)
      REFERENCES scripts (script_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
END $$;

-- Session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'session_pkey' AND t.relname = 'session'
  ) THEN
    ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;
