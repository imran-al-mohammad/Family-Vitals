import { setButtonBusy, showAlert } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import {
  classifyReading,
  formatDate,
  formatPersonStats,
  formatReadingValue,
  formatTypeLabel,
  getInitials,
  latestByType,
} from '../../shared/format.js';
import {
  createFamilyForUser,
  ensureProfile,
  fetchFamilyMembers,
  fetchReadingsForUsers,
  setupErrorMessage,
} from '../../shared/api.js';
import {
  alertsForPerson,
  buildAlerts,
  groupReadingsByUser,
} from '../../shared/insights.js';
import { bindBodyStatsForm, bodyStatsFieldsHtml } from '../../shared/bodyStats.js';

export async function renderFamilyView(root, ctx) {
  const { user, supabase } = ctx;
  let { profile } = ctx;
  root.innerHTML = `<p class="empty-state">Loading family…</p>`;

  try {
    profile = await ensureProfile(supabase, user);
    ctx.profile = profile;

    if (!profile.family_id) {
      renderCreateFamily(root, ctx);
      return;
    }

    const members = await fetchFamilyMembers(supabase, profile.family_id);
    const readings = await fetchReadingsForUsers(
      supabase,
      members.map((member) => member.id),
      400,
    );
    const readingsByUser = groupReadingsByUser(readings);
    const byUser = groupLatest(readings);
    const alerts = buildAlerts(members, readingsByUser, { currentUserId: user.id });

    const { data: family } = await supabase
      .from('families')
      .select('id, name')
      .eq('id', profile.family_id)
      .maybeSingle();

    root.innerHTML = `
      <section class="view">
        <header class="view-header">
          <div>
            <p class="eyebrow">Household</p>
            <h1 class="view-title">${escapeHtml(family?.name || 'Your family')}</h1>
          </div>
        </header>
        ${
          members.length === 0
            ? `<p class="empty-state">No family members found.</p>`
            : `<div class="family-grid">${members
                .map((member) =>
                  memberCard(
                    member,
                    byUser[member.id] || {},
                    readingsByUser[member.id] || [],
                    alertsForPerson(alerts, member.id),
                  ),
                )
                .join('')}</div>`
        }
      </section>
    `;

    root.querySelectorAll('[data-stats-form]').forEach((form) => {
      bindBodyStatsForm(form, {
        supabase,
        userId: form.getAttribute('data-stats-form'),
        onSaved: async () => {
          await renderFamilyView(root, ctx);
        },
      });
    });
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(setupErrorMessage(error))}</p>`;
    showAlert(setupErrorMessage(error), 'error');
  }
}

function renderCreateFamily(root, ctx) {
  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <div>
          <p class="eyebrow">Household</p>
          <h1 class="view-title">Family</h1>
        </div>
      </header>
      <div class="card">
        <h2 class="section-title">Create a family</h2>
        <p class="muted mb-4">You are not in a family yet. Create one to start sharing readings, or ask an administrator to assign you.</p>
        <form id="create-family-form">
          <div class="form-group">
            <label for="family-name" class="form-label">Family name</label>
            <input type="text" id="family-name" class="form-input" placeholder="The Rivera family" maxlength="80" required>
          </div>
          <button type="submit" class="btn-primary" id="create-family-submit">Create family</button>
        </form>
      </div>
    </section>
  `;

  const form = root.querySelector('#create-family-form');
  const submit = root.querySelector('#create-family-submit');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setButtonBusy(submit, true, 'Creating…');
    try {
      await createFamilyForUser(ctx.supabase, root.querySelector('#family-name').value);
      ctx.profile = await ensureProfile(ctx.supabase, ctx.user);
      showAlert('Family created.', 'success');
      await renderFamilyView(root, ctx);
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
      setButtonBusy(submit, false, 'Create family');
    }
  });
}

function groupLatest(readings) {
  const grouped = {};
  for (const reading of readings) {
    if (!grouped[reading.user_id]) grouped[reading.user_id] = [];
    grouped[reading.user_id].push(reading);
  }
  const latest = {};
  for (const [userId, rows] of Object.entries(grouped)) {
    latest[userId] = latestByType(rows);
  }
  return latest;
}

function memberCard(member, latest, history, alerts) {
  const name = member.full_name || member.email || 'Unknown';
  const recent = (history || []).slice(0, 4);
  const topAlert = alerts?.[0];
  return `
    <article class="family-card">
      <div class="family-card-head">
        <div class="family-avatar">
          ${
            member.avatar
              ? `<img src="${escapeHtml(member.avatar)}" alt="">`
              : `<span class="avatar-initials">${escapeHtml(getInitials(name))}</span>`
          }
        </div>
        <div>
          <p class="family-name">${escapeHtml(name)}</p>
          <p class="muted">${member.is_super_admin ? 'Administrator' : 'Member'}${
            formatPersonStats(member) ? ` · ${escapeHtml(formatPersonStats(member))}` : ''
          }</p>
        </div>
        <a href="#/readings?member=${encodeURIComponent(member.id)}" class="text-link family-card-action">Log reading</a>
      </div>
      ${
        topAlert
          ? `<p class="history-alert"><span class="status-chip ${topAlert.severity}">${
              topAlert.severity === 'danger' ? 'Alert' : topAlert.severity === 'warning' ? 'Watch' : 'Note'
            }</span> <span class="muted">${escapeHtml(topAlert.title)}</span></p>`
          : ''
      }
      <div class="latest-readings-preview">
        ${previewRow('bp', latest.bp, member)}
        ${previewRow('pulse', latest.pulse, member)}
        ${previewRow('blood-sugar', latest['blood-sugar'], member)}
      </div>
      <div class="member-history">
        <div class="section-heading">
          <h3 class="mini-title">History</h3>
          <a href="#/readings?member=${encodeURIComponent(member.id)}" class="text-link">All</a>
        </div>
        ${
          recent.length === 0
            ? `<p class="muted">No readings yet.</p>`
            : `<ul class="history-mini">
                ${recent
                  .map((reading) => {
                    const status = classifyReading(reading, member);
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
      </div>
      <form class="member-stats-form" data-stats-form="${escapeHtml(member.id)}">
        <p class="mini-title">Age &amp; weight</p>
        ${bodyStatsFieldsHtml(member, { prefix: `member-${member.id}-` })}
        <button type="submit" class="btn-secondary">Save</button>
      </form>
    </article>
  `;
}

function previewRow(type, reading, person) {
  if (!reading) {
    return `<p class="reading-placeholder">${escapeHtml(formatTypeLabel(type))}: no reading</p>`;
  }
  const status = classifyReading(reading, person);
  return `
    <p class="reading-preview">
      <span>${escapeHtml(formatTypeLabel(type))}</span>
      <span>${escapeHtml(formatReadingValue(reading).split(' · ')[0])}</span>
      <span class="status-chip ${status.key}">${escapeHtml(status.label)}</span>
    </p>
  `;
}
