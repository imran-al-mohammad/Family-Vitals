-- Family Vitals one-shot setup. Run this in the Supabase SQL editor.


-- ===== 202608150001_create_families_table.sql =====
-- Families: household groups that share readings.

CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;


-- ===== 202608150002_create_profiles_table.sql =====
-- Profiles extend auth.users with display fields and family membership.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  avatar TEXT,
  family_id UUID REFERENCES public.families(id) ON DELETE SET NULL,
  is_super_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ===== 202608150003_create_family_members_table.sql =====
-- Membership join table. profiles.family_id is the current household.

CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, family_id)
);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;


-- ===== 202608150004_create_readings_table.sql =====
-- Vital sign readings: blood pressure, pulse, and blood sugar.

CREATE TABLE IF NOT EXISTS public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bp', 'pulse', 'blood-sugar')),
  created_at TIMESTAMPTZ DEFAULT now(),
  systolic INTEGER CHECK (systolic >= 60 AND systolic <= 250),
  diastolic INTEGER CHECK (diastolic >= 40 AND diastolic <= 150),
  bpm INTEGER CHECK (bpm >= 40 AND bpm <= 200),
  value DECIMAL(10, 2),
  unit TEXT CHECK (unit IN ('mg/dL', 'mmol/L')),
  context TEXT CHECK (context IN ('fasting', 'after-meal', 'random')),
  notes TEXT,
  logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.readings ADD COLUMN IF NOT EXISTS logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
UPDATE public.readings SET logged_by = user_id WHERE logged_by IS NULL;
ALTER TABLE public.readings ALTER COLUMN logged_by SET DEFAULT auth.uid();

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;


-- ===== 202608150005_profile_trigger.sql =====
-- Create a profile for every new auth user. The first user becomes super admin.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_count FROM public.profiles;

  INSERT INTO public.profiles (id, full_name, email, is_super_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    existing_count = 0
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- First profile becomes admin. Nobody else can self-promote.
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO existing_count FROM public.profiles WHERE id <> NEW.id;
    IF existing_count = 0 THEN
      NEW.is_super_admin := true;
    ELSIF NEW.is_super_admin IS TRUE AND NOT COALESCE(
      (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
      false
    ) THEN
      NEW.is_super_admin := false;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     AND NOT COALESCE(
       (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
       false
     ) THEN
    NEW.is_super_admin := OLD.is_super_admin;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_super_admin ON public.profiles;
CREATE TRIGGER protect_super_admin
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_super_admin();


-- ===== 202608150006_rls_policies.sql =====
-- Helper functions avoid recursive RLS checks on profiles.

CREATE OR REPLACE FUNCTION public.current_family_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.current_family_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Drop policies from the earlier (broken) migrations if they exist.
DROP POLICY IF EXISTS "Anyone can view families" ON public.families;
DROP POLICY IF EXISTS "Super admins can insert families" ON public.families;
DROP POLICY IF EXISTS "Super admins can update families" ON public.families;
DROP POLICY IF EXISTS "Super admins can delete families" ON public.families;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can update profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own family members" ON public.family_members;
DROP POLICY IF EXISTS "Super admins can manage family members" ON public.family_members;

DROP POLICY IF EXISTS "Users can view own readings" ON public.readings;
DROP POLICY IF EXISTS "Users can insert own readings" ON public.readings;
DROP POLICY IF EXISTS "Super admins can view all readings" ON public.readings;
DROP POLICY IF EXISTS "Super admins can update all readings" ON public.readings;

DROP POLICY IF EXISTS families_select ON public.families;
DROP POLICY IF EXISTS families_insert ON public.families;
DROP POLICY IF EXISTS families_update ON public.families;
DROP POLICY IF EXISTS families_delete ON public.families;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;

DROP POLICY IF EXISTS family_members_select ON public.family_members;
DROP POLICY IF EXISTS family_members_insert ON public.family_members;
DROP POLICY IF EXISTS family_members_delete ON public.family_members;

DROP POLICY IF EXISTS readings_select ON public.readings;
DROP POLICY IF EXISTS readings_insert ON public.readings;
DROP POLICY IF EXISTS readings_update ON public.readings;
DROP POLICY IF EXISTS readings_delete ON public.readings;

CREATE POLICY families_select ON public.families
  FOR SELECT TO authenticated
  USING (id = public.current_family_id() OR public.is_super_admin());

CREATE POLICY families_insert ON public.families
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY families_update ON public.families
  FOR UPDATE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY families_delete ON public.families
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (family_id IS NOT NULL AND family_id = public.current_family_id())
  );

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

CREATE POLICY family_members_select ON public.family_members
  FOR SELECT TO authenticated
  USING (family_id = public.current_family_id() OR public.is_super_admin());

CREATE POLICY family_members_insert ON public.family_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR user_id = auth.uid());

CREATE POLICY family_members_delete ON public.family_members
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY readings_select ON public.readings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles owner
      WHERE owner.id = readings.user_id
        AND owner.family_id IS NOT NULL
        AND owner.family_id = public.current_family_id()
    )
  );

