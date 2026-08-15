import { setButtonBusy, showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import { adminCreateUser, isMissingRelation, setupErrorMessage } from '../../shared/api.js';
import { parseBodyStats } from '../../shared/bodyStats.js';
import { formatPersonStats } from '../../shared/format.js';
import { bindProfileForm, profileFieldsHtml } from '../../shared/profileForm.js';

export async function renderAdminUI(root, { supabase }) {
  root.innerHTML = `<p class="empty-state">Loading admin…</p>`;

  try {
    const [{ data: settings }, usersResult, { data: families, error: familiesError }] =
      await Promise.all([
        supabase.from('app_settings').select('key, value'),
        supabase
          .from('profiles')
          .select('id, full_name, email, family_id, is_super_admin, date_of_birth, age_years, weight_kg')
          .order('full_name', { ascending: true }),
        supabase.from('families').select('id, name').order('name', { ascending: true }),
      ]);

    let { data: users, error: usersError } = usersResult;
    if (usersError && /date_of_birth|age_years|weight_kg/.test(usersError.message || '')) {
      const retry = await supabase
        .from('profiles')
        .select('id, full_name, email, family_id, is_super_admin')
        .order('full_name', { ascending: true });
      users = retry.data;
      usersError = retry.error;
    }

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
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="new-user-dob">Date of birth</label>
                  <input type="date" id="new-user-dob" name="date_of_birth" class="form-input">
                </div>
                <div class="form-group">
                  <label class="form-label" for="new-user-weight">Weight (kg)</label>
                  <input type="number" id="new-user-weight" name="weight_kg" class="form-input" min="2" max="400" step="0.1" inputmode="decimal">
                </div>
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

        <section class="section card is-hidden" id="edit-member-card">
          <div class="section-heading">
            <h2 class="section-title" id="edit-member-title">Edit member</h2>
            <button type="button" class="text-link" id="edit-member-close">Close</button>
          </div>
          <p class="muted mb-4">Change this person's name, email, date of birth, weight, family, or password.</p>
          <div id="edit-member-form-wrap"></div>
        </section>

        <section class="section">
          <h2 class="section-title">People</h2>
          ${
            !users?.length
              ? `<p class="empty-state">No profiles yet.</p>`
              : `<div class="table-wrap"><table class="table">
                  <thead><tr><th>Name</th><th>Email</th><th>Age / weight</th><th>Family</th><th>Role</th><th></th></tr></thead>
                  <tbody>
                    ${users
                      .map(
                        (person) => `
                          <tr>
                            <td>${escapeHtml(person.full_name || '—')}</td>
                            <td>${escapeHtml(person.email || '—')}</td>
                            <td>${escapeHtml(formatPersonStats(person) || '—')}</td>
                            <td>${escapeHtml(familyName[person.family_id] || 'Unassigned')}</td>
                            <td>${person.is_super_admin ? 'Admin' : 'Member'}</td>
                            <td><button type="button" class="text-link edit-member-btn" data-edit-user="${escapeHtml(person.id)}">Edit</button></td>
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
    openMemberEditorFromHash(root, supabase, users, families);
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
    const stats = parseBodyStats(addUserForm);
    if (stats.error) {
      showAlert(stats.error, 'error');
      return;
    }

    setButtonBusy(addUserBtn, true, 'Adding…');
    try {
      await adminCreateUser(supabase, {
        email,
        password,
        fullName,
        familyId,
        dateOfBirth: stats.dateOfBirth,
        weightKg: stats.weightKg,
      });
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

  root.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const person = users.find((row) => row.id === button.getAttribute('data-edit-user'));
      if (person) openMemberEditor(root, supabase, person, families);
    });
  });

  root.querySelector('#edit-member-close')?.addEventListener('click', () => {
    if (memberIdFromHash()) {
      window.location.hash = '#/admin';
      return;
    }
    root.querySelector('#edit-member-card')?.classList.add('is-hidden');
  });
}

function memberIdFromHash() {
  const hash = window.location.hash || '';
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get('member') || '';
}

function openMemberEditorFromHash(root, supabase, users, families) {
  const id = memberIdFromHash();
  if (!id) return;
  const person = (users || []).find((row) => row.id === id);
  if (person) openMemberEditor(root, supabase, person, families);
}

function openMemberEditor(root, supabase, person, families) {
  const card = root.querySelector('#edit-member-card');
  const wrap = root.querySelector('#edit-member-form-wrap');
  const title = root.querySelector('#edit-member-title');
  if (!card || !wrap) return;

  title.textContent = `Edit ${person.full_name || person.email || 'member'}`;
  wrap.innerHTML = `
    <form id="edit-member-form">
      ${profileFieldsHtml(person, { prefix: `edit-${person.id}-`, families })}
      <button type="submit" class="btn-primary">Save changes</button>
    </form>
  `;
  card.classList.remove('is-hidden');
  bindProfileForm(wrap.querySelector('#edit-member-form'), {
    supabase,
    userId: person.id,
    onSaved: async () => {
      await renderAdminUI(root, { supabase });
    },
  });
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
