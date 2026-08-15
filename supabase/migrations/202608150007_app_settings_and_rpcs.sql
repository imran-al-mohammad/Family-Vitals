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
