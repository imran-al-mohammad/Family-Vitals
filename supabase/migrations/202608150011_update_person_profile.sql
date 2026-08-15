-- Members can edit their own profile. Super admins can edit any member.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.update_person_profile(
  target_user UUID,
  new_full_name TEXT DEFAULT NULL,
  new_email TEXT DEFAULT NULL,
  new_age_years INTEGER DEFAULT NULL,
  new_weight_kg NUMERIC DEFAULT NULL,
  new_family UUID DEFAULT NULL,
  set_family BOOLEAN DEFAULT FALSE,
  new_password TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  normalized_email TEXT;
  normalized_name TEXT;
  is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  is_admin := public.is_super_admin();

  IF auth.uid() <> target_user AND NOT is_admin THEN
    RAISE EXCEPTION 'You can only edit your own profile';
  END IF;

  normalized_name := btrim(COALESCE(new_full_name, ''));
  IF new_full_name IS NOT NULL AND normalized_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF new_email IS NOT NULL THEN
    normalized_email := lower(btrim(new_email));
    IF normalized_email = '' OR position('@' IN normalized_email) = 0 THEN
      RAISE EXCEPTION 'A valid email is required';
    END IF;
    IF EXISTS (
      SELECT 1 FROM auth.users
      WHERE lower(email) = normalized_email AND id <> target_user
    ) THEN
      RAISE EXCEPTION 'A user with that email already exists';
    END IF;
  END IF;

  IF new_password IS NOT NULL AND btrim(new_password) <> '' THEN
    IF char_length(btrim(new_password)) < 6 THEN
      RAISE EXCEPTION 'Password must be at least 6 characters';
    END IF;
  END IF;

  IF set_family AND NOT is_admin THEN
    RAISE EXCEPTION 'Only administrators can change family assignment';
  END IF;

  IF set_family AND new_family IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.families WHERE id = new_family
  ) THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  UPDATE public.profiles
  SET
    full_name = CASE WHEN new_full_name IS NOT NULL THEN normalized_name ELSE full_name END,
    email = CASE WHEN new_email IS NOT NULL THEN normalized_email ELSE email END,
    age_years = new_age_years,
    weight_kg = new_weight_kg,
    family_id = CASE WHEN set_family THEN new_family ELSE family_id END,
    updated_at = now()
  WHERE id = target_user;

  IF set_family THEN
    DELETE FROM public.family_members
    WHERE user_id = target_user
      AND (new_family IS NULL OR family_id <> new_family);

    IF new_family IS NOT NULL THEN
      INSERT INTO public.family_members (user_id, family_id, role)
      VALUES (target_user, new_family, 'member')
      ON CONFLICT (user_id, family_id) DO NOTHING;
    END IF;
  END IF;

  IF normalized_email IS NOT NULL THEN
    UPDATE auth.users
    SET email = normalized_email, updated_at = now()
    WHERE id = target_user;

    UPDATE auth.identities
    SET
      provider_id = normalized_email,
      identity_data = COALESCE(identity_data, '{}'::jsonb) || jsonb_build_object('email', normalized_email),
      updated_at = now()
    WHERE user_id = target_user
      AND provider = 'email';
  END IF;

  IF new_password IS NOT NULL AND btrim(new_password) <> '' THEN
    UPDATE auth.users
    SET
      encrypted_password = crypt(btrim(new_password), gen_salt('bf', 10)),
      updated_at = now()
    WHERE id = target_user;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_person_profile(UUID, TEXT, TEXT, INTEGER, NUMERIC, UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_profile(UUID, TEXT, TEXT, INTEGER, NUMERIC, UUID, BOOLEAN, TEXT)
  TO authenticated;
