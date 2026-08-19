CREATE TABLE IF NOT EXISTS public.purchase_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID REFERENCES public.medicines(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  strips_bought INTEGER NOT NULL DEFAULT 0,
  pieces_bought INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.purchase_log ENABLE ROW LEVEL SECURITY;

-- Policies for purchase_log table
CREATE POLICY purchase_log_select ON public.purchase_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medicines m
      WHERE m.id = medicine_id
      AND (m.family_id = public.current_family_id() OR public.is_super_admin() OR m.user_id = auth.uid())
    )
  );

CREATE POLICY purchase_log_insert ON public.purchase_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medicines m
      WHERE m.id = medicine_id
      AND (m.family_id = public.current_family_id() OR public.is_super_admin() OR m.user_id = auth.uid())
    )
  );

CREATE POLICY purchase_log_delete ON public.purchase_log
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medicines m
      WHERE m.id = medicine_id
      AND m.user_id = auth.uid()
    )
  );