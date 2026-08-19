import { showAlert, setButtonBusy } from '../../services/uiService.js';
import { escapeHtml } from '../../shared/html.js';
import { formatDate } from '../../shared/format.js';
import {
  fetchFamilyMembers,
  setupErrorMessage,
} from '../../shared/api.js';

const DAY = 24 * 60 * 60 * 1000;

function computeDaysElapsed(startDate, lastDeductionAt, now = Date.now()) {
  const refDate = lastDeductionAt ? new Date(lastDeductionAt) : new Date(startDate);
  return Math.max(0, Math.floor((now - refDate.getTime()) / DAY));
}

function computeRemaining(
  remainingPieces,
  startDate,
  lastDeductionAt,
  piecesPerDose,
  dosesPerDay,
  now = Date.now()
) {
  const days = computeDaysElapsed(startDate, lastDeductionAt, now);
  const dailyConsumption = piecesPerDose * dosesPerDay;
  const consumed = days * dailyConsumption;
  return Math.max(0, remainingPieces - consumed);
}

function formatCadence(piecesPerDose, dosesPerDay) {
  if (dosesPerDay <= 1) {
    return `${piecesPerDose} piece${piecesPerDose === 1 ? '' : 's'} per day`;
  }
  return `${piecesPerDose} piece${piecesPerDose === 1 ? '' : 's'} per dose, ${dosesPerDay} per day`;
}

function getSeverity(remaining, piecesPerDose, dosesPerDay) {
  if (remaining <= 0) return 'danger';
  if (remaining <= piecesPerDose * dosesPerDay * 2) return 'warning';
  return 'success';
}

function renderMedicineCard(med, purchaseLogs, correctionLogs, user, profile, supabase) {
  const remaining = med.remaining_pieces;
  const isOutOfStock = remaining <= 0;
  const isLowStock = remaining > 0 && remaining <= med.pieces_per_dose * med.doses_per_day * 2;
  const severity = getSeverity(remaining, med.pieces_per_dose, med.doses_per_day);
  const daysLeft = med.days_left !== undefined ? med.days_left : null;

  // Calculate purchase total for this medicine
  const medPurchases = purchaseLogs.filter((pl) => pl.medicine_id === med.id);
  const totalStripsBought = medPurchases.reduce(
    (sum, pl) => sum + (pl.strip_bought || 0),
    0
  );
  const totalPiecesBought = medPurchases.reduce(
    (sum, pl) => sum + (pl.pieces_bought || 0),
    0
  );

  // Calculate correction total for this medicine
  const medCorrections = correctionLogs.filter(
    (cl) => cl.medicine_id === med.id
  ).length;

  const canEdit = med.user_id === user.id || profile?.is_super_admin;
  const canRemove = profile?.is_super_admin;

  return `
    <article class="family-card medicine-card">
      <div class="family-card-head">
        <div>
          <p class="family-name">${escapeHtml(med.medicine_name)}</p>
          <p class="muted">${formatCadence(
            med.pieces_per_dose,
            med.doses_per_day
          )}</p>
        </div>
        <div class="family-card-action">
          ${canRemove && profile?.is_super_admin
            ? `<button class="btn-text" onclick="return window.confirm('Remove this medicine?')">Remove</button>`
            : ''}
        </div>
      </div>

      <div class="metric-grid">
        <article class="metric-card">
          <p class="metric-label">Remaining</p>
          <p class="metric-value">${remaining}</p>
          <p class="metric-label">pieces</p>
        </article>
        ${daysLeft !== null && daysLeft > 0
          ? `<article class="metric-card">
              <p class="metric-label">Days left</p>
              <p class="metric-value">${daysLeft}</p>
              <p class="metric-label">${med.pieces_per_dose *
                med.doses_per_day} per day</p>
            </article>`
          : ''}
        <article class="metric-card">
          <p class="metric-label">Status</p>
          <p class="metric-value">
            <span class="status-chip ${severity}"
              >${severity === 'danger'
              ? 'Out of stock'
              : severity === 'warning'
                ? 'Low stock'
                : 'OK'}</span
            ></p>
        </article>
      </div>

      ${isOutOfStock || isLowStock
        ? `<p class="muted">${escapeHtml(med.notes || '')}</p>`
        : ''}

      ${remaining > 0
        ? `<div class="card">
            <h3 class="section-title">Log Purchase</h3>
            <form id="purchase-form-${med.id}" class="purchase-form">
              <input type="hidden" id="medicine-id-${med.id}" value="${med.id}">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label"
                    for="purchase-strips-${med.id}"
                  >Strips bought</label
                  ><input
                    type="number"
                    id="purchase-strips-${med.id}"
                    class="form-input"
                    min="0"
                    value="0"
                    inputmode="numeric"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label"
                    for="purchase-pieces-${med.id}"
                  >Pieces bought</label
                  ><input
                    type="number"
                    id="purchase-pieces-${med.id}"
                    class="form-input"
                    min="0"
                    value="0"
                    inputmode="numeric"
                  />
                </div>
              </div>
              <button type="submit" class="btn-primary">Log purchase</button>
            </form>
          </div>`
        : ''}

      ${remaining > 0
        ? `<div class="card">
            <h3 class="section-title">Correct Stock</h3>
            <form id="correct-stock-${med.id}" class="correct-stock-form">
              <input type="hidden" id="medicine-id-${med.id}" value="${med.id}">
              <div class="form-group">
                <label class="form-label"
                  >New remaining pieces</label
                  ><input
                    type="number"
                    id="new-remaining-${med.id}"
                    class="form-input"
                    min="0"
                    value="${remaining}"
                    inputmode="numeric"
                  />
                <p class="form-hint-muted"
                  >Manual correction. Auto-deduction will restart from today.</p
                >
              </div>
              <button type="submit" class="btn-primary">Apply correction</button>
            </form>
          </div>`
        : ''}

      <div class="card">
        <h3 class="section-title">Purchase History</h3>
        <p class="muted">
          Total bought: {totalStripsBought} strips, {totalPiecesBought} pieces
        </p>
        ${medCorrections > 0
          ? `<p class="muted">Corrections: ${medCorrections}</p>`
          : ''}
        <p class="muted">
          Remaining after auto-deduction: ${remaining} pieces
        </p>
      </div>
    </article>
  `;
}

