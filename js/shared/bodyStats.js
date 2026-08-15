import { setButtonBusy, showAlert } from '../services/uiService.js';
import { updatePersonBodyStats, setupErrorMessage } from './api.js';
import { parseDateOnly, personAgeYears, toDateInputValue } from './format.js';
import { escapeHtml } from './html.js';

export function parseBodyStats(form) {
  const dobRaw = form.querySelector('[name="date_of_birth"]')?.value.trim() ?? '';
  const weightRaw = form.querySelector('[name="weight_kg"]')?.value.trim() ?? '';

  let dateOfBirth = null;
  let weightKg = null;

  if (dobRaw !== '') {
    const dob = parseDateOnly(dobRaw);
    if (!dob) return { error: 'Enter a valid date of birth.' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dob > today) return { error: 'Date of birth cannot be in the future.' };
    const oldest = new Date();
    oldest.setFullYear(oldest.getFullYear() - 130);
    if (dob < oldest) return { error: 'Date of birth cannot be more than 130 years ago.' };
    dateOfBirth = toDateInputValue(dob);
  }

  if (weightRaw !== '') {
    weightKg = Number(weightRaw);
    if (!Number.isFinite(weightKg) || weightKg < 2 || weightKg > 400) {
      return { error: 'Weight must be between 2 and 400 kg.' };
    }
  }

  return { dateOfBirth, weightKg };
}

export function bodyStatsFieldsHtml(person = {}, { prefix = '' } = {}) {
  const dob = toDateInputValue(person.date_of_birth);
  const weight = person.weight_kg ?? '';
  const dobId = `${prefix}date-of-birth`;
  const weightId = `${prefix}weight-kg`;
  const age = personAgeYears(person);
  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="${escapeHtml(dobId)}">Date of birth</label>
        <input type="date" id="${escapeHtml(dobId)}" name="date_of_birth" class="form-input" max="${escapeHtml(toDateInputValue(new Date()))}" value="${escapeHtml(dob)}">
        ${age != null ? `<p class="form-hint muted">${age} year${age === 1 ? '' : 's'} old</p>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label" for="${escapeHtml(weightId)}">Weight (kg)</label>
        <input type="number" id="${escapeHtml(weightId)}" name="weight_kg" class="form-input" min="2" max="400" step="0.1" inputmode="decimal" value="${escapeHtml(weight)}">
      </div>
    </div>
  `;
}

export function bindBodyStatsForm(form, { supabase, userId, onSaved }) {
  if (!form) return;
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const parsed = parseBodyStats(form);
    if (parsed.error) {
      showAlert(parsed.error, 'error');
      return;
    }

    setButtonBusy(submit, true, 'Saving…');
    try {
      await updatePersonBodyStats(supabase, {
        userId,
        dateOfBirth: parsed.dateOfBirth,
        weightKg: parsed.weightKg,
      });
      showAlert('Date of birth and weight saved. Insights will use these ranges.', 'success');
      if (onSaved) await onSaved({ date_of_birth: parsed.dateOfBirth, weight_kg: parsed.weightKg });
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
    } finally {
      setButtonBusy(submit, false, 'Save');
    }
  });
}
