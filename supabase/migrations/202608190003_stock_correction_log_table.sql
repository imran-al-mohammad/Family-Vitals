CREATE TABLE IF NOT EXISTS public.stock_correction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id UUID REFERENCES public.medicines(id) ON DELETE CASCADE,
  previous_remaining INTEGER NOT NULL,
  new_remaining INTEGER NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stock_correction_log ENABLE ROW LEVEL SECURITY;

-- Policies for stock_correction_log table
CREATE POLICY stock_correction_log_select ON public.stock_correction_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medicines m
      WHERE m.id = medicine_id
      AND (m.family_id = public.current_family_id() OR public.is_super_admin() OR m.user_id = auth.uid())
    )
  );

CREATE POLICY stock_correction_log_insert ON public.stock_correction_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medicines m
      WHERE m.id = medicine_id
      AND (m.family_id = public.current_family_id() OR public.is_super_admin() OR m.user_id = auth.uid())
    )
  );

CREATE POLICY stock_correction_log_delete ON public.stock_correction_log
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medicines m
      WHERE m.id = medicine_id
      AND m.user_id = auth.uid()
    )
  );