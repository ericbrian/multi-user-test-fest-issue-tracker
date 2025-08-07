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
  script_id TEXT,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  is_issue BOOLEAN DEFAULT false,
  is_annoyance BOOLEAN DEFAULT false,
  is_existing_upper_env BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'open',
  jira_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS session (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
