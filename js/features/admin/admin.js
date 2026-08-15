import { setButtonBusy, showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import { adminCreateUser, isMissingRelation, setupErrorMessage } from '../../shared/api.js';

export async function renderAdminUI(root, { supabase }) {
  root.innerHTML = `<p class="empty-state">Loading admin…</p>`;

  try {
    const [{ data: settings }, { data: users, error: usersError }, { data: families, error: familiesError }] =
      await Promise.all([
        supabase.from('app_settings').select('key, value'),
        supabase
          .from('profiles')
          .select('id, full_name, email, family_id, is_super_admin')
          .order('full_name', { ascending: true }),
        supabase.from('families').select('id, name').order('name', { ascending: true }),
      ]);

    if (usersError) throw usersError;
    if (familiesError) throw familiesError;

    const registrationEnabled = (settings || []).find((row) => row.key === 'registration_enabled')?.value !== 'false';
    const familyName = Object.fromEntries((families || []).map((family) => [family.id, family.name]));

    root.innerHTML = `
      <section class="view">
        <header class="view-header">
          <div>
            <p class="eyebrow">Administration</p>
            <h1 class="view-title">Admin</h1>
          </div>
        </header>

        <div class="admin-grid">
          <section class="card admin-section">
            <h2 class="section-title">Registration</h2>
            <p class="muted mb-4">This only hides sign-up in the app. Turn off sign-ups in the Supabase Auth settings to block them completely.</p>
            <div class="form-group">
              <label class="form-label" for="registration-status">New accounts</label>
              <select id="registration-status" class="form-input">
                <option value="true" ${registrationEnabled ? 'selected' : ''}>Enabled</option>
                <option value="false" ${registrationEnabled ? '' : 'selected'}>Disabled</option>
              </select>
            </div>
            <button type="button" class="btn-secondary" id="toggle-registration">Save</button>
          </section>

          <section class="card admin-section">
            <h2 class="section-title">Add user</h2>
            <p class="muted mb-4">Creates an account they can sign in with right away. Share the password with them.</p>
            <form id="add-user-form">
              <div class="form-group">
                <label class="form-label" for="new-user-name">Full name</label>
                <input type="text" id="new-user-name" class="form-input" placeholder="Their name" autocomplete="name" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="new-user-email">Email</label>
                <input type="email" id="new-user-email" class="form-input" placeholder="them@example.com" autocomplete="off" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="new-user-password">Password</label>
                <input type="password" id="new-user-password" class="form-input" placeholder="At least 6 characters" autocomplete="new-password" minlength="6" required>
              </div>
              <div class="form-group">
                <label class="form-label" for="new-user-family">Family</label>
                <select id="new-user-family" class="form-input">
                  <option value="">Unassigned</option>
                  ${(families || [])
                    .map((family) => `<option value="${escapeHtml(family.id)}">${escapeHtml(family.name)}</option>`)
                    .join('')}
                </select>
              </div>
              <button type="submit" class="btn-primary" id="add-user-btn">Add user</button>
            </form>
          </section>

          <section class="card admin-section">
            <h2 class="section-title">Create family</h2>
            <form id="create-family-admin-form">
              <div class="form-group">
                <label class="form-label" for="new-family-name">Family name</label>
                <input type="text" id="new-family-name" class="form-input" placeholder="Family name" maxlength="80" required>
              </div>
              <button type="submit" class="btn-primary" id="create-family-btn">Create family</button>
            </form>
          </section>

          <section class="card admin-section">
            <h2 class="section-title">Assign member</h2>
            <form id="assign-family-form">
              <div class="form-group">
                <label class="form-label" for="assign-user-select">User</label>
                <select id="assign-user-select" class="form-input" required>
                  ${(users || [])
                    .map(
                      (person) =>
                        `<option value="${escapeHtml(person.id)}">${escapeHtml(person.full_name || person.email || person.id)}</option>`,
                    )
                    .join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="assign-family-select">Family</label>
                <select id="assign-family-select" class="form-input" required>
                  ${(families || [])
                    .map((family) => `<option value="${escapeHtml(family.id)}">${escapeHtml(family.name)}</option>`)
                    .join('')}
                </select>
              </div>
              <button type="submit" class="btn-primary" id="assign-submit">Assign</button>
            </form>
          </section>
        </div>

        <section class="section">
          <h2 class="section-title">People</h2>
          ${
            !users?.length
              ? `<p class="empty-state">No profiles yet.</p>`
              : `<div class="table-wrap"><table class="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Family</th><th>Role</th></tr></thead>
                  <tbody>
                    ${users
                      .map(
                        (person) => `
                          <tr>
                            <td>${escapeHtml(person.full_name || '—')}</td>
                            <td>${escapeHtml(person.email || '—')}</td>
                            <td>${escapeHtml(familyName[person.family_id] || 'Unassigned')}</td>
                            <td>${person.is_super_admin ? 'Admin' : 'Member'}</td>
                          </tr>`,
                      )
                      .join('')}
                  </tbody>
                </table></div>`
          }
        </section>
      </section>
    `;

    bindAdminEvents(root, supabase, { users, families });
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(setupErrorMessage(error))}</p>`;
    showAlert(setupErrorMessage(error), 'error');
  }
}

function bindAdminEvents(root, supabase, { users, families }) {
  const toggleBtn = root.querySelector('#toggle-registration');
  toggleBtn.addEventListener('click', async () => {
    const value = root.querySelector('#registration-status').value;
    setButtonBusy(toggleBtn, true, 'Saving…');
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'registration_enabled', value }, { onConflict: 'key' });
    setButtonBusy(toggleBtn, false, 'Save');
    if (error) {
      showAlert(setupErrorMessage(error), 'error');
      return;
    }
    showAlert(value === 'true' ? 'Registration enabled.' : 'Registration disabled in the app.', 'success');
  });

  const addUserForm = root.querySelector('#add-user-form');
  const addUserBtn = root.querySelector('#add-user-btn');
  addUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = root.querySelector('#new-user-name').value.trim();
    const email = root.querySelector('#new-user-email').value.trim();
    const password = root.querySelector('#new-user-password').value;
    const familyId = root.querySelector('#new-user-family').value;

    setButtonBusy(addUserBtn, true, 'Adding…');
    try {
      await adminCreateUser(supabase, { email, password, fullName, familyId });
      showAlert('User added. They can sign in with that email and password.', 'success');
      await renderAdminUI(root, { supabase });
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
      setButtonBusy(addUserBtn, false, 'Add user');
    }
  });

  const createForm = root.querySelector('#create-family-admin-form');
  const createBtn = root.querySelector('#create-family-btn');
  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = root.querySelector('#new-family-name').value.trim();
    setButtonBusy(createBtn, true, 'Creating…');
    const { error } = await supabase.from('families').insert({ name });
    setButtonBusy(createBtn, false, 'Create family');
    if (error) {
      showAlert(setupErrorMessage(error), 'error');
      return;
    }
    showAlert('Family created.', 'success');
    await renderAdminUI(root, { supabase });
  });

  const assignForm = root.querySelector('#assign-family-form');
  const assignBtn = root.querySelector('#assign-submit');
  if (!users?.length || !families?.length) {
    assignBtn.disabled = true;
  }

  assignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const userId = root.querySelector('#assign-user-select').value;
    const familyId = root.querySelector('#assign-family-select').value;
    if (!userId || !familyId) {
      showAlert('Select a user and a family.', 'error');
      return;
    }

    setButtonBusy(assignBtn, true, 'Assigning…');
    try {
      const rpc = await supabase.rpc('assign_user_to_family', {
        target_user: userId,
        target_family: familyId,
      });
      if (rpc.error && !isMissingRelation(rpc.error)) throw rpc.error;

      if (rpc.error) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ family_id: familyId })
          .eq('id', userId);
        if (profileError) throw profileError;
        const { error: memberError } = await supabase
          .from('family_members')
          .insert({ user_id: userId, family_id: familyId, role: 'member' });
        if (memberError && memberError.code !== '23505') throw memberError;
      }

      showAlert('Member assigned.', 'success');
      await renderAdminUI(root, { supabase });
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
      setButtonBusy(assignBtn, false, 'Assign');
    }
  });
}
