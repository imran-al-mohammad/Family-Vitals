import { showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import { ensureProfile, setupErrorMessage } from '../../shared/api.js';
import { bindProfileForm, profileFieldsHtml } from '../../shared/profileForm.js';

export async function renderProfileUI(root, ctx) {
  const { user, supabase } = ctx;
  root.innerHTML = `<p class="empty-state">Loading profile…</p>`;

  try {
    const profile = await ensureProfile(supabase, user);
    ctx.profile = profile;

    root.innerHTML = `
      <section class="view">
        <header class="view-header">
          <div>
            <p class="eyebrow">Account</p>
            <h1 class="view-title">Your profile</h1>
          </div>
        </header>
        <div class="card profile-card">
          <p class="muted mb-4">These details are used on the dashboard and to interpret your readings. Age is calculated from date of birth.</p>
          <form id="profile-form">
            ${profileFieldsHtml(profile, { prefix: 'profile-' })}
            <button type="submit" class="btn-primary">Save profile</button>
          </form>
        </div>
      </section>
    `;

    bindProfileForm(root.querySelector('#profile-form'), {
      supabase,
      userId: user.id,
      onSaved: async (next) => {
        ctx.profile = { ...profile, ...next };
        const navUser = document.querySelector('.nav-user');
        if (navUser && next.full_name) navUser.textContent = next.full_name;
      },
    });
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(setupErrorMessage(error))}</p>`;
    showAlert(setupErrorMessage(error), 'error');
  }
}
