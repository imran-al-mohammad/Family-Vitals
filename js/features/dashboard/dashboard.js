import { showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import {
  classifyReading,
  formatDate,
  formatPersonStats,
  formatReadingValue,
  formatTypeLabel,
  hasBodyStats,
  latestByType,
  readingUnit,
} from '../../shared/format.js';
import {
  fetchFamilyMembers,
  fetchReadingsForUsers,
  setupErrorMessage,
} from '../../shared/api.js';
import {
  alertsForPerson,
  buildAlerts,
  buildPersonInsights,
  groupReadingsByUser,
  personName,
} from '../../shared/insights.js';
import { bindProfileForm, profileFieldsHtml } from '../../shared/profileForm.js';

export async function renderDashboard(root, ctx) {
  const { user, profile, supabase } = ctx;
  root.innerHTML = `<p class="empty-state">Loading dashboard…</p>`;

  try {
    const members = await fetchFamilyMembers(supabase, profile?.family_id);
    const people = peopleForDashboard(user, profile, members);
    const allReadings = await fetchReadingsForUsers(
      supabase,
      people.map((person) => person.id),
      500,
    );
    const readingsByUser = groupReadingsByUser(allReadings);
    const ownReadings = readingsByUser[user.id] || [];
    const self = people.find((person) => person.id === user.id) || profile;
    const latest = latestByType(ownReadings);
    const insights = buildPersonInsights(ownReadings, self);
    const alerts = buildAlerts(people, readingsByUser, { currentUserId: user.id });
    const weekHousehold = allReadings.filter(
      (reading) => Date.now() - new Date(reading.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000,
    ).length;

    root.innerHTML = `
      <section class="view">
        <header class="view-header">
          <div>
            <p class="eyebrow">Overview</p>
            <h1 class="view-title">Dashboard</h1>
          </div>
          <a href="#/readings" class="btn-primary">Log reading</a>
        </header>

        ${alertsSection(alerts)}

        <div class="metric-grid">
          ${metricCard('bp', latest.bp, self)}
          ${metricCard('pulse', latest.pulse, self)}
          ${metricCard('blood-sugar', latest['blood-sugar'], self)}
        </div>

        <section class="section">
          <div class="card">
            <div class="section-heading">
              <h2 class="section-title">Your profile</h2>
              <a href="#/profile" class="text-link">Open profile</a>
            </div>
            <p class="muted mb-4">Name, email, date of birth, and weight. Birth date and weight change how your readings are judged.</p>
            <form id="own-profile-form">
              ${profileFieldsHtml(self, { prefix: 'own-' })}
              <button type="submit" class="btn-primary">Save profile</button>
            </form>
          </div>
        </section>

        <section class="section">
          <div class="section-heading">
            <h2 class="section-title">Insights</h2>
            <p class="muted">${insights.weekCount} reading${insights.weekCount === 1 ? '' : 's'} this week${
              insights.statsLabel ? ` · ${insights.statsLabel}` : ''
            }${!insights.personalized ? ' · general adult ranges' : ''}</p>
          </div>
          <div class="metric-grid">
            ${insightCard('Blood pressure', insights.types.bp, '7-day average')}
            ${insightCard('Pulse', insights.types.pulse, '7-day average')}
            ${insightCard('Blood sugar', insights.types['blood-sugar'], '7-day average')}
            ${countCard(insights, weekHousehold, people.length)}
          </div>
        </section>

        <section class="section">
          <div class="section-heading">
            <h2 class="section-title">Family</h2>
            <a href="#/family" class="text-link">Open family</a>
          </div>
          ${familySummary(profile, people, user.id, alerts)}
        </section>

        <section class="section">
          <div class="section-heading">
            <h2 class="section-title">History</h2>
            <a href="#/readings" class="text-link">Log or edit</a>
          </div>
          <div class="history-grid">
            ${people.map((person) => historyCard(person, readingsByUser[person.id] || [], user.id, alerts)).join('')}
          </div>
        </section>
      </section>
    `;

    bindProfileForm(root.querySelector('#own-profile-form'), {
      supabase,
      userId: user.id,
      onSaved: async (next) => {
        ctx.profile = { ...profile, ...next };
        const navUser = document.querySelector('.nav-user');
        if (navUser && next.full_name) navUser.textContent = next.full_name;
        await renderDashboard(root, ctx);
      },
    });
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(setupErrorMessage(error))}</p>`;
    showAlert(setupErrorMessage(error), 'error');
  }
}

function peopleForDashboard(user, profile, members) {
  const list = [...(members || [])];
  if (!list.some((person) => person.id === user.id)) {
    list.unshift({
      id: user.id,
      full_name: profile?.full_name || user.user_metadata?.full_name || '',
      email: user.email,
      date_of_birth: profile?.date_of_birth ?? null,
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

function alertsSection(alerts) {
  if (!alerts.length) return '';
  return `
    <section class="card alerts-card">
      <h2 class="section-title">Alerts</h2>
      <ul class="alert-list">
        ${alerts
          .map(
            (alert) => `
              <li class="alert-item">
                <span class="status-chip ${alert.severity}">${escapeHtml(severityLabel(alert.severity))}</span>
                <div>
                  <p class="alert-title">${escapeHtml(alert.title)}</p>
                  <p class="muted">${escapeHtml(alert.detail)}</p>
                </div>
                ${
                  alert.personId
                    ? `<a href="#/readings?member=${encodeURIComponent(alert.personId)}" class="text-link">Review</a>`
                    : ''
                }
              </li>`,
          )
          .join('')}
      </ul>
    </section>
  `;
}

function severityLabel(severity) {
  if (severity === 'danger') return 'Alert';
  if (severity === 'warning') return 'Watch';
  return 'Note';
}

function metricCard(type, reading, person) {
  const status = classifyReading(reading, person);
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

function insightCard(title, series, caption) {
  const value = series?.avg?.label || '—';
  const unit = series?.avg?.unit || '';
  const trend = series?.trend;
  const status = series?.status;
  const target = series?.target;
  const meta = [caption, target ? `target ${target}` : ''].filter(Boolean).join(' · ');
  return `
    <article class="metric-card">
      <p class="metric-label">${escapeHtml(title)}</p>
      <p class="metric-value">${escapeHtml(value)}</p>
      <p class="metric-label">${escapeHtml(unit)}</p>
      <p class="metric-meta">${escapeHtml(meta)}</p>
      <div class="chip-row">
        ${
          status
            ? `<span class="status-chip ${status.key}">${escapeHtml(status.label)}</span>`
            : ''
        }
        ${
          trend
            ? `<span class="status-chip ${trend.key === 'rising' ? 'warning' : 'unknown'}">${escapeHtml(trend.label)}</span>`
            : `<span class="status-chip unknown">Need more data</span>`
        }
      </div>
    </article>
  `;
}

function countCard(insights, householdWeek, householdSize) {
  return `
    <article class="metric-card">
      <p class="metric-label">Activity</p>
      <p class="metric-value">${insights.weekCount}</p>
      <p class="metric-label">your readings this week</p>
      <p class="metric-meta">${insights.monthCount} in 30 days${
        householdSize > 1 ? ` · ${householdWeek} household this week` : ''
      }</p>
    </article>
  `;
}

function familySummary(profile, people, userId, alerts) {
  if (!profile?.family_id) {
    return `<p class="empty-state">You are not in a family yet. <a href="#/family">Create one</a> or ask an admin to assign you.</p>`;
  }

  const others = people.filter((person) => person.id !== userId);
  if (others.length === 0) {
    return `<p class="empty-state">No other family members yet. An admin can assign people from the admin panel.</p>`;
  }

  const danger = alerts.filter((alert) => alert.severity === 'danger').length;
  const watch = alerts.filter((alert) => alert.severity === 'warning').length;

  return `
    <p class="muted">${others.length} other member${others.length === 1 ? '' : 's'} in your family.</p>
    <div class="chip-row">
      ${
        danger
          ? `<span class="status-chip danger">${danger} alert${danger === 1 ? '' : 's'}</span>`
          : ''
      }
      ${
        watch
          ? `<span class="status-chip warning">${watch} to watch</span>`
          : ''
      }
      ${!danger && !watch ? `<span class="status-chip success">No household alerts</span>` : ''}
    </div>
  `;
}

function historyCard(person, readings, currentUserId, alerts) {
  const name = personName(person, currentUserId);
  const recent = readings.slice(0, 6);
  const personAlerts = alertsForPerson(alerts, person.id);
  const top = personAlerts[0];

  return `
    <article class="family-card history-card">
      <div class="family-card-head">
        <div>
          <p class="family-name">${escapeHtml(name)}</p>
          <p class="muted">${readings.length} saved reading${readings.length === 1 ? '' : 's'}${
            formatPersonStats(person) ? ` · ${escapeHtml(formatPersonStats(person))}` : hasBodyStats(person) ? '' : ' · add date of birth & weight'
          }</p>
        </div>
        <a href="#/readings?member=${encodeURIComponent(person.id)}" class="text-link family-card-action">Full history</a>
      </div>
      ${
        top
          ? `<p class="history-alert"><span class="status-chip ${top.severity}">${escapeHtml(severityLabel(top.severity))}</span> <span class="muted">${escapeHtml(top.title)}</span></p>`
          : ''
      }
      ${
        recent.length === 0
          ? `<p class="empty-state">No history yet.</p>`
          : `<ul class="history-mini">
              ${recent
                .map((reading) => {
                  const status = classifyReading(reading, person);
                  return `<li>
                    <span>${escapeHtml(formatTypeLabel(reading.type))}</span>
                    <span>${escapeHtml(formatReadingValue(reading).split(' · ')[0])}</span>
                    <span class="status-chip ${status.key}">${escapeHtml(status.label)}</span>
                    <span class="muted">${escapeHtml(formatDate(reading.created_at))}</span>
                  </li>`;
                })
                .join('')}
            </ul>`
      }
    </article>
  `;
}
