-- Age and weight on profiles, used to interpret readings.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_years INTEGER,
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(5, 1);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_age_years_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_years_check
  CHECK (age_years IS NULL OR (age_years >= 0 AND age_years <= 130));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_weight_kg_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_weight_kg_check
  CHECK (weight_kg IS NULL OR (weight_kg >= 2 AND weight_kg <= 400));

REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, email, avatar, family_id, updated_at, age_years, weight_kg)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.update_person_body_stats(
  target_user UUID,
  new_age_years INTEGER DEFAULT NULL,
  new_weight_kg NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_family UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  SELECT family_id INTO target_family FROM public.profiles WHERE id = target_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF auth.uid() <> target_user
     AND NOT public.is_super_admin()
     AND NOT (
       target_family IS NOT NULL
       AND target_family = public.current_family_id()
     ) THEN
    RAISE EXCEPTION 'Only this person, a household member, or an administrator can update these details';
  END IF;

  UPDATE public.profiles
  SET
    age_years = new_age_years,
    weight_kg = new_weight_kg,
    updated_at = now()
  WHERE id = target_user;
END;
$$;

REVOKE ALL ON FUNCTION public.update_person_body_stats(UUID, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_person_body_stats(UUID, INTEGER, NUMERIC) TO authenticated;
