const NUMBER = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const NUMBER_PATTERN = new RegExp(`^${NUMBER}$`);
const FRACTION_PATTERN = new RegExp(`^(${NUMBER})/(${NUMBER})$`);
const VALUE_WITH_UNIT_PATTERN = new RegExp(`^(${NUMBER}(?:/${NUMBER})?)(.*)$`);

export const clean = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replaceAll(',', '.')
    .replaceAll('²', '^2')
    .replaceAll('³', '^3')
    .replaceAll('−', '-')
    .replaceAll('÷', '/')
    .replace(/hoch\s*(?:zwei|2)\b/g, '^2')
    .replace(/hoch\s*(?:drei|3)\b/g, '^3')
    .replace(/\s+/g, '');

const LENGTH_UNITS: Record<string, string> = {
  km: 'km', kilometer: 'km',
  hm: 'hm', hektometer: 'hm',
  dam: 'dam', dekameter: 'dam',
  m: 'm', meter: 'm',
  dm: 'dm', dezimeter: 'dm',
  cm: 'cm', zentimeter: 'cm',
  mm: 'mm', millimeter: 'mm',
};

const OTHER_UNITS: Record<string, string> = {
  h: 'h', stunde: 'h', stunden: 'h',
  min: 'min', minute: 'min', minuten: 'min',
  s: 's', sekunde: 's', sekunden: 's',
  kg: 'kg', kilogramm: 'kg',
  mg: 'mg', milligramm: 'mg',
  g: 'g', gramm: 'g',
  t: 't', tonne: 't', tonnen: 't',
  l: 'l', liter: 'l',
  ml: 'ml', milliliter: 'ml',
  cl: 'cl', zentiliter: 'cl',
  '€': '€', eur: '€', euro: '€',
  '%': '%', prozent: '%',
  '°': '°', grad: '°',
};

const normalizeUnit = (value: string): string | null => {
  const prepared = clean(value);
  const prefixed = prepared.match(/^(quadrat|kubik)(.+)$/);
  if (prefixed) {
    const base = LENGTH_UNITS[prefixed[2]];
    return base ? `${base}^${prefixed[1] === 'quadrat' ? 2 : 3}` : null;
  }

  const powered = prepared.match(/^(.+?)\^?([23])$/);
  if (powered) {
    const base = LENGTH_UNITS[powered[1]];
    return base ? `${base}^${powered[2]}` : null;
  }

  return LENGTH_UNITS[prepared] ?? OTHER_UNITS[prepared] ?? null;
};

const parseNumber = (prepared: string): number | null => {
  const fraction = prepared.match(FRACTION_PATTERN);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    const value = Number(fraction[1]) / denominator;
    return Number.isFinite(value) ? value : null;
  }
  if (!NUMBER_PATTERN.test(prepared)) return null;
  const value = Number(prepared);
  return Number.isFinite(value) ? value : null;
};

const matchesNumber = (expected: number, prepared: string, minimumDecimals?: number) => {
  const value = parseNumber(prepared);
  if (value === null) return false;
  if (expected === 0 || expected === 1) return value === expected;
  if (Math.abs(value - expected) < 1e-9) return true;
  if (minimumDecimals === undefined || !NUMBER_PATTERN.test(prepared)) return false;

  // Only decimal input may be rounded; a fraction must have the correct value.
  const decimalDigits = prepared.split('.')[1] ?? '';
  if (decimalDigits.length < minimumDecimals) return false;
  const decimals = Math.max(minimumDecimals, decimalDigits.replace(/0+$/, '').length);
  return value === Number(expected.toFixed(Math.min(decimals, 12)));
};

export const numeric = (expected: number, unit?: string) => {
  const expectedUnit = unit ? normalizeUnit(unit) : null;
  return (answer: string) => {
    const prepared = clean(answer).replace(/^(x(_?0|₀)?=|f\([^)]*\)=)/, '');
    const match = prepared.match(VALUE_WITH_UNIT_PATTERN);
    if (!match) return false;
    if (match[2] && (!expectedUnit || normalizeUnit(match[2]) !== expectedUnit)) return false;
    return matchesNumber(expected, match[1]);
  };
};

export const oneOf = (...accepted: string[]) => (answer: string) =>
  accepted.map(clean).includes(clean(answer));

export const numberSequence = (...expected: number[]) => (answer: string) => {
  const values = clean(answer).split(/[;|]/);
  return values.length === expected.length &&
    expected.every((value, index) => matchesNumber(value, values[index], 2));
};

export const twoNumbers = (first: number, second: number) => (answer: string) => {
  const values = clean(answer).split(/[;|/]/).map((value) => value.replace(/°$/, ''));
  if (values.length !== 2) return false;
  return (matchesNumber(first, values[0]) && matchesNumber(second, values[1])) ||
    (matchesNumber(second, values[0]) && matchesNumber(first, values[1]));
};

export const probability = (expected: number) => (answer: string) => {
  const parts = clean(answer).split('=');
  return parts.every((part) => {
    const isPercent = part.endsWith('%');
    const prepared = isPercent ? part.slice(0, -1) : part;
    const value = parseNumber(prepared);
    if (value === null || value < 0 || value > (isPercent ? 100 : 1)) return false;
    // Decimal probabilities use at least two places; whole percentages are allowed.
    return matchesNumber(isPercent ? expected * 100 : expected, prepared, isPercent ? 0 : 2);
  });
};
