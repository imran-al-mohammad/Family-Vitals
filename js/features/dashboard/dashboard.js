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

const DAY = 24 * 60 * 60 * 1000;
const RANGE_MS = { '7': 7 * DAY, '30': 30 * DAY, '90': 90 * DAY };
const RANGE_LABEL = { '7': '7 days', '30': '30 days', '90': '90 days' };

export async function renderDashboard(root, ctx) {
  const { user, profile, supabase } = ctx;
  root.innerHTML = `<p class="empty-state">Loading dashboard…</p>`;

  try {
    const members = await fetchFamilyMembers(supabase, profile?.family_id);
    const people = peopleForDashboard(user, profile, members);

    // Fetch medicines for each family member
    const memberMedMap = new Map();
    for (const member of members) {
      const { data: meds, error: medsError } = await supabase
        .from('medicines')
        .select('*')
        .eq('user_id', member.id);
      if (medsError) throw medsError;
      memberMedMap.set(member.id, meds || []);
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

    // Attach medicines to person objects for alerts
    const peopleWithMeds = people.map((person) => ({
      ...person,
      medicines: memberMedMap.get(person.id) || [],
    }));

    const alerts = buildAlerts(peopleWithMeds, readingsByUser, { currentUserId: user.id });
    const weekHousehold = allReadings.filter(
      (reading) => Date.now() - new Date(reading.created_at).getTime() <= 7 * DAY,
    ).length;

    let range = '30';

    const render = () => {
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

          <div id="trends-mount">${renderTrendsSection(ownReadings, range)}</div>

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
    };

    const onRangeChange = (newRange) => {
      range = newRange;
      const mount = root.querySelector('#trends-mount');
      if (mount) {
        mount.innerHTML = renderTrendsSection(ownReadings, range);
        bindTrends(root, range, onRangeChange);
      }
    };

    render();
    bindTrends(root, range, onRangeChange);
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

/* ===== Trends section ===== */

function renderTrendsSection(readings, range) {
  const rangeStart = Date.now() - (RANGE_MS[range] || 30 * DAY);
  const rangeEnd = Date.now();
  const inRange = (type) =>
    readingsInRange(readings, rangeStart, rangeEnd).filter((r) => r.type === type);

  const bp = inRange('bp');
  const pulse = inRange('pulse');
  const sugar = inRange('blood-sugar');

  return `
    <section class="section trends-section">
      <div class="section-heading trends-heading">
        <h2 class="section-title">Trends</h2>
        <div class="chart-range" role="group" aria-label="Trend range">
          ${rangeBtn('7', range)}${rangeBtn('30', range)}${rangeBtn('90', range)}
        </div>
      </div>
      <div class="trend-grid">
        ${trendCard('Blood pressure', bp, 'bp', readings, range)}
        ${trendCard('Pulse', pulse, 'pulse', readings, range)}
        ${trendCard('Blood sugar', sugar, 'blood-sugar', readings, range)}
      </div>
    </section>
  `;
}

function rangeBtn(value, selected) {
  return `<button type="button" class="range-btn ${value === selected ? 'active' : ''}" data-range="${value}">${value}d</button>`;
}

function trendCard(title, chartReadings, type, allReadings, range) {
  const rangeStart = Date.now() - (RANGE_MS[range] || 30 * DAY);
  const rangeEnd = Date.now();
  const chart = renderTrendChart(chartReadings, type);
  const trend = trendForTypeRange(allReadings, type, rangeStart, rangeEnd);
  const latestReading = chartReadings[0];
  const status = latestReading ? classifyReading(latestReading, null) : null;
  const count = chartReadings.length;

  return `
    <article class="trend-card">
      <div class="trend-card-head">
        <p class="trend-title">${escapeHtml(title)}</p>
        ${status ? `<span class="status-chip ${status.key}">${escapeHtml(status.label)}</span>` : ''}
      </div>
      <div class="trend-chart-wrap">
        ${chart || trendEmpty(title)}
      </div>
      <div class="trend-card-foot">
        ${
          trend
            ? `<span class="trend-indicator ${trend.key}">${escapeHtml(trend.label)}</span>`
            : `<span class="trend-indicator unknown">Need more data</span>`
        }
        <span class="muted">${count} reading${count === 1 ? '' : 's'} · ${RANGE_LABEL[range] || range}</span>
      </div>
    </article>
  `;
}

function trendEmpty(title) {
  return `
    <div class="trend-empty">
      <p>No ${escapeHtml(title.toLowerCase())} readings in this range</p>
      <a href="#/readings" class="text-link">Log reading</a>
    </div>
  `;
}

function bindTrends(root, currentRange, onRangeChange) {
  const mount = root.querySelector('#trends-mount');
  if (!mount) return;
  mount.querySelectorAll('.range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const newRange = btn.dataset.range;
      if (newRange === currentRange) return;
      onRangeChange(newRange);
    });
  });
}

