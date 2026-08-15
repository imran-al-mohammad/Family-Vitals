-- Vital sign readings: blood pressure, pulse, and blood sugar.

CREATE TABLE IF NOT EXISTS public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('bp', 'pulse', 'blood-sugar')),
  created_at TIMESTAMPTZ DEFAULT now(),
  systolic INTEGER CHECK (systolic >= 60 AND systolic <= 250),
  diastolic INTEGER CHECK (diastolic >= 40 AND diastolic <= 150),
  bpm INTEGER CHECK (bpm >= 40 AND bpm <= 200),
  value DECIMAL(10, 2),
  unit TEXT CHECK (unit IN ('mg/dL', 'mmol/L')),
  context TEXT CHECK (context IN ('fasting', 'after-meal', 'random')),
  notes TEXT
);

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
