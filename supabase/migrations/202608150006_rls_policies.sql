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
  WITH CHECK (user_id = auth.uid());

CREATE POLICY readings_update ON public.readings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

CREATE POLICY readings_delete ON public.readings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

-- Keep is_super_admin out of the authenticated update grant.
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, email, avatar, family_id, updated_at) ON public.profiles TO authenticated;
