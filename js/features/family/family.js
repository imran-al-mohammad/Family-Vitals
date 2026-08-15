import { initSupabase } from '../services/supabaseClient.js';
import { showAlert } from '../services/uiService.js';

export const renderFamilyView = async (userId) => {
  const supabase = initSupabase();
  
  // Get current user's family
  const { data: profile } = await supabase
    .from('profiles')
    .select('family_id, is_super_admin')
    .eq('id', userId)
    .single();
  
  let familyMembers = [];
  
  if (profile?.is_super_admin) {
    // Super admin can see all family members
    const { data, error } = await supabase
      .from('family_members')
      .select(`
        user_id,
        profiles!inner (
          full_name,
          avatar,
          role
        )
      `);
    
    if (error) {
      showAlert('Error loading family members', 'error');
      return;
    }
    familyMembers = data || [];
  } else {
    // Regular member sees their family
    const { data: familyData } = await supabase
      .from('family_members')
      .select(`
        user_id,
        profiles!inner (
          full_name,
          avatar
        )
      `)
      .eq('family_id', profile?.family_id);
    
    if (error) {
      showAlert('Error loading family members', 'error');
      return;
    }
    familyMembers = data || [];
  }
  
  const appContainer = document.getElementById('app-container');
  if (!appContainer) return;
  
  appContainer.innerHTML = `
    <div class="family-view">
      <h1 class="view-title">Family Dashboard</h1>
      
      ${familyMembers.length === 0 
        ? `<p class="empty-state">No family members yet. <a href="#" class="add-member-link">Add members</a></p>`
        : ''
      }
      
      <div class="family-grid">
        ${familyMembers.map(member => `
          <div class="family-card">
            <div class="family-avatar">
              ${member.profiles?.avatar 
                ? `<img src="${member.profiles.avatar}" alt="${member.profiles.full_name}">`
                : `<span class="avatar-initials">${getInitials(member.profiles?.full_name)}</span>`}
              </div>
              <span class="family-name">${member.profiles?.full_name || 'Unknown'}</span>
            </div>
            <div class="latest-readings-preview">
              <!-- Would show latest BP, Pulse, Sugar -->
              <span class="reading-placeholder">No readings yet</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
};

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.split(' ');
  return parts.map(p => p[0]).join('').toUpperCase();
};