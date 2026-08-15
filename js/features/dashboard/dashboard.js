import { initSupabase } from '../services/supabaseClient.js';
import { showAlert } from '../services/uiService.js';

export const renderDashboard = async (userId) => {
  const supabase = initSupabase();
  
  // Fetch user's latest readings
  const { data: readings, error } = await supabase
    .from('readings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    showAlert('Error loading readings', 'error');
    return;
  }
  
  // Fetch family members
  const { data: familyMembers } = await supabase
    .from('family_members')
    .select(`
      *,
      profiles!inner (
        full_name,
        avatar
      )
    `)
    .eq('family_id', /* current family */);
  
  // Render latest readings cards
  const appContainer = document.getElementById('app-container');
  if (!appContainer) return;
  
  // Latest readings section
  const latestReadingsSection = document.createElement('section');
  latestReadingsSection.className = 'section';
  
  // BP, Pulse, Sugar cards
  // ... render logic
  
  appContainer.innerHTML = `
    <div class="dashboard">
      <h1 class="dashboard-title">Family Vitals Dashboard</h1>
      <div class="latest-readings">
        <!-- Metric cards will be rendered here -->
      </div>
      <div class="family-section">
        <h2 class="section-title">Family Members</h2>
        <div class="family-grid">
          <!-- Family member cards -->
        </div>
      </div>
    </div>
  `;
};