/* ===== Chart rendering (sparse-data friendly) ===== */

const CHART_W = 300;
const CHART_H = 140;
const CHART_PAD = 10;

function renderTrendChart(readings, type) {
  if (!readings || readings.length === 0) return '';

  const buildSeries = (getValue) => {
    const points = [];
    for (const reading of readings) {
      const time = new Date(reading.created_at).getTime();
      const value = getValue(reading);
      if (Number.isNaN(time) || value == null || Number.isNaN(value)) continue;
      points.push({ x: time, y: value });
    }
    return points;
  };

  let series;
  if (type === 'bp') {
    series = [
      { key: 'systolic', color: 'var(--color-danger)', points: buildSeries((r) => Number(r.systolic)) },
      { key: 'diastolic', color: 'var(--color-success)', points: buildSeries((r) => Number(r.diastolic)) },
    ];
  } else if (type === 'pulse') {
    series = [
      { key: 'pulse', color: 'var(--color-primary)', points: buildSeries((r) => Number(r.bpm)) },
    ];
  } else {
    series = [
      { key: 'sugar', color: 'var(--color-warning)', points: buildSeries((r) => numericValue(r)) },
    ];
  }

  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) return '';

  // Value range with padding
  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const p of allPoints) {
    if (p.y < minVal) minVal = p.y;
    if (p.y > maxVal) maxVal = p.y;
  }
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }
  const pad = (maxVal - minVal) * 0.12;
  minVal -= pad;
  maxVal += pad;

  // Time range
  const times = allPoints.map((p) => p.x);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const tRange = maxT - minT || 1;

  const xFor = (t) => CHART_PAD + ((t - minT) / tRange) * (CHART_W - 2 * CHART_PAD);
  const yFor = (v) => CHART_H - CHART_PAD - ((v - minVal) / (maxVal - minVal)) * (CHART_H - 2 * CHART_PAD);

  const gridLines = [CHART_H / 4, CHART_H / 2, (3 * CHART_H) / 4]
    .map((y) => `<line x1="${CHART_PAD}" y1="${y}" x2="${CHART_W - CHART_PAD}" y2="${y}" class="grid-line"/>`)
    .join('');

  // Single point → render a dot
  if (allPoints.length === 1) {
    const p = allPoints[0];
    const s = series.find((ser) => ser.points.includes(p)) || series[0];
    const cx = xFor(p.x).toFixed(1);
    const cy = yFor(p.y).toFixed(1);
    return `
      <svg class="trend-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(formatTypeLabel(type))} trend">
        ${gridLines}
        <circle cx="${cx}" cy="${cy}" r="4" class="trend-dot" style="stroke:${s.color}"/>
      </svg>
    `;
  }

  // Build paths
  const paths = series.map((s) => {
    if (s.points.length === 0) return '';
    let d = '';
    s.points.forEach((p, i) => {
      const x = xFor(p.x).toFixed(1);
      const y = yFor(p.y).toFixed(1);
      d += (i === 0 ? 'M' : ' L') + ` ${x} ${y}`;
    });
    return d;
  });

  const dots = series
    .flatMap((s) =>
      s.points.map((p) => {
        const cx = xFor(p.x).toFixed(1);
        const cy = yFor(p.y).toFixed(1);
        return `<circle cx="${cx}" cy="${cy}" r="2.5" class="trend-dot" style="stroke:${s.color}"/>`;
      }),
    )
    .join('');

  return `
    <svg class="trend-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(formatTypeLabel(type))} trend">
      ${gridLines}
      ${paths.map((d, i) => (d ? `<path d="${d}" class="trend-line" style="stroke:${series[i].color}"/>` : '')).join('')}
      ${dots}
    </svg>
  `;
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