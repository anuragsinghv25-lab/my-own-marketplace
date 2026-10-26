-- Minimal stand-in for Supabase's auth schema, for tests and CI on plain Postgres.
-- Real Supabase projects already have auth.users; never run this against one.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  banned_until timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
