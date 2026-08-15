import { setButtonBusy, showAlert } from '../services/uiService.js';
import { updatePersonBodyStats, setupErrorMessage } from './api.js';
import { escapeHtml } from './html.js';

export function parseBodyStats(form) {
  const ageRaw = form.querySelector('[name="age_years"]')?.value.trim() ?? '';
  const weightRaw = form.querySelector('[name="weight_kg"]')?.value.trim() ?? '';

  let ageYears = null;
  let weightKg = null;

  if (ageRaw !== '') {
    ageYears = Number(ageRaw);
    if (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 130) {
      return { error: 'Age must be a whole number between 0 and 130.' };
    }
  }

  if (weightRaw !== '') {
    weightKg = Number(weightRaw);
    if (!Number.isFinite(weightKg) || weightKg < 2 || weightKg > 400) {
      return { error: 'Weight must be between 2 and 400 kg.' };
    }
  }

  return { ageYears, weightKg };
}

export function bodyStatsFieldsHtml(person = {}, { prefix = '' } = {}) {
  const age = person.age_years ?? '';
  const weight = person.weight_kg ?? '';
  const ageId = `${prefix}age-years`;
  const weightId = `${prefix}weight-kg`;
  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="${escapeHtml(ageId)}">Age (years)</label>
        <input type="number" id="${escapeHtml(ageId)}" name="age_years" class="form-input" min="0" max="130" step="1" inputmode="numeric" value="${escapeHtml(age)}">
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
        ageYears: parsed.ageYears,
        weightKg: parsed.weightKg,
      });
      showAlert('Age and weight saved. Insights will use these ranges.', 'success');
      if (onSaved) await onSaved({ age_years: parsed.ageYears, weight_kg: parsed.weightKg });
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
    } finally {
      setButtonBusy(submit, false, 'Save');
    }
  });
}
