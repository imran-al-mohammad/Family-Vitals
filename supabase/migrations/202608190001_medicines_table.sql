CREATE TABLE IF NOT EXISTS public.medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  pieces_per_strip INTEGER NOT NULL DEFAULT 1,
  pieces_per_dose INTEGER NOT NULL DEFAULT 1,
  doses_per_day INTEGER NOT NULL DEFAULT 1,
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  remaining_pieces INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_family_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_family_id() TO authenticated;

-- Policies for medicines table
CREATE POLICY medicines_select ON public.medicines
  FOR SELECT TO authenticated
  USING (
    family_id = public.current_family_id()
    OR public.is_super_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY medicines_insert ON public.medicines
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY medicines_update ON public.medicines
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY medicines_delete ON public.medicines
  FOR DELETE TO authenticated
  USING (public.is_super_admin());