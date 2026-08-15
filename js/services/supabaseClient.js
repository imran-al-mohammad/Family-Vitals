import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const supabaseUrl = 'https://ewppvkesxqksauuikghd.supabase.co';
const supabaseAnonKey = 'sb_publishable_Fo8SPeH04ZtikKSPEySr3w_hlhSH5z2';

export const initSupabase = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshSession: true,
    },
  });
};