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
