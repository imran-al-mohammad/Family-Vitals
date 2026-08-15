import { setButtonBusy, showAlert } from '../services/uiService.js';
import { updatePersonProfile, setupErrorMessage } from './api.js';
import { parseBodyStats, bodyStatsFieldsHtml } from './bodyStats.js';
import { escapeHtml } from './html.js';

export function parseProfileForm(form, { requireName = true } = {}) {
  const fullName = form.querySelector('[name="full_name"]')?.value.trim() ?? '';
  const email = form.querySelector('[name="email"]')?.value.trim() ?? '';
  const password = form.querySelector('[name="new_password"]')?.value ?? '';
  const familyField = form.querySelector('[name="family_id"]');
  const stats = parseBodyStats(form);
  if (stats.error) return stats;

  if (requireName && !fullName) return { error: 'Name is required.' };
  if (email && !email.includes('@')) return { error: 'A valid email is required.' };
  if (password && password.length < 6) return { error: 'Password must be at least 6 characters.' };

  return {
    fullName,
    email,
    password,
    dateOfBirth: stats.dateOfBirth,
    weightKg: stats.weightKg,
    familyId: familyField ? familyField.value || null : undefined,
    setFamily: Boolean(familyField),
  };
}

export function profileFieldsHtml(person = {}, { prefix = '', families = null, showPassword = true } = {}) {
  const nameId = `${prefix}full-name`;
  const emailId = `${prefix}email`;
  const passwordId = `${prefix}new-password`;
  const familyId = `${prefix}family`;
  return `
    <div class="form-group">
      <label class="form-label" for="${escapeHtml(nameId)}">Full name</label>
      <input type="text" id="${escapeHtml(nameId)}" name="full_name" class="form-input" autocomplete="name" required value="${escapeHtml(person.full_name || '')}">
    </div>
    <div class="form-group">
      <label class="form-label" for="${escapeHtml(emailId)}">Email</label>
      <input type="email" id="${escapeHtml(emailId)}" name="email" class="form-input" autocomplete="email" required value="${escapeHtml(person.email || '')}">
    </div>
    ${bodyStatsFieldsHtml(person, { prefix })}
    ${
      families
        ? `<div class="form-group">
            <label class="form-label" for="${escapeHtml(familyId)}">Family</label>
            <select id="${escapeHtml(familyId)}" name="family_id" class="form-input">
              <option value="">Unassigned</option>
              ${families
                .map(
                  (family) =>
                    `<option value="${escapeHtml(family.id)}" ${family.id === person.family_id ? 'selected' : ''}>${escapeHtml(family.name)}</option>`,
                )
                .join('')}
            </select>
          </div>`
        : ''
    }
    ${
      showPassword
        ? `<div class="form-group">
            <label class="form-label" for="${escapeHtml(passwordId)}">New password (optional)</label>
            <input type="password" id="${escapeHtml(passwordId)}" name="new_password" class="form-input" autocomplete="new-password" minlength="6" placeholder="Leave blank to keep the current password">
          </div>`
        : ''
    }
  `;
}

export function bindProfileForm(form, { supabase, userId, onSaved }) {
  if (!form) return;
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const parsed = parseProfileForm(form);
    if (parsed.error) {
      showAlert(parsed.error, 'error');
      return;
    }

    setButtonBusy(submit, true, 'Saving…');
    try {
      await updatePersonProfile(supabase, {
        userId,
        fullName: parsed.fullName,
        email: parsed.email,
        dateOfBirth: parsed.dateOfBirth,
        weightKg: parsed.weightKg,
        familyId: parsed.familyId,
        setFamily: parsed.setFamily,
        password: parsed.password,
      });
      showAlert('Profile saved.', 'success');
      const passwordInput = form.querySelector('[name="new_password"]');
      if (passwordInput) passwordInput.value = '';
      if (onSaved) {
        await onSaved({
          full_name: parsed.fullName,
          email: parsed.email,
          date_of_birth: parsed.dateOfBirth,
          weight_kg: parsed.weightKg,
          family_id: parsed.setFamily ? parsed.familyId : undefined,
        });
      }
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
    } finally {
      setButtonBusy(submit, false, 'Save');
    }
  });
}
