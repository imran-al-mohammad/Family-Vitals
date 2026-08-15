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

export function classifyReading(reading) {
  if (!reading) return { key: 'unknown', label: 'No data' };

  if (reading.type === 'bp') {
    const sys = Number(reading.systolic);
    const dia = Number(reading.diastolic);
    if (Number.isNaN(sys) || Number.isNaN(dia)) return { key: 'unknown', label: 'No data' };
    if (sys >= 140 || dia >= 90) return { key: 'danger', label: 'High' };
    if (sys >= 130 || dia >= 80) return { key: 'warning', label: 'Elevated' };
    if (sys >= 120 && dia < 80) return { key: 'warning', label: 'Elevated' };
    return { key: 'success', label: 'Normal' };
  }

  if (reading.type === 'pulse') {
    const bpm = Number(reading.bpm);
    if (Number.isNaN(bpm)) return { key: 'unknown', label: 'No data' };
    if (bpm < 50) return { key: 'danger', label: 'Low' };
    if (bpm > 120) return { key: 'danger', label: 'High' };
    if (bpm < 60) return { key: 'warning', label: 'Low' };
    if (bpm > 100) return { key: 'warning', label: 'Elevated' };
    return { key: 'success', label: 'Normal' };
  }

  if (reading.type === 'blood-sugar') {
    const mgDl = sugarToMgDl(reading);
    if (mgDl == null) return { key: 'unknown', label: 'No data' };
    if (mgDl < 70) return { key: 'danger', label: 'Low' };
    const fasting = reading.context === 'fasting';
    if (fasting) {
      if (mgDl >= 126) return { key: 'danger', label: 'High' };
      if (mgDl >= 100) return { key: 'warning', label: 'Elevated' };
      return { key: 'success', label: 'Normal' };
    }
    if (mgDl >= 200) return { key: 'danger', label: 'High' };
    if (mgDl >= 140) return { key: 'warning', label: 'Elevated' };
    return { key: 'success', label: 'Normal' };
  }

  return { key: 'unknown', label: 'Unknown' };
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
