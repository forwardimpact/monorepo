-- Database Initialization
-- ============================================
-- Creates required schemas and roles for GoTrue and Supabase Storage.
-- The services will handle creating their own tables via migrations.

-- ==========================================
-- Schemas
-- ==========================================

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;

-- ==========================================
-- Roles for Supabase Compatibility
-- ==========================================
-- Supabase services expect these roles for row-level security.
-- The authenticator role is used by PostgREST to switch between
-- anon/authenticated/service_role based on JWT claims.

-- Anonymous role: unauthenticated public access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Authenticated role: logged-in user access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Service role: elevated admin access, bypasses RLS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- Authenticator role: used by PostgREST to switch roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Grant role membership for role switching
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

-- ==========================================
-- Schema Permissions
-- ==========================================

GRANT ALL ON SCHEMA auth TO postgres;
GRANT ALL ON SCHEMA storage TO postgres;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- ==========================================
-- Default Privileges for Storage Schema
-- ==========================================
-- Supabase Storage creates tables via migrations as the postgres user.
-- Grant service_role access to all future tables/sequences in storage schema.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT ALL ON SEQUENCES TO service_role;
