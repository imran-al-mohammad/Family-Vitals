import { initSupabase } from '../services/supabaseClient.js';
import { showAlert } from '../services/uiService.js';

export const renderAdminUI = () => {
  const appContainer = document.getElementById('app-container');
  if (!appContainer) return;
  
  appContainer.innerHTML = `
    <div class="admin-panel">
      <h1 class="admin-title">Admin Panel</h1>
      
      <div class="admin-section">
        <h2 class="section-title">Registration Control</h2>
        <div class="form-group">
          <label class="form-label">Registration Enabled</label>
          <select id="registration-status" class="form-input">
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
          <button id="toggle-registration" class="btn-secondary">Apply</button>
        </div>
      </div>
      
      <div class="admin-section">
        <h2 class="section-title">User Management</h2>
        <div class="form-group">
          <label class="form-label">New User Email</label>
          <input type="email" id="new-user-email" class="form-input" placeholder="user@example.com">
        </div>
        <button id="create-user-btn" class="btn-primary">Create User</button>
      </div>
      
      <div class="admin-section">
        <h2 class="section-title">Family Management</h2>
        <div class="form-group">
          <label class="form-label">Create New Family</label>
          <input type="text" id="new-family-name" class="form-input" placeholder="Family name">
        </div>
        <button id="create-family-btn" class="btn-primary">Create Family</button>
      </div>
      
      <div class="admin-section">
        <h2 class="section-title">Assign Members</h2>
        <form id="assign-family-form" class="form-group">
          <label class="form-label">Select User</label>
          <select id="assign-user-select" class="form-input">
            <!-- Users will be populated -->
          </select>
          <label class="form-label">Select Family</label>
          <select id="assign-family-select" class="form-input">
            <!-- Families will be populated -->
          </select>
          <button type="submit" class="btn-primary">Assign</button>
        </form>
      </div>
    </div>
  `;
  
  // Load users and families
  loadUsersAndFamilies();
  
  // Toggle registration
  const toggleBtn = document.getElementById('toggle-registration');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      const status = document.getElementById('registration-status').value;
      // In a real app, this would update a global setting
      showAlert(`Registration ${status === 'true' ? 'enabled' : 'disabled'}`, 'success');
    });
  }
  
  // Create user
  const createUserBtn = document.getElementById('create-user-btn');
  if (createUserBtn) {
    createUserBtn.addEventListener('click', async () => {
      const email = document.getElementById('new-user-email').value;
      if (!email) {
        showAlert('Please enter an email address', 'error');
        return;
      }
      
      try {
        const { error } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        
        if (error) {
          showAlert('Error creating user: ' + error.message, 'error');
        } else {
          showAlert('User created successfully!', 'success');
          loadUsersAndFamilies();
        }
      } catch (err) {
        showAlert('Error creating user: ' + err.message, 'error');
      }
    });
  }
  
  // Assign family form
  const assignFamilyForm = document.getElementById('assign-family-form');
  if (assignFamilyForm) {
    assignFamilyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('assign-user-select').value;
      const familyId = document.getElementById('assign-family-select').value;
      
      if (!userId || !familyId) {
        showAlert('Please select both user and family', 'error');
        return;
      }
      
      try {
        const { error } = await supabase
          .from('family_members')
          .insert([{ user_id: userId, family_id: familyId }]);
        
        if (error) {
          showAlert('Error assigning member: ' + error.message, 'error');
        } else {
          showAlert('Member assigned successfully!', 'success');
          loadUsersAndFamilies();
        }
      } catch (err) {
        showAlert('Error assigning member: ' + err.message, 'error');
      }
    });
  }
};

const loadUsersAndFamilies = async () => {
  const supabase = initSupabase();
  
  try {
    const { data: users } = await supabase.auth.admin.listUsers();
    const userSelect = document.getElementById('assign-user-select');
    if (userSelect) {
      userSelect.innerHTML = users.users
        .filter(u => u.id !== supabase.auth.getUser().id) // Don't show current user
        .map(u => `<option value="${u.id}">${u.email}</option>`)
        .join('');
    }
    
    // Load families - would need a families table
    // const { data: families } = await supabase.from('families').select('*');
    // const familySelect = document.getElementById('assign-family-select');
    // if (familySelect) {
    //   familySelect.innerHTML = families.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    // }
    
  } catch (err) {
    console.error('Error loading users/families:', err);
  }
};