function initPurchaseForm(supabase, profile, medicineId, root) {
  const form = root.querySelector(`#purchase-form-${medicineId}`);
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const strips = Number(
      document.getElementById(`purchase-strips-${medicineId}`).value
    );
    const pieces = Number(
      document.getElementById(`purchase-pieces-${medicineId}`).value
    );

    setButtonBusy(form.querySelector('button'), true, 'Logging…');

    try {
      const { error } = await supabase.from('purchase_log').insert({
        medicine_id: medicineId,
        strip_bought: strips,
        pieces_bought: pieces,
        purchased_at: new Date().toISOString(),
      });

      if (error) throw error;

      showAlert('Purchase logged.', 'success');

      // Auto-deduct: reduce remaining pieces by the daily cadence for elapsed days
      // Since this is a new purchase, we just add the pieces and let the
      // on-load deduction handle the time-based reduction
      const { data: med } = await supabase
        .from('medicines')
        .select('*')
        .eq('id', medicineId)
        .maybeSingle();

      if (med) {
        const remaining =
          med.remaining_pieces + pieces;
        const lastDed = med.last_deduction_at || med.start_date;
        const updatedRemaining = computeRemaining(
          remaining,
          med.start_date,
          lastDed,
          med.pieces_per_dose,
          med.doses_per_day
        );

        const { error: updateError } = await supabase
          .from('medicines')
          .update({
            remaining_pieces: updatedRemaining,
            last_deduction_at: new Date().toISOString(),
          })
          .eq('id', medicineId);

        if (updateError) throw updateError;
      }
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
    } finally {
      setButtonBusy(form.querySelector('button'), false, 'Log purchase');
    }

    // Re-render the medicines view
    const ctx = { user, profile, supabase };
    renderMedicinesUI(root, ctx);
  });
}

function initCorrectionForm(supabase, profile, medicineId, root) {
  const form = root.querySelector(`#correct-stock-${medicineId}`);
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const newRemaining = Number(
      document.getElementById(`new-remaining-${medicineId}`).value
    );

    setButtonBusy(form.querySelector('button'), true, 'Applying…');

    try {
      const med = await supabase
        .from('medicines')
        .select('*')
        .eq('id', medicineId)
        .maybeSingle();

      if (!med) throw new MedicineNotFound();

      const previousRemaining = med.remaining_pieces;

      // Record correction log
      const { error: logError } = await supabase.from(
        'stock_correction_log'
      ).insert({
        medicine_id: medicineId,
        previous_remaining: previousRemaining,
        new_remaining: newRemaining,
        reason: 'Manual correction',
        created_at: new Date().toISOString(),
      });

      if (logError) throw logError;

      // Update remaining pieces and reset deduction clock
      const { error: updateError } = await supabase.from('medicines').update(
        {
          remaining_pieces: newRemaining,
          last_deduction_at: new Date().toISOString(),
        }
      ).eq('id', medicineId);

      if (updateError) throw updateError;

      showAlert('Stock corrected.', 'success');
    } catch (error) {
      showAlert(setupErrorMessage(error), 'error');
    } finally {
      setButtonBusy(form.querySelector('button'), false, 'Apply correction');
    }

    // Re-render the medicines view
    const ctx = { user, profile, supabase };
    renderMedicinesUI(root, ctx);
  });
}

class MedicineNotFound extends Error {
  constructor() {
    super('Medicine not found');
    this.name = 'MedicineNotFound';
  }
}

