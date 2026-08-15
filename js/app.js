import auth from './features/auth/auth.js';
import dashboard from './features/dashboard/dashboard.js';
import family from './features/family/family.js';
import readings from './features/readings/readings.js';
import admin from './features/admin/admin.js';
import { initSupabase } from './services/supabaseClient.js';
import { showAlert } from './services/uiService.js';

document.addEventListener('DOMContentLoaded', async () => {
  const supabase = initSupabase();
  await auth.initAuth(supabase);
  
  // Check auth state and render appropriate UI
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    // User is signed in - show main app
    dashboard.renderDashboard(user.id);
    family.renderFamilyView(user.id);
    readings.renderReadingsUI(user.id);
    
    // Check if user is super admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();
    
    if (profile?.is_super_admin) {
      admin.renderAdminUI();
    }
  } else {
    // User not signed in - show auth screen
    auth.renderAuthScreen();
  }
});