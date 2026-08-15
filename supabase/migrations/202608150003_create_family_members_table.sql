-- Migration: Create family_members table
-- Links users to families for the Family Vitals app

-- Create family_members table if not exists
CREATE TABLE IF NOT EXISTS public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- 'member' or 'admin'
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, family_id)
);

-- Enable row level security
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

-- Create policies for family_members

-- Users can view family members in their own family
CREATE POLICY "Users can view own family members" ON public.family_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (family_id = family_id OR is_super_admin = true)
    )
  );

-- Super admins can manage all family members
CREATE POLICY "Super admins can manage family members" ON public.family_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );