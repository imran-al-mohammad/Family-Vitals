-- Migration: Create readings table
-- Stores vital sign readings for Family Vitals

-- Create readings table if not exists
CREATE TABLE IF NOT EXISTS public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bp', 'pulse', 'blood-sugar')),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- BP fields
  systolic INTEGER CHECK (systolic >= 60 AND systolic <= 250),
  diastolic INTEGER CHECK (diastolic >= 40 AND diastolic <= 150),
  -- Pulse fields
  bpm INTEGER CHECK (bpm >= 40 AND bpm <= 200),
  -- Blood Sugar fields
  value DECIMAL(10, 2),
  unit TEXT CHECK (unit IN ('mg/dL', 'mmol/L')),
  context TEXT CHECK (context IN ('fasting', 'after-meal', 'random')),
  notes TEXT
);

-- Enable row level security
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

-- Create policies for readings

-- Users can view their own readings
CREATE POLICY "Users can view own readings" ON public.readings
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own readings
CREATE POLICY "Users can insert own readings" ON public.readings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Super admins can view all readings
CREATE POLICY "Super admins can view all readings" ON public.readings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Super admins can update all readings
CREATE POLICY "Super admins can update all readings" ON public.readings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );