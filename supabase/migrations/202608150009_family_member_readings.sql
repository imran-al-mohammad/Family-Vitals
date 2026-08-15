-- Family members can log readings for each other.
-- logged_by records who entered the row; user_id is who the reading belongs to.

ALTER TABLE public.readings
  ADD COLUMN IF NOT EXISTS logged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.readings
SET logged_by = user_id
WHERE logged_by IS NULL;

ALTER TABLE public.readings
  ALTER COLUMN logged_by SET DEFAULT auth.uid();

DROP POLICY IF EXISTS readings_insert ON public.readings;
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

DROP POLICY IF EXISTS readings_delete ON public.readings;
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

DROP POLICY IF EXISTS readings_update ON public.readings;
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