CREATE POLICY readings_insert ON public.readings
  FOR INSERT TO authenticated
  WITH CHECK (
    (logged_by IS NULL OR logged_by = auth.uid())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles owner
        WHERE owner.id = user_id
          AND owner.family_id IS NOT NULL
          AND owner.family_id = public.current_family_id()
      )
    )
  );

CREATE POLICY readings_update ON public.readings
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR logged_by = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles owner
      WHERE owner.id = user_id
        AND owner.family_id IS NOT NULL
        AND owner.family_id = public.current_family_id()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles owner
      WHERE owner.id = user_id
        AND owner.family_id IS NOT NULL
        AND owner.family_id = public.current_family_id()
    )
  );

CREATE POLICY readings_delete ON public.readings
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR logged_by = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles owner
      WHERE owner.id = user_id
        AND owner.family_id IS NOT NULL
        AND owner.family_id = public.current_family_id()
    )
  );

-- Keep is_super_admin out of the authenticated update grant.
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, email, avatar, family_id, updated_at) ON public.profiles TO authenticated;


-- ===== 202608150007_app_settings_and_rpcs.sql =====
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.app_settings (key, value)
VALUES ('registration_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
DROP POLICY IF EXISTS app_settings_write ON public.app_settings;

CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY app_settings_write ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.create_family_for_current_user(family_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
  existing UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF family_name IS NULL OR btrim(family_name) = '' THEN
    RAISE EXCEPTION 'Family name is required';
  END IF;

  SELECT family_id INTO existing FROM public.profiles WHERE id = auth.uid();
  IF existing IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to a family';
  END IF;

  INSERT INTO public.families (name)
  VALUES (btrim(family_name))
  RETURNING id INTO new_id;

  UPDATE public.profiles
  SET family_id = new_id, updated_at = now()
  WHERE id = auth.uid();

  INSERT INTO public.family_members (user_id, family_id, role)
  VALUES (auth.uid(), new_id, 'admin')
  ON CONFLICT (user_id, family_id) DO NOTHING;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_user_to_family(target_user UUID, target_family UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only administrators can assign members';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.families WHERE id = target_family) THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  UPDATE public.profiles
  SET family_id = target_family, updated_at = now()
  WHERE id = target_user;

  DELETE FROM public.family_members
  WHERE user_id = target_user
    AND family_id <> target_family;

  INSERT INTO public.family_members (user_id, family_id, role)
  VALUES (target_user, target_family, 'member')
  ON CONFLICT (user_id, family_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_family_for_current_user(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_to_family(UUID, UUID) TO authenticated;


-- ===== 202608150008_admin_create_user.sql =====
-- Super admins can create sign-in accounts without using the public sign-up form.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_create_user(
  user_email TEXT,
  user_password TEXT,
  user_full_name TEXT DEFAULT NULL,
  target_family UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id UUID := gen_random_uuid();
  normalized_email TEXT;
  normalized_name TEXT;
  encrypted_pw TEXT;
  identity_json JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only administrators can add users';
  END IF;

  normalized_email := lower(btrim(COALESCE(user_email, '')));
  normalized_name := btrim(COALESCE(user_full_name, ''));
  user_password := btrim(COALESCE(user_password, ''));

  IF normalized_email = '' OR position('@' IN normalized_email) = 0 THEN
    RAISE EXCEPTION 'A valid email is required';
  END IF;

  IF char_length(user_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  IF normalized_name = '' THEN
    normalized_name := split_part(normalized_email, '@', 1);
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = normalized_email
  ) THEN
    RAISE EXCEPTION 'A user with that email already exists';
  END IF;

  IF target_family IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.families WHERE id = target_family
  ) THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  encrypted_pw := crypt(user_password, gen_salt('bf', 10));
  identity_json := jsonb_build_object(
    'sub', new_id::text,
    'email', normalized_email,
    'email_verified', true,
    'phone_verified', false
  );

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    COALESCE(
      (SELECT instance_id FROM auth.users WHERE instance_id IS NOT NULL LIMIT 1),
      '00000000-0000-0000-0000-000000000000'::uuid
    ),
    new_id,
    'authenticated',
    'authenticated',
    normalized_email,
    encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', normalized_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_id,
    identity_json,
    'email',
    normalized_email,
    now(),
    now(),
    now()
  );

  UPDATE public.profiles
  SET
    full_name = normalized_name,
    email = normalized_email,
    updated_at = now()
  WHERE id = new_id;

  IF target_family IS NOT NULL THEN
    UPDATE public.profiles
    SET family_id = target_family, updated_at = now()
    WHERE id = new_id;

    INSERT INTO public.family_members (user_id, family_id, role)
    VALUES (new_id, target_family, 'member')
    ON CONFLICT (user_id, family_id) DO NOTHING;
  END IF;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_user(TEXT, TEXT, TEXT, UUID) TO authenticated;
