import {
  classifyReading,
  formatDate,
  formatPersonStats,
  formatReadingValue,
  formatTypeLabel,
  hasBodyStats,
  latestByType,
  numericValue,
  personAgeYears,
  readingFromAverage,
  readingThresholds,
} from './format.js';

const DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 7;
const TYPES = ['bp', 'pulse', 'blood-sugar'];
const REFILL_SOON_DAYS = 3;

export function groupReadingsByUser(readings = []) {
  const grouped = {};
  for (const reading of readings) {
    const id = reading.user_id;
    if (!id) continue;
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(reading);
  }
  for (const rows of Object.values(grouped)) {
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return grouped;
}

export function personName(person, currentUserId) {
  const name = person?.full_name || person?.email || 'Unknown';
  return person?.id === currentUserId ? `${name} (you)` : name;
}

function mean(values) {
  const nums = values.filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function filterSince(readings, sinceMs) {
  return (readings || []).filter((reading) => {
    const time = new Date(reading.created_at).getTime();
    return !Number.isNaN(time) && time >= sinceMs;
  });
}

function inWindow(readings, startMs, endMs) {
  return (readings || []).filter((reading) => {
    const time = new Date(reading.created_at).getTime();
    return !Number.isNaN(time) && time >= startMs && time < endMs;
  });
}

export function averageForType(readings, type) {
  const rows = (readings || []).filter((reading) => reading.type === type);
  if (!rows.length) return null;

  if (type === 'bp') {
    const systolic = mean(rows.map((reading) => Number(reading.systolic)));
    const diastolic = mean(rows.map((reading) => Number(reading.diastolic)));
    if (systolic == null || diastolic == null) return null;
    return {
      label: `${Math.round(systolic)}/${Math.round(diastolic)}`,
      value: systolic,
    };
  }

  if (type === 'pulse') {
    const value = mean(rows.map((reading) => Number(reading.bpm)));
    if (value == null) return null;
    return { label: String(Math.round(value)), value };
  }

  const value = mean(rows.map((reading) => numericValue(reading)));
  if (value == null) return null;
  return { label: String(Math.round(value)), value, unit: 'mg/dL' };
}

export function trendForType(readings, type, now = Date.now()) {
  const recent = averageForType(inWindow(readings, now - 7 * DAY, now), type);
  const previous = averageForType(inWindow(readings, now - 14 * DAY, now - 7 * DAY), type);
  if (!recent || !previous) return null;

  const delta = recent.value - previous.value;
  const threshold = type === 'blood-sugar' ? 10 : 5;
  if (Math.abs(delta) < threshold) return { key: 'steady', label: 'Steady' };
  if (delta > 0) return { key: 'rising', label: 'Rising' };
  return { key: 'falling', label: 'Falling' };
}

export function buildPersonInsights(readings, person, now = Date.now()) {
  const week = filterSince(readings, now - 7 * DAY);
  const month = filterSince(readings, now - 30 * DAY);
  const limits = readingThresholds(person);
  const types = {};
  for (const type of TYPES) {
    const avg = averageForType(week, type);
    const synthetic = readingFromAverage(type, avg);
    types[type] = {
      avg,
      trend: trendForType(readings, type, now),
      status: synthetic ? classifyReading(synthetic, person) : null,
      target: type === 'bp' ? limits.bpTarget : type === 'pulse' ? limits.pulseTarget : null,
    };
  }
  return {
    weekCount: week.length,
    monthCount: month.length,
    personalized: limits.personalized,
    statsLabel: formatPersonStats(person),
    age: personAgeYears(person),
    types,
  };
}

export function buildAlerts(people, readingsByUser, { currentUserId, now = Date.now() } = {}) {
  const alerts = [];

  for (const person of people || []) {
    const name = personName(person, currentUserId);
    const rows = readingsByUser[person.id] || [];

    if (!hasBodyStats(person) && (rows.length > 0 || person.id === currentUserId)) {
      alerts.push({
        id: `${person.id}-stats`,
        severity: 'info',
        personId: person.id,
        title: `Add date of birth and weight for ${name}`,
        detail: 'Insights use general adult ranges until both are set.',
      });
    }

    if (rows.length === 0) continue;

    const newest = new Date(rows[0].created_at).getTime();
    if (!Number.isNaN(newest) && now - newest >= STALE_DAYS * DAY) {
      const days = Math.max(1, Math.floor((now - newest) / DAY));
      alerts.push({
        id: `${person.id}-stale`,
        severity: 'warning',
        personId: person.id,
        title: `${name} has no new readings in ${days} day${days === 1 ? '' : 's'}`,
        detail: `Last reading ${formatDate(rows[0].created_at)}.`,
      });
    }

    const latest = latestByType(rows);
    for (const type of TYPES) {
      const reading = latest[type];
      if (!reading) continue;
      const status = classifyReading(reading, person);
      if (status.key !== 'danger' && status.key !== 'warning') continue;

      const sameType = rows.filter((row) => row.type === type);
      const repeated =
        sameType.length >= 2 &&
        classifyReading(sameType[0], person).key === 'danger' &&
        classifyReading(sameType[1], person).key === 'danger';

      alerts.push({
        id: `${person.id}-${type}`,
        severity: status.key === 'danger' ? 'danger' : 'warning',
        personId: person.id,
        title: repeated
          ? `${name}: ${formatTypeLabel(type)} has been ${status.label.toLowerCase()} on the last two readings`
          : `${name}: ${formatTypeLabel(type)} is ${status.label.toLowerCase()}`,
        detail: `${formatReadingValue(reading)} · ${formatDate(reading.created_at)}`,
      });
    }
  }

  // Add medicine alerts
  for (const person of people || []) {
    const personMeds = (person.medicines || []).filter(
      (m) => m.status !== 'completed'
    );
    const now = Date.now();

    for (const med of personMeds) {
      const lastDed = med.last_deduction_at || med.start_date;
      const daysElapsed = Math.floor(
        (now - new Date(lastDed).getTime()) / DAY
      );
      const dailyConsumption = med.pieces_per_dose * med.doses_per_day;
      const remaining = Math.max(0, med.remaining_pieces - daysElapsed * dailyConsumption);

      // Low-stock alert
      if (remaining > 0 && remaining <= dailyConsumption * 2) {
        alerts.push({
          id: `${person.id}-med-low-stock-${med.id}`,
          severity: 'warning',
          personId: person.id,
          title: `Low stock for ${med.medicine_name}`,
          detail: `${remaining} pieces remaining (${Math.max(1, Math.ceil(remaining / dailyConsumption))} days left)`,
        });
      }

      // Out-of-stock alert
      if (remaining <= 0) {
        alerts.push({
          id: `${person.id}-med-out-stock-${med.id}`,
          severity: 'danger',
          personId: person.id,
          title: `Out of stock: ${med.medicine_name}`,
          detail: 'Remaining pieces have reached 0',
        });
      }

      // Refill-soon alert
      if (remaining > 0 && remaining <= dailyConsumption && daysElapsed > 0) {
        alerts.push({
          id: `${person.id}-med-refill-soon-${med.id}`,
          severity: 'info',
          personId: person.id,
          title: `Refill soon: ${med.medicine_name}`,
          detail: `${Math.max(1, Math.ceil(remaining / dailyConsumption))} day${
            Math.max(1, Math.ceil(remaining / dailyConsumption)) === 1 ? '' : 's'
          } left`,
        });
      }
    }
  }

  const rank = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  return alerts;
}

export function alertsForPerson(alerts, personId) {
  return (alerts || []).filter((alert) => alert.personId === personId);
}