export async function renderMedicinesUI(root, ctx) {
  const { user, profile, supabase } = ctx;
  let familyMembers = [];
  try {
    familyMembers = await fetchFamilyMembers(supabase, profile?.family_id);
  } catch {
    familyMembers = [];
  }

  // Load medicines
  let medicines = [];
  let purchaseLogs = [];
  let correctionLogs = [];
  try {
    const { data: meds, error: medsError } = await supabase
      .from('medicines')
      .select('*')
      .eq('family_id', profile?.family_id)
      .order('created_at', { ascending: false });
    if (medsError) throw medsError;
    medicines = meds || [];

    const medicineIds = medicines.map((m) => m.id);
    if (medicineIds.length > 0) {
      const { data: allLogs, error: allLogsError } = await supabase
        .from('purchase_log')
        .select('*')
        .in('medicine_id', medicineIds);
      if (allLogsError) throw allLogsError;
      purchaseLogs = allLogs || [];

      const { data: allCorrections, error: corrError } = await supabase
        .from('stock_correction_log')
        .select('*')
        .in('medicine_id', medicineIds);
      if (corrError) throw corrError;
      correctionLogs = allCorrections || [];
    }
  } catch (error) {
    root.innerHTML = `<p class="empty-state">${escapeHtml(
      setupErrorMessage(error)
    )}</p>`;
    showAlert(setupErrorMessage(error), 'error');
    return;
  }

  // Calculate remaining for each medicine (with auto-deduction)
  const now = Date.now();
  const medicinesWithStatus = medicines.map((med) => {
    const lastDed = med.last_deduction_at || med.start_date;
    const remaining = computeRemaining(
      med.remaining_pieces,
      med.start_date,
      lastDed,
      med.pieces_per_dose,
      med.doses_per_day,
      now
    );

    const days =
      med.remaining_pieces > 0 && med.pieces_per_dose * med.doses_per_day > 0
        ? Math.max(
            0,
            Math.floor(
              (med.remaining_pieces /
                (med.pieces_per_dose * med.doses_per_day)) ||
                0
            )
          )
        : null;

    return {
      ...med,
      remaining_pieces: remaining,
      days_left: days > 0 ? days : null,
      auto_deducted:
        remaining < med.remaining_pieces || med.remaining_pieces !==
        (med.remaining_pieces || 0),
    };
  });

  // Render
  root.innerHTML = `
    <section class="view">
      <header class="view-header">
        <div>
          <p class="eyebrow">Medicines</p>
          <h1 class="view-title">Medicine Management</h1>
        </div>
      </header>

      <div class="card">
        <h2 class="section-title">Add Medicine</h2>
        <form id="medicine-form" class="medicine-form">
          <input type="hidden" id="medicine-edit-id">
          <div class="form-group">
            <label class="form-label" for="medicine-name">Medicine name</label>
            <input
              type="text"
              id="medicine-name"
              class="form-input"
              placeholder="e.g. Ibuprofen"
              required
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="pieces-per-strip"
              >Pieces per strip</label
            >
            <input
              type="number"
              id="pieces-per-strip"
              class="form-input"
              min="1"
              value="1"
              inputmode="numeric"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="pieces-per-dose"
              >Pieces per dose</label
            >
            <input
              type="number"
              id="pieces-per-dose"
              class="form-input"
              min="1"
              value="1"
              inputmode="numeric"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="doses-per-day">Doses per day</label>
            <input
              type="number"
              id="doses-per-day"
              class="form-input"
              min="1"
              value="1"
              inputmode="numeric"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="start-date">Start date</label>
            <input
              type="date"
              id="start-date"
              class="form-input"
              value="${new Date()
                .toISOString()
                .split('T')[0]}"
            />
          </div>
          <div class="form-group">
            <label class="form-label" for="end-date">End date (optional)</label>
            <input type="date" id="end-date" class="form-input" />
          </div>
          <div class="form-group">
            <label class="form-label" for="notes">Notes (optional)</label>
            <textarea
              id="notes"
              class="form-input form-textarea"
              rows="2"
              placeholder="Any notes…"
            ></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Family member</label>
            <select id="family-member" class="form-input">
              <option value="">All family members</option>
              ${familyMembers.map(
                (m) => `<option value="${m.id}">${escapeHtml(
                  m.full_name || m.email || 'Unknown'
                )}</option>`
              ).join('')}
            </select>
          </div>
          <button type="submit" class="btn-primary">
            ${medicines.length > 0 ? 'Update Medicine' : 'Add Medicine'}
          </button>
        </form>
      </div>

      ${medicines.length > 0
        ? `<section class="section" id="medicines-list">
            <h2 class="section-title">Medicines</h2>
            <div class="medicine-list">
${medicinesWithStatus.map((med) =>
                  renderMedicineCard(
                    med,
                    purchaseLogs,
                    correctionLogs,
                    user,
                    profile,
                    supabase
                  )
                ).join('')}
            </div>
          </section>`
        : `<p class="empty-state">No medicines yet. Add your first medicine above.</p>`}
    </section>
  `;

  // Initialize purchase and correction forms
  const medicineIds = medicines.map((m) => m.id);
  medicineIds.forEach((medId) => {
    initPurchaseForm(supabase, profile, medId, root);
    initCorrectionForm(supabase, profile, medId, root);
  });
}