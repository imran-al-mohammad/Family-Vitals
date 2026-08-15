import { showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import {
  classifyReading,
  formatDate,
  formatReadingValue,
  formatTypeLabel,
  latestByType,
  readingUnit,
} from '../../shared/format.js';
import {
  fetchFamilyMembers,
  fetchReadingsForUsers,
  setupErrorMessage,
} from '../../shared/api.js';

export async function renderDashboard(root, { user, profile, supabase }) {
  root.innerHTML = `<p class="empty-state">Loading dashboard…</p>`;

  try {
    const [ownReadings, members] = await Promise.all([
      fetchReadingsForUsers(supabase, [user.id], 50),
      fetchFamilyMembers(supabase, profile?.family_id),
    ]);

    const latest = latestByType(ownReadings);
    const memberIds = members.map((member) => member.id).filter((id) => id !== user.id);
    const familyReadings = memberIds.length
      ? await fetchReadingsForUsers(supabase, memberIds, 80)
      : [];
    const familyLatest = latestByType(familyReadings);

    root.innerHTML = `
      <section class="view">
        <header class="view-header">
          <div>
            <p class="eyebrow">Overview</p>
            <h1 class="view-title">Dashboard</h1>
          </div>
          <a href="#/readings" class="btn-primary">Log reading</a>
        </header>

        <div class="metric-grid">
          ${metricCard('bp', latest.bp)}
          ${metricCard('pulse', latest.pulse)}
          ${metricCard('blood-sugar', latest['blood-sugar'])}
        </div>

        <section class="section">
          <div class="section-heading">
            <h2 class="section-title">Family</h2>
            <a href="#/family" class="text-link">Open family</a>
          </div>
          ${familySummary(profile, members, familyLatest, user.id)}
        </section>
      </section>
    `;
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(setupErrorMessage(error))}</p>`;
    showAlert(setupErrorMessage(error), 'error');
  }
}

function metricCard(type, reading) {
  const status = classifyReading(reading);
  const value = reading ? formatReadingValue(reading) : '—';
  const unit = reading ? readingUnit(reading) : '';
  const when = reading ? formatDate(reading.created_at) : 'No readings yet';

  return `
    <article class="metric-card">
      <p class="metric-label">${escapeHtml(formatTypeLabel(type))}</p>
      <p class="metric-value">${escapeHtml(value.split(' · ')[0])}</p>
      <p class="metric-label">${escapeHtml(unit)}</p>
      <p class="metric-meta">${escapeHtml(when)}</p>
      <span class="status-chip ${status.key}">${escapeHtml(status.label)}</span>
    </article>
  `;
}

function familySummary(profile, members, familyLatest, userId) {
  if (!profile?.family_id) {
    return `<p class="empty-state">You are not in a family yet. <a href="#/family">Create one</a> or ask an admin to assign you.</p>`;
  }

  const others = members.filter((member) => member.id !== userId);
  if (others.length === 0) {
    return `<p class="empty-state">No other family members yet. An admin can assign people from the admin panel.</p>`;
  }

  const chips = ['bp', 'pulse', 'blood-sugar']
    .map((type) => {
      const reading = familyLatest[type];
      if (!reading) return '';
      return `<span class="status-chip ${classifyReading(reading).key}">${escapeHtml(formatTypeLabel(type))}: ${escapeHtml(formatReadingValue(reading).split(' · ')[0])}</span>`;
    })
    .filter(Boolean)
    .join('');

  return `
    <p class="muted">${others.length} other member${others.length === 1 ? '' : 's'} in your family.</p>
    <div class="chip-row">${chips || '<span class="muted">No family readings yet.</span>'}</div>
  `;
}
