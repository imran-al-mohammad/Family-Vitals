export function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatReadingValue(reading) {
  if (!reading) return '—';
  if (reading.type === 'bp') {
    if (reading.systolic == null || reading.diastolic == null) return '—';
    return `${reading.systolic}/${reading.diastolic}`;
  }
  if (reading.type === 'pulse') {
    return reading.bpm == null ? '—' : String(reading.bpm);
  }
  if (reading.type === 'blood-sugar') {
    if (reading.value == null) return '—';
    const unit = reading.unit ? ` ${reading.unit}` : '';
    const context = reading.context ? ` · ${formatContext(reading.context)}` : '';
    return `${reading.value}${unit}${context}`;
  }
  return '—';
}

export function formatTypeLabel(type) {
  if (type === 'bp') return 'Blood pressure';
  if (type === 'pulse') return 'Pulse';
  if (type === 'blood-sugar') return 'Blood sugar';
  return type || 'Reading';
}

export function formatContext(context) {
  if (context === 'after-meal') return 'After meal';
  if (context === 'fasting') return 'Fasting';
  if (context === 'random') return 'Random';
  return context || '';
}

export function readingUnit(reading) {
  if (reading?.type === 'bp') return 'mmHg';
  if (reading?.type === 'pulse') return 'bpm';
  if (reading?.type === 'blood-sugar') return reading.unit || '';
  return '';
}

export function sugarToMgDl(reading) {
  const value = Number(reading?.value);
  if (Number.isNaN(value)) return null;
  return reading.unit === 'mmol/L' ? value * 18 : value;
}

export function numericValue(reading) {
  if (!reading) return null;
  if (reading.type === 'bp') {
    const value = Number(reading.systolic);
    return Number.isNaN(value) ? null : value;
  }
  if (reading.type === 'pulse') {
    const value = Number(reading.bpm);
    return Number.isNaN(value) ? null : value;
  }
  if (reading.type === 'blood-sugar') return sugarToMgDl(reading);
  return null;
}

export function parseDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInputValue(value) {
  const date = parseDateOnly(value);
  if (!date) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function personAgeYears(person) {
  const dob = parseDateOnly(person?.date_of_birth);
  if (dob) {
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDelta = now.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
    if (age < 0 || age > 130) return null;
    return age;
  }

  const fallback = Number(person?.age_years);
  if (!Number.isFinite(fallback)) return null;
  return Math.round(fallback);
}

export function personWeightKg(person) {
  const weight = Number(person?.weight_kg);
  if (!Number.isFinite(weight)) return null;
  return weight;
}

export function hasBodyStats(person) {
  return personAgeYears(person) != null && personWeightKg(person) != null;
}

export function formatPersonStats(person) {
  const age = personAgeYears(person);
  const weight = personWeightKg(person);
  const parts = [];
  if (age != null) parts.push(`${age} yr${age === 1 ? '' : 's'}`);
  if (weight != null) parts.push(`${trimNumber(weight)} kg`);
  return parts.join(' · ');
}

function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function ageGroup(age) {
  if (age == null) return 'adult';
  if (age < 13) return 'child';
  if (age < 18) return 'teen';
  if (age >= 65) return 'older';
  return 'adult';
}

export function readingThresholds(person) {
  const age = personAgeYears(person);
  const weight = personWeightKg(person);
  const group = ageGroup(age);
  const heavyPad = weight != null && weight >= 100 ? 5 : 0;

  if (group === 'child') {
    return {
      group,
      personalized: age != null,
      bp: { lowSys: 85, elevatedSys: 115, elevatedDia: 75, highSys: 125, highDia: 82 },
      pulse: { lowDanger: 60, lowWarn: 70, highWarn: 115 + heavyPad, highDanger: 140 + heavyPad },
      sugar: { low: 70, fastingWarn: 100, fastingHigh: 126, otherWarn: 140, otherHigh: 200 },
      bpTarget: '< 115/75',
      pulseTarget: '70–115',
    };
  }

  if (group === 'teen') {
    return {
      group,
      personalized: age != null,
      bp: { lowSys: 90, elevatedSys: 120, elevatedDia: 80, highSys: 130, highDia: 80 },
      pulse: { lowDanger: 50, lowWarn: 55, highWarn: 105 + heavyPad, highDanger: 125 + heavyPad },
      sugar: { low: 70, fastingWarn: 100, fastingHigh: 126, otherWarn: 140, otherHigh: 200 },
      bpTarget: '< 120/80',
      pulseTarget: '55–105',
    };
  }

  if (group === 'older') {
    return {
      group,
      personalized: age != null,
      bp: { lowSys: 100, elevatedSys: 130, elevatedDia: 80, highSys: 140, highDia: 90 },
      pulse: { lowDanger: 45, lowWarn: 50, highWarn: 100 + heavyPad, highDanger: 115 + heavyPad },
      sugar: { low: 70, fastingWarn: 110, fastingHigh: 150, otherWarn: 160, otherHigh: 220 },
      bpTarget: '< 130/80',
      pulseTarget: '50–100',
    };
  }

  return {
    group,
    personalized: age != null,
    bp: { lowSys: 90, elevatedSys: 120, elevatedDia: 80, highSys: 140, highDia: 90 },
    pulse: { lowDanger: 50, lowWarn: 60, highWarn: 100 + heavyPad, highDanger: 120 + heavyPad },
    sugar: { low: 70, fastingWarn: 100, fastingHigh: 126, otherWarn: 140, otherHigh: 200 },
    bpTarget: '< 120/80',
    pulseTarget: '60–100',
  };
}

export function classifyReading(reading, person) {
  if (!reading) return { key: 'unknown', label: 'No data' };
  const limits = readingThresholds(person);

  if (reading.type === 'bp') {
    const sys = Number(reading.systolic);
    const dia = Number(reading.diastolic);
    if (Number.isNaN(sys) || Number.isNaN(dia)) return { key: 'unknown', label: 'No data' };
    if (sys >= limits.bp.highSys || dia >= limits.bp.highDia) return { key: 'danger', label: 'High' };
    if (sys < limits.bp.lowSys) return { key: 'warning', label: 'Low' };
    if (sys >= limits.bp.elevatedSys || dia >= limits.bp.elevatedDia) return { key: 'warning', label: 'Elevated' };
    return { key: 'success', label: 'Normal' };
  }

  if (reading.type === 'pulse') {
    const bpm = Number(reading.bpm);
    if (Number.isNaN(bpm)) return { key: 'unknown', label: 'No data' };
    if (bpm < limits.pulse.lowDanger) return { key: 'danger', label: 'Low' };
    if (bpm > limits.pulse.highDanger) return { key: 'danger', label: 'High' };
    if (bpm < limits.pulse.lowWarn) return { key: 'warning', label: 'Low' };
    if (bpm > limits.pulse.highWarn) return { key: 'warning', label: 'Elevated' };
    return { key: 'success', label: 'Normal' };
  }

  if (reading.type === 'blood-sugar') {
    const mgDl = sugarToMgDl(reading);
    if (mgDl == null) return { key: 'unknown', label: 'No data' };
    if (mgDl < limits.sugar.low) return { key: 'danger', label: 'Low' };
    const fasting = reading.context === 'fasting';
    if (fasting) {
      if (mgDl >= limits.sugar.fastingHigh) return { key: 'danger', label: 'High' };
      if (mgDl >= limits.sugar.fastingWarn) return { key: 'warning', label: 'Elevated' };
      return { key: 'success', label: 'Normal' };
    }
    if (mgDl >= limits.sugar.otherHigh) return { key: 'danger', label: 'High' };
    if (mgDl >= limits.sugar.otherWarn) return { key: 'warning', label: 'Elevated' };
    return { key: 'success', label: 'Normal' };
  }

  return { key: 'unknown', label: 'Unknown' };
}

export function readingFromAverage(type, average) {
  if (!average) return null;
  if (type === 'bp') {
    const [systolic, diastolic] = String(average.label || '').split('/').map(Number);
    if (!systolic || !diastolic) return null;
    return { type: 'bp', systolic, diastolic };
  }
  if (type === 'pulse') {
    if (average.value == null) return null;
    return { type: 'pulse', bpm: average.value };
  }
  if (type === 'blood-sugar') {
    if (average.value == null) return null;
    return { type: 'blood-sugar', value: average.value, unit: 'mg/dL', context: 'random' };
  }
  return null;
}

export function latestByType(readings = []) {
  const latest = { bp: null, pulse: null, 'blood-sugar': null };
  for (const reading of readings) {
    if (reading?.type && latest[reading.type] === null) {
      latest[reading.type] = reading;
    }
  }
  return latest;
}
