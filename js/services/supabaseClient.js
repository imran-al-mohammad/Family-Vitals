import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://ewppvkesxqksauuikghd.supabase.co';
const supabaseAnonKey = 'sb_publishable_Fo8SPeH04ZtikKSPEySr3w_hlhSH5z2';

let client = null;

export function getSupabase() {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

// Kept so existing imports of initSupabase still resolve.
export const initSupabase = getSupabase;
