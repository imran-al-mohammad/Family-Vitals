-- Migration: Create families table
-- Stores family groups for Family Vitals

-- Create families table if not exists
CREATE TABLE IF NOT EXISTS public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable row level security
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;

-- Create policies for families

-- Everyone can view families (for displaying family list)
CREATE POLICY "Anyone can view families" ON public.families
  FOR SELECT USING (true);

-- Super admins can insert families
CREATE POLICY "Super admins can insert families" ON public.families
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Super admins can update families
CREATE POLICY "Super admins can update families" ON public.families
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Super admins can delete families (cascade delete members and profiles)
CREATE POLICY "Super admins can delete families" ON public.families
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );