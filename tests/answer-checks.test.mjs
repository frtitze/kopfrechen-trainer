import assert from 'node:assert/strict';
import test from 'node:test';
import { numberSequence, numeric, oneOf, probability, twoNumbers } from '../lib/answer-checks.ts';

const accepts = (check, answers) => {
  for (const answer of answers) assert.equal(check(answer), true, `Should accept: ${answer}`);
};

const rejects = (check, answers) => {
  for (const answer of answers) assert.equal(check(answer), false, `Should reject: ${answer}`);
};

test('division sequence accepts equivalent fractions and rounded decimal thirds', () => {
  const check = numberSequence(1, 1 / 3);
  accepts(check, ['1;1/3', '1|1/3', '1;2/6', '1;0,33', '1;0.33', '1;0,333', '1;0.3333', '1,0 | .33', '1;0.3300']);
  rejects(check, ['1;0.3', '1;0.34', '1;0.32', '0.33;1', '1;1/4', '1;1/0', '1;0,33;2', '1;;0.33', '1/0.33', '1;', ';0.33', '']);
});

test('sequences retain order and accept numeric formatting', () => {
  const check = numberSequence(110, 160);
  accepts(check, ['110;160', '110|160', '110,0;160.00', '220/2;320/2']);
  rejects(check, ['160;110', '110;161', '110;160;extra', '110;;160', '110;160|', '110/160']);
});

test('all metric area and volume units accept symbols, plain exponents and words', () => {
  const units = [['mm', 'millimeter'], ['cm', 'zentimeter'], ['dm', 'dezimeter'], ['m', 'meter'], ['dam', 'dekameter'], ['hm', 'hektometer'], ['km', 'kilometer']];
  for (const [symbol, name] of units) {
    for (const [power, superscript, word, prefix] of [[2, '²', 'zwei', 'quadrat'], [3, '³', 'drei', 'kubik']]) {
      const check = numeric(30, `${symbol}^${power}`);
      accepts(check, ['30', `30 ${symbol}${superscript}`, `30 ${symbol}^${power}`, `30${symbol}${power}`, `30 ${symbol} hoch ${word}`, `30 ${symbol} hoch ${power}`, `30 ${name} hoch ${word}`, `30 ${prefix}${name}`, `30 ${symbol.toUpperCase()} HOCH ${word.toUpperCase()}`]);
      rejects(check, [`30 ${symbol}`, `30 ${symbol}^${power === 2 ? 3 : 2}`, `31 ${symbol}${power}`, `30 ${symbol}^4`, `30 ${symbol} hoch vier`]);
    }
  }
});

test('conversion answers accept the requested unit and reject wrong units', () => {
  accepts(numeric(0.45, 'dm³'), ['0,45', '0.45 dm3', '0,45 dm hoch 3', '0,45 Kubikdezimeter', '9/20 dm³']);
  rejects(numeric(0.45, 'dm³'), ['0,45 cm³', '0,45 dm²', '0,45 ml', '0,46 dm3']);
  accepts(numeric(25000, 'cm²'), ['25 000 cm2', '25000 cm hoch zwei', '25000 Quadratzentimeter']);
  rejects(numeric(25000, 'cm²'), ['25000 m2', '25000 cm3']);
});

test('existing number, currency, time, percentage and assignment forms still work', () => {
  accepts(numeric(0.25), ['0,25', '0.25', '.25', '1/4']);
  accepts(numeric(2940, '€'), ['2 940 €', '2940 EUR', '2940 Euro', '2940']);
  accepts(numeric(45, 'min'), ['45 min', '45 Minuten']);
  accepts(numeric(3, '%'), ['3', '3 %', '3 Prozent']);
  accepts(numeric(3), ['x = 3', 'x_0=3', 'x₀ = 3']);
  accepts(numeric(9), ['9,0', 'f(4) = 9', 'f(4)=18/2']);
  accepts(numeric(-18), ['−18', '-18']);
  rejects(numeric(0), ['', ' ', '/', '1/0', 'NaN', 'Infinity', '0x0', '0e0', '0%', '0/0']);
  rejects(numeric(0.25), ['0.24', '0.2499', '0.26', '0.25 cm']);
  rejects(numeric(30, 'unknown-unit'), ['30 nonsense']);
});

test('probabilities accept correctly rounded decimals, fractions and percentages', () => {
  accepts(probability(1 / 3), ['1/3', '2/6', '0,33', '0.33', '.333', '33%', '33,33 %', '33.0%']);
  accepts(probability(2 / 3), ['2/3', '0,67', '0.667', '67%', '66.67 %']);
  accepts(probability(2 / 21), ['2/21', '0,10', '0.1000', '10%']);
  accepts(probability(0.45), ['9/20', '0,45', '45%', '9/20 = 0,45 = 45 %']);
  accepts(probability(0.25), ['1/4', '0.25', '25%', '1/4=0.25=25%']);
  rejects(probability(1 / 3), ['1/4', '0.3', '0.34', '34%', '33.34%', '1/3=0.5', '1/0']);
  rejects(probability(2 / 3), ['0.66', '66%', '3/4']);
  rejects(probability(0.25), ['0.249', '24.9%', '0.24', '0.26']);
});

test('zero and certain probabilities reject blanks, invalid syntax and out-of-range input', () => {
  accepts(probability(0), ['0', '0%', '0/12']);
  accepts(probability(1), ['1', '100%', '12/12']);
  rejects(probability(0), ['', ' ', '%', '0x0', '0e0', 'NaN', 'Infinity', '-0.001', '-0.1%', '0.001', '0.0000000001', '=', '0=', '0/0']);
  rejects(probability(1), ['1.001', '1.0000000001', '100.1%', '2', '101%', '1/0']);
});

test('angle pairs reject extra or empty values instead of silently removing them', () => {
  const check = twoNumbers(55, 90);
  accepts(check, ['55;90', '90;55', '55°;90°', '90° | 55°', '55/90', '55,0;90.0']);
  rejects(check, ['55;90;garbage', '55;90;', '55;;90', '55;90;0', '55;foo;90', '55°°;90°', '55;91', '']);
  rejects(twoNumbers(0, 90), [';90', '0;90;', '0x0;90']);
});

test('algebraic alternatives retain decimal and superscript normalization', () => {
  accepts(oneOf('x^2-8x+16', '16-8x+x^2'), ['x² − 8x + 16', '16 - 8x + x^2', 'x hoch zwei - 8x + 16']);
  rejects(oneOf('x^2-8x+16'), ['x2-8x+16', 'x^2+8x+16', '']);
});
