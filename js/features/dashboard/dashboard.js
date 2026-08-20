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
  numericValue,
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
  readingsInRange,
  trendForTypeRange,
} from '../../shared/insights.js';

export async function renderDashboard(root, ctx) {
  const { user, profile, supabase } = ctx;
  root.innerHTML = `<p class="empty-state">Loading dashboard…</p>`;

  try {
    const members = await fetchFamilyMembers(supabase, profile?.family_id);
    const people = peopleForDashboard(user, profile, members);

    // Fetch medicines for each family member
    const medicineIds = [];
    const memberMedMap = new Map();
    for (const member of members) {
      const { data: meds, error: medsError } = await supabase
        .from('medicines')
        .select('*')
        .eq('user_id', member.id);
      if (medsError) throw medsError;
      const medsList = meds || [];
      memberMedMap.set(member.id, medsList);
      medicineIds.push(...medsList.map((m) => m.id));
    }

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
    
    // Determine range window (default 30 days)
    const range = '30'; // Will be made interactive later
    const DAY = 24 * 60 * 60 * 1000;
    const rangeMs = {
      '7': 7 * DAY,
      '30': 30 * DAY,
      '90': 90 * DAY,
    }[range];
    const rangeStart = Date.now() - (rangeMs || 30 * DAY);
    const rangeEnd = Date.now();

    // Get in-range readings per type for sparklines
    const bpReadings = readingsInRange(ownReadings, rangeStart, rangeEnd).filter(
      (r) => r.type === 'bp',
    );
    const pulseReadings = readingsInRange(ownReadings, rangeStart, rangeEnd).filter(
      (r) => r.type === 'pulse',
    );
    const sugarReadings = readingsInRange(ownReadings, rangeStart, rangeEnd).filter(
      (r) => r.type === 'blood-sugar',
    );

    const bpSparkline = renderSparklineSVG(bpReadings, 'bp');
    const pulseSparkline = renderSparklineSVG(pulseReadings, 'pulse');
    const sugarSparkline = renderSparklineSVG(sugarReadings, 'blood-sugar');

    // Compute trend direction markers
    const getTrendMarker = (type) => {
      const trend = trendForTypeRange(ownReadings, type, rangeStart, rangeEnd);
      if (!trend) return '<span class="trend-indicator steady">Steady</span>';
      return `<span class="trend-indicator ${trend.key}">${trend.label}</span>`;
    };
    
    // Attach medicines to person objects for alerts
    const peopleWithMeds = people.map((person) => ({
      ...person,
      medicines: memberMedMap.get(person.id) || [],
    }));
    
    const alerts = buildAlerts(peopleWithMeds, readingsByUser, { currentUserId: user.id });
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

        <div class="chart-section">
${renderRangeControls('30', () => {})}
          <div class="chart-container bp-chart">
            <svg class="sparkline" viewBox="0 0 100 40">${bpSparkline}</svg>
            <div class="chart-tooltip hidden"></div>
            ${getTrendMarker('bp')}
          </div>
          <div class="chart-container pulse-chart">
            <svg class="sparkline" viewBox="0 0 100 40">${pulseSparkline}</svg>
            <div class="chart-tooltip hidden"></div>
            ${getTrendMarker('pulse')}
          </div>
          <div class="chart-container sugar-chart">
            <svg class="sparkline" viewBox="0 0 100 40">${sugarSparkline}</svg>
            <div class="chart-tooltip hidden"></div>
            ${getTrendMarker('blood-sugar')}
          </div>
        </div>

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
         ${familySnapshot(profile, people, user.id, alerts, readingsByUser)}
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
          .map((alert) => {
            const href = alert.id?.endsWith('-stats')
              ? '#/profile'
              : alert.personId
                ? `#/readings?member=${encodeURIComponent(alert.personId)}`
                : '';
            const label = alert.id?.endsWith('-stats') ? 'Profile' : 'Review';
            return `
              <li class="alert-item">
                <span class="status-chip ${alert.severity}">${escapeHtml(severityLabel(alert.severity))}</span>
                <div>
                  <p class="alert-title">${escapeHtml(alert.title)}</p>
                  <p class="muted">${escapeHtml(alert.detail)}</p>
                </div>
                ${href ? `<a href="${href}" class="text-link">${label}</a>` : ''}
              </li>`;
          })
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

function renderSparklineSVG(readings, type, maxPoints = 30) {
  if (!readings || readings.length < 2) return '';

  const points = readings.length > maxPoints ? readings.slice(readings.length - maxPoints) : readings;

  let minVal = Infinity,
    maxVal = -Infinity;
  for (const reading of points) {
    let val;
    if (type === 'bp') {
      val = Math.max(Number(reading.systolic), Number(reading.diastolic));
    } else if (type === 'pulse') {
      val = Number(reading.bpm);
    } else {
      val = numericValue(reading);
    }
    if (!Number.isNaN(val)) {
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
  }
  if (minVal === maxVal) maxVal += 1;

  const chartWidth = points.length * 2 + 20;
  const chartHeight = 40;
  let d = '';

  for (let i = 0; i < points.length; i++) {
    const reading = points[i];
    const x = (i / Math.max(1, points.length - 1)) * (chartWidth - 20) + 10;
    let val;
    let y;
    if (type === 'bp') {
      val = Math.max(Number(reading.systolic), Number(reading.diastolic));
    } else if (type === 'pulse') {
      val = Number(reading.bpm);
    } else {
      val = numericValue(reading);
    }
    if (Number.isNaN(val)) continue;
    y = chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;
    if (i === 0) d += `M ${x} ${y}`;
    else d += ` L ${x} ${y}`;
  }

  if (!d) return '';
  return `<path d="${d}" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="1"/>`;
}

function renderRangeControls(selectedRange, onRangeChange) {
  return `
    <div class="chart-range">
      <button class="range-btn ${selectedRange === '7' ? 'active' : ''}" data-range="7">7d</button>
      <button class="range-btn ${selectedRange === '30' ? 'active' : ''}" data-range="30">30d</button>
      <button class="range-btn ${selectedRange === '90' ? 'active' : ''}" data-range="90">90d</button>
    </div>
  `;
}

function renderChartTooltip(e, readings, type) {
  const target = e.currentTarget;
  const rect = target.getBoundingClientRect();
  const clientX = e.clientX;
  const readingsSlice = readings.slice(-5).reverse();
  let html = '';
  for (const reading of readingsSlice) {
    let value;
    if (type === 'bp') {
      value = formatReadingValue(reading);
    } else if (type === 'pulse') {
      value = reading.bpm ? String(reading.bpm) + ' bpm' : '—';
    } else {
      value = formatReadingValue(reading);
    }
    const date = formatDate(reading.created_at);
    html += `<div class="tooltip-row"><span class="muted">${date}</span> <span class="value">${escapeHtml(value)}</span></div>`;
  }
  let tooltip = target.querySelector('.chart-tooltip');
  if (!tooltip) {
    const newTooltip = document.createElement('div');
    newTooltip.className = 'chart-tooltip';
    newTooltip.innerHTML = html;
    target.appendChild(newTooltip);
    tooltip = newTooltip;
  }
  tooltip.classList.add('visible');
  const tooltipRect = tooltip.getBoundingClientRect();
  let left = clientX - tooltipRect.width / 2;
  if (left < rect.left) left = rect.left;
  if (left + tooltipRect.width > rect.right) left = rect.right - tooltipRect.width;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${rect.top - tooltipRect.height - 4}px`;
}

function clearChartTooltips() {
  const tooltips = document.querySelectorAll('.chart-tooltip');
  tooltips.forEach((t) => t.remove());
}

function familySnapshot(profile, people, userId, alerts, readingsByUser) {
  if (!profile?.family_id) return '';

  const others = people.filter((person) => person.id !== userId);
  if (others.length === 0) return '';

  const latestReadingsByUser = {};
  for (const person of others) {
    const personReadings = readingsByUser[person.id] || [];
    if (personReadings.length > 0) {
      latestReadingsByUser[person.id] = personReadings[0]; // newest first
    }
  }

  if (Object.keys(latestReadingsByUser).length === 0) return '';

  const parts = [];
  for (const [personId, reading] of Object.entries(latestReadingsByUser)) {
    const person = people.find((p) => p.id === personId);
    if (!person) continue;

    const name = personName(person, userId);
    const type = reading.type;
    const value = reading.type === 'bp'
      ? `${reading.systolic}/${reading.diastolic}`
      : reading.type === 'pulse'
        ? String(reading.bpm)
        : formatReadingValue(reading).split(' · ')[0];

    const status = classifyReading(reading, person);
    parts.push(`
      <div class="family-snapshot person-reading">
        <span class="muted">${escapeHtml(name)}</span>
        <span class="value">${escapeHtml(value)}</span>
        <span class="status-chip ${status.key}">${escapeHtml(status.label)}</span>
      </div>
    `);
  }

  return `
    <div class="family-snapshot">
      ${parts.join('')}
    </div>
  `;
}
