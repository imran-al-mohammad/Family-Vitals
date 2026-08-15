import { setButtonBusy, showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import {
  classifyReading,
  formatDate,
  formatPersonStats,
  formatReadingValue,
  formatTypeLabel,
} from '../../shared/format.js';
import {
  fetchFamilyMembers,
  fetchReadingsForUsers,
  insertReading,
  setupErrorMessage,
} from '../../shared/api.js';
import { bindBodyStatsForm, bodyStatsFieldsHtml } from '../../shared/bodyStats.js';

export async function renderReadingsUI(root, { user, profile, supabase }) {
  let members = [];
  try {
    members = await fetchFamilyMembers(supabase, profile?.family_id);
  } catch {
    members = [];
  }
  const people = membersForPicker(user, profile, members);
  const canChooseMember = people.length > 1;
  const preferredId = memberIdFromHash();
  const selectedId = people.some((person) => person.id === preferredId) ? preferredId : user.id;

  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <div>
          <p class="eyebrow">Vitals</p>
          <h1 class="view-title">Readings</h1>
        </div>
      </header>

      <div class="card" id="reading-stats-card"></div>

      <div class="card">
        <h2 class="section-title">Log a reading</h2>
        <form id="reading-form" class="reading-form">
          ${
            canChooseMember
              ? `<div class="form-group">
                  <label class="form-label" for="reading-member">Family member</label>
                  <select id="reading-member" class="form-input">
                    ${people
                      .map(
                        (person) =>
                          `<option value="${escapeHtml(person.id)}" ${person.id === selectedId ? 'selected' : ''}>${escapeHtml(memberLabel(person, user.id))}</option>`,
                      )
                      .join('')}
                  </select>
                </div>`
              : ''
          }
          <div class="form-group">
            <label class="form-label" for="reading-type">Type</label>
            <select id="reading-type" class="form-input">
              <option value="bp">Blood pressure</option>
              <option value="pulse">Pulse</option>
              <option value="blood-sugar">Blood sugar</option>
            </select>
          </div>

          <div id="bp-fields" class="field-set">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="systolic">Systolic (mmHg)</label>
                <input type="number" id="systolic" class="form-input" min="60" max="250" inputmode="numeric">
              </div>
              <div class="form-group">
                <label class="form-label" for="diastolic">Diastolic (mmHg)</label>
                <input type="number" id="diastolic" class="form-input" min="40" max="150" inputmode="numeric">
              </div>
            </div>
          </div>

          <div id="pulse-fields" class="field-set is-hidden">
            <div class="form-group">
              <label class="form-label" for="pulse-value">Pulse (bpm)</label>
              <input type="number" id="pulse-value" class="form-input" min="40" max="200" inputmode="numeric">
            </div>
          </div>

          <div id="sugar-fields" class="field-set is-hidden">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="sugar-value">Value</label>
                <input type="number" id="sugar-value" class="form-input" min="1" max="500" step="0.1" inputmode="decimal">
              </div>
              <div class="form-group">
                <label class="form-label" for="sugar-unit">Unit</label>
                <select id="sugar-unit" class="form-input">
                  <option value="mg/dL">mg/dL</option>
                  <option value="mmol/L">mmol/L</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="sugar-context">Context</label>
              <select id="sugar-context" class="form-input">
                <option value="fasting">Fasting</option>
                <option value="after-meal">After meal</option>
                <option value="random">Random</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="reading-when-mode">When</label>
            <select id="reading-when-mode" class="form-input">
              <option value="now">Just now</option>
              <option value="past">A previous date and time</option>
            </select>
          </div>
          <div id="reading-when-fields" class="form-group is-hidden">
            <label class="form-label" for="reading-when">Date and time</label>
            <input type="datetime-local" id="reading-when" class="form-input">
            <p class="form-hint muted">Use this to add historical readings from a notebook, clinic visit, or earlier today.</p>
          </div>

          <div class="form-group">
            <label class="form-label" for="reading-notes">Notes (optional)</label>
            <textarea id="reading-notes" class="form-input form-textarea" rows="2" maxlength="500" placeholder="Any notes…"></textarea>
          </div>

          <button type="submit" class="btn-primary" id="reading-submit">Log reading</button>
        </form>
      </div>

      <section class="section" id="history-section">
        <h2 class="section-title">History</h2>
        <p class="empty-state" id="history-status">Loading history…</p>
        <div class="table-wrap is-hidden" id="history-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="history-body"></tbody>
          </table>
        </div>
      </section>
    </section>
  `;

  const typeSelect = root.querySelector('#reading-type');
  const memberSelect = root.querySelector('#reading-member');
  const whenMode = root.querySelector('#reading-when-mode');
  const whenFields = root.querySelector('#reading-when-fields');
  const whenInput = root.querySelector('#reading-when');
  const form = root.querySelector('#reading-form');
  const submit = root.querySelector('#reading-submit');
  const namesById = Object.fromEntries(
    people.map((person) => [person.id, memberLabel(person, user.id)]),
  );

  const selectedMemberId = () => memberSelect?.value || user.id;
  const selectedPerson = () => people.find((person) => person.id === selectedMemberId()) || people[0];

  const paintStatsForm = () => {
    const card = root.querySelector('#reading-stats-card');
    const person = selectedPerson();
    if (!card || !person) return;
    const stats = formatPersonStats(person);
    card.innerHTML = `
      <h2 class="section-title">Age &amp; weight</h2>
      <p class="muted mb-4">${
        stats
          ? `Readings for this person are judged using ${escapeHtml(stats)}.`
          : 'Add age and weight so alerts and insights use the right ranges for this person.'
      }</p>
      <form id="reading-stats-form">
        ${bodyStatsFieldsHtml(person, { prefix: 'reading-' })}
        <button type="submit" class="btn-secondary">Save</button>
      </form>
    `;
    bindBodyStatsForm(card.querySelector('#reading-stats-form'), {
      supabase,
      userId: person.id,
      onSaved: async (next) => {
        Object.assign(person, next);
        paintStatsForm();
        await renderHistory(root, supabase, person.id, namesById, person);
      },
    });
  };

  const toggleFields = () => {
    const type = typeSelect.value;
    root.querySelector('#bp-fields').classList.toggle('is-hidden', type !== 'bp');
    root.querySelector('#pulse-fields').classList.toggle('is-hidden', type !== 'pulse');
    root.querySelector('#sugar-fields').classList.toggle('is-hidden', type !== 'blood-sugar');
  };

  const toggleWhenFields = () => {
    const past = whenMode.value === 'past';
    whenFields.classList.toggle('is-hidden', !past);
    whenInput.required = past;
    if (past && !whenInput.value) {
      whenInput.value = toDateTimeLocalValue();
    }
    whenInput.max = toDateTimeLocalValue();
  };

  typeSelect.addEventListener('change', toggleFields);
  whenMode.addEventListener('change', toggleWhenFields);
  toggleFields();
  toggleWhenFields();

  memberSelect?.addEventListener('change', async () => {
    paintStatsForm();
    await renderHistory(root, supabase, selectedMemberId(), namesById, selectedPerson());
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const memberId = selectedMemberId();
    if (!people.some((person) => person.id === memberId)) {
      showAlert('Choose a family member.', 'error');
      return;
    }

    const payload = buildReadingPayload(root, memberId, user.id);
    if (payload.error) {
      showAlert(payload.error, 'error');
      return;
    }

    setButtonBusy(submit, true, 'Saving…');
    try {
      await insertReading(supabase, payload.data);
    } catch (error) {
      setButtonBusy(submit, false, 'Log reading');
      showAlert(setupErrorMessage(error), 'error');
      return;
    }
    setButtonBusy(submit, false, 'Log reading');

    const who = namesById[memberId] || 'this member';
    const status = classifyReading(payload.data, selectedPerson());
    if (status.key === 'danger') {
      showAlert(`Logged for ${who}. ${formatTypeLabel(payload.data.type)} is ${status.label.toLowerCase()}.`, 'error');
    } else if (status.key === 'warning') {
      showAlert(`Logged for ${who}. ${formatTypeLabel(payload.data.type)} is ${status.label.toLowerCase()}.`, 'warning');
    } else {
      showAlert(`Reading logged for ${who}.`, 'success');
    }
    form.reset();
    if (memberSelect) memberSelect.value = memberId;
    typeSelect.value = 'bp';
    whenMode.value = 'now';
    whenInput.value = '';
    toggleFields();
    toggleWhenFields();
    await renderHistory(root, supabase, memberId, namesById, selectedPerson());
  });

  root.querySelector('#history-body').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-id]');
    if (!button) return;
    const id = button.getAttribute('data-delete-id');
    if (!window.confirm('Delete this reading?')) return;
    const { error } = await supabase.from('readings').delete().eq('id', id);
    if (error) {
      showAlert(setupErrorMessage(error), 'error');
      return;
    }
    showAlert('Reading deleted.', 'success');
    await renderHistory(root, supabase, selectedMemberId(), namesById, selectedPerson());
  });

  paintStatsForm();
  await renderHistory(root, supabase, selectedMemberId(), namesById, selectedPerson());
}

function memberIdFromHash() {
  const hash = window.location.hash || '';
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query).get('member') || '';
}

function membersForPicker(user, profile, members) {
  const list = [...(members || [])];
  if (!list.some((person) => person.id === user.id)) {
    list.unshift({
      id: user.id,
      full_name: profile?.full_name || user.user_metadata?.full_name || '',
      email: user.email,
      age_years: profile?.age_years ?? null,
      weight_kg: profile?.weight_kg ?? null,
    });
  }
  return list.sort((a, b) => {
    if (a.id === user.id) return -1;
    if (b.id === user.id) return 1;
    return String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''));
  });
}

function memberLabel(person, currentUserId) {
  const name = person.full_name || person.email || 'Unknown';
  return person.id === currentUserId ? `${name} (you)` : name;
}

function toDateTimeLocalValue(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readingTimestamp(root) {
  const mode = root.querySelector('#reading-when-mode')?.value || 'now';
  if (mode !== 'past') return { iso: null };

  const raw = root.querySelector('#reading-when')?.value;
  if (!raw) return { error: 'Choose the date and time of this reading.' };

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: 'Enter a valid date and time.' };

  const now = Date.now();
  if (date.getTime() > now + 60 * 1000) {
    return { error: 'Reading time cannot be in the future.' };
  }

  const oldest = new Date();
  oldest.setFullYear(oldest.getFullYear() - 30);
  if (date < oldest) {
    return { error: 'Reading time cannot be more than 30 years ago.' };
  }

  return { iso: date.toISOString() };
}

function buildReadingPayload(root, userId, loggedBy) {
  const type = root.querySelector('#reading-type').value;
  const notes = root.querySelector('#reading-notes').value.trim();
  const when = readingTimestamp(root);
  if (when.error) return { error: when.error };

  const data = { user_id: userId, type, logged_by: loggedBy };
  if (notes) data.notes = notes;
  if (when.iso) data.created_at = when.iso;

  if (type === 'bp') {
    const systolic = Number(root.querySelector('#systolic').value);
    const diastolic = Number(root.querySelector('#diastolic').value);
    if (!systolic || !diastolic) return { error: 'Enter both systolic and diastolic values.' };
    if (systolic < 60 || systolic > 250) return { error: 'Systolic must be between 60 and 250.' };
    if (diastolic < 40 || diastolic > 150) return { error: 'Diastolic must be between 40 and 150.' };
    if (systolic <= diastolic) return { error: 'Systolic must be greater than diastolic.' };
    data.systolic = systolic;
    data.diastolic = diastolic;
    return { data };
  }

  if (type === 'pulse') {
    const bpm = Number(root.querySelector('#pulse-value').value);
    if (!bpm) return { error: 'Enter a pulse value.' };
    if (bpm < 40 || bpm > 200) return { error: 'Pulse must be between 40 and 200 bpm.' };
    data.bpm = bpm;
    return { data };
  }

  if (type === 'blood-sugar') {
    const value = Number(root.querySelector('#sugar-value').value);
    const unit = root.querySelector('#sugar-unit').value;
    const context = root.querySelector('#sugar-context').value;
    if (!value) return { error: 'Enter a blood sugar value.' };
    const mgDl = unit === 'mmol/L' ? value * 18 : value;
    if (mgDl < 50 || mgDl > 500) return { error: 'Blood sugar is outside the accepted range.' };
    data.value = value;
    data.unit = unit;
    data.context = context;
    return { data };
  }

  return { error: 'Choose a reading type.' };
}

async function renderHistory(root, supabase, userId, namesById = {}, person = null) {
  const status = root.querySelector('#history-status');
  const wrap = root.querySelector('#history-wrap');
  const body = root.querySelector('#history-body');
  const heading = root.querySelector('#history-section .section-title');
  const personName = namesById[userId];
  if (heading) heading.textContent = personName ? `History · ${personName}` : 'History';

  try {
    const readings = await fetchReadingsForUsers(supabase, [userId], 200);
    if (readings.length === 0) {
      wrap.classList.add('is-hidden');
      status.classList.remove('is-hidden');
      status.textContent = personName
        ? `No readings yet for ${personName}.`
        : 'No readings yet. Log your first reading above.';
      return;
    }

    status.classList.add('is-hidden');
    wrap.classList.remove('is-hidden');
    body.innerHTML = readings
      .map((reading) => {
        const statusChip = classifyReading(reading, person);
        return `
          <tr>
            <td>${escapeHtml(formatTypeLabel(reading.type))}</td>
            <td>
              ${escapeHtml(formatReadingValue(reading))}
              <span class="status-chip ${statusChip.key}">${escapeHtml(statusChip.label)}</span>
            </td>
            <td>
              ${escapeHtml(formatDate(reading.created_at))}
              ${
                reading.logged_by && reading.logged_by !== reading.user_id && namesById[reading.logged_by]
                  ? `<div class="muted">Logged by ${escapeHtml(namesById[reading.logged_by])}</div>`
                  : ''
              }
            </td>
            <td><button type="button" class="btn-text" data-delete-id="${escapeHtml(reading.id)}">Delete</button></td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    wrap.classList.add('is-hidden');
    status.classList.remove('is-hidden');
    status.textContent = setupErrorMessage(error);
  }
}
