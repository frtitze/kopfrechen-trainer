'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const SESSION_SECONDS = 15 * 60;
const EXAM_LENGTH = 12;
const SHARE_URL = 'https://frtitze.github.io/kopfrechen-trainer/';

type Phase = 'intro' | 'exam' | 'result';

type Question = {
  id: string;
  category: string;
  prompt: string;
  note?: string;
  solution: string;
  check: (answer: string) => boolean;
};

const clean = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replaceAll(',', '.')
    .replaceAll('²', '^2')
    .replaceAll('³', '^3')
    .replaceAll('−', '-')
    .replaceAll('÷', '/')
    .replace(/\s+/g, '');

const numeric = (expected: number) => (answer: string) => {
  const prepared = clean(answer)
    .replace(/^(x(_?0|₀)?=|f\([^)]*\)=)/, '')
    .replace(/(km|cm|mm|dm|m|h|min|s|kg|mg|g|t|l|ml|cl|dm\^3|cm\^3|m\^3|cm\^2|dm\^2|m\^2|€|eur|euro|%|°)$/g, '');
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(prepared)) return false;
  return Math.abs(Number(prepared) - expected) < 0.0001;
};

const oneOf = (...accepted: string[]) => (answer: string) =>
  accepted.map(clean).includes(clean(answer));

const twoNumbers = (first: number, second: number) => (answer: string) => {
  const values = clean(answer)
    .replaceAll('°', '')
    .split(/[;|/]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  return (
    values.length === 2 &&
    ((values[0] === first && values[1] === second) ||
      (values[0] === second && values[1] === first))
  );
};

const probability = (expected: number) => (answer: string) => {
  const prepared = clean(answer);
  if (!prepared) return false;
  let value: number;

  if (prepared.endsWith('%')) {
    value = Number(prepared.slice(0, -1)) / 100;
  } else if (/^-?(?:\d+(?:\.\d+)?|\.\d+)\/-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(prepared)) {
    const [numerator, denominator] = prepared.split('/').map(Number);
    if (denominator === 0) return false;
    value = numerator / denominator;
  } else {
    value = Number(prepared);
  }

  return Number.isFinite(value) && Math.abs(value - expected) < 0.005;
};

const QUESTION_BANK: Question[] = [
  { id: 'calc-decimal', category: 'Grundrechnen', prompt: '2,5 : 10 =', solution: '0,25', check: numeric(0.25) },
  { id: 'calc-distributive', category: 'Grundrechnen', prompt: '0,6 · 14 + 0,4 · 14 =', solution: '14', check: numeric(14) },
  { id: 'calc-fraction', category: 'Grundrechnen', prompt: '84 : ½ =', solution: '168', check: numeric(168) },
  { id: 'calc-mixed', category: 'Grundrechnen', prompt: '15 − 3 · 4 =', solution: '3', check: numeric(3) },
  { id: 'calc-part', category: 'Grundrechnen', prompt: 'Berechne ¾ von 84.', solution: '63', check: numeric(63) },
  { id: 'calc-large', category: 'Grundrechnen', prompt: '125 · 8 =', solution: '1 000', check: numeric(1000) },
  { id: 'calc-priority-second', category: 'Grundrechnen', prompt: '18 + 7 · 9 =', solution: '81', check: numeric(81) },
  { id: 'calc-decimal-sum', category: 'Grundrechnen', prompt: '¾ + 0,15 =', solution: '0,9', check: numeric(0.9) },
  { id: 'calc-decimal-difference', category: 'Grundrechnen', prompt: '1,2 − 0,35 =', solution: '0,85', check: numeric(0.85) },
  { id: 'calc-power', category: 'Grundrechnen', prompt: '3³ − 5 =', solution: '22', check: numeric(22) },
  { id: 'calc-root', category: 'Grundrechnen', prompt: '√196 =', solution: '14', check: numeric(14) },
  { id: 'calc-fraction-part-second', category: 'Grundrechnen', prompt: 'Wie viel sind ⅔ von 96?', solution: '64', check: numeric(64) },
  { id: 'unit-length', category: 'Einheiten', prompt: '0,45 m = ___ cm', note: 'Gib nur die Zahl ein.', solution: '45 cm', check: numeric(45) },
  { id: 'unit-time', category: 'Einheiten', prompt: '0,75 h = ___ min', note: 'Gib nur die Zahl ein.', solution: '45 min', check: numeric(45) },
  { id: 'unit-length-large', category: 'Einheiten', prompt: '320 cm = ___ m', note: 'Gib nur die Zahl ein.', solution: '3,2 m', check: numeric(3.2) },
  { id: 'unit-mass', category: 'Einheiten', prompt: '2,4 kg = ___ g', note: 'Gib nur die Zahl ein.', solution: '2 400 g', check: numeric(2400) },
  { id: 'unit-volume', category: 'Einheiten', prompt: '1,5 l = ___ ml', note: 'Gib nur die Zahl ein.', solution: '1 500 ml', check: numeric(1500) },
  { id: 'unit-time-second', category: 'Einheiten', prompt: '0,4 h = ___ min', note: 'Gib nur die Zahl ein.', solution: '24 min', check: numeric(24) },
  { id: 'unit-mixed-length', category: 'Einheiten', prompt: '3 m + 8 cm = ___ m', note: 'Gib nur die Zahl ein.', solution: '3,08 m', check: numeric(3.08) },
  { id: 'unit-cubic-volume', category: 'Einheiten', prompt: '450 cm³ = ___ dm³', note: 'Gib nur die Zahl ein.', solution: '0,45 dm³', check: numeric(0.45) },
  { id: 'unit-tonne', category: 'Einheiten', prompt: '0,36 t = ___ kg', note: 'Gib nur die Zahl ein.', solution: '360 kg', check: numeric(360) },
  { id: 'unit-area', category: 'Einheiten', prompt: '2,5 m² = ___ cm²', note: 'Gib nur die Zahl ein.', solution: '25 000 cm²', check: numeric(25000) },
  { id: 'percent-increase', category: 'Prozentrechnung', prompt: 'Ein Gehalt von 2 800 € wird um 5 % erhöht. Neues Gehalt:', note: 'Gib den Betrag in Euro ein.', solution: '2 940 €', check: numeric(2940) },
  { id: 'percent-original', category: 'Prozentrechnung', prompt: '72 € sind 80 % des ursprünglichen Preises. Der ursprüngliche Preis beträgt:', solution: '90 €', check: numeric(90) },
  { id: 'percent-change', category: 'Prozentrechnung', prompt: 'Ein Betrag steigt von 3 000 € auf 3 090 €. Er steigt um:', note: 'Gib die Prozentzahl ein.', solution: '3 %', check: numeric(3) },
  { id: 'percent-part', category: 'Prozentrechnung', prompt: '15 % von 200 sind:', solution: '30', check: numeric(30) },
  { id: 'percent-base', category: 'Prozentrechnung', prompt: '48 sind 60 % von welcher Zahl?', solution: '80', check: numeric(80) },
  { id: 'percent-reduction', category: 'Prozentrechnung', prompt: 'Ein Preis von 500 € wird um 12 % gesenkt. Neuer Preis:', solution: '440 €', check: numeric(440) },
  { id: 'percent-everyday-increase', category: 'Prozentrechnung', prompt: 'Ein Pausensnack kostet 2,40 €. Der Preis steigt um 25 %. Wie viel kostet er danach?', solution: '3,00 €', check: numeric(3) },
  { id: 'percent-everyday-discount', category: 'Prozentrechnung', prompt: 'Eine Jacke für 80 € wird um 15 % reduziert. Neuer Preis:', solution: '68 €', check: numeric(68) },
  { id: 'percent-fraction', category: 'Prozentrechnung', prompt: 'Gib den Bruch 7/20 als Prozentzahl an.', solution: '35 %', check: numeric(35) },
  { id: 'percent-base-second', category: 'Prozentrechnung', prompt: '54 sind 90 % einer Zahl. Wie groß ist die Zahl?', solution: '60', check: numeric(60) },
  { id: 'percent-change-second', category: 'Prozentrechnung', prompt: 'Eine Teilnehmerzahl steigt von 250 auf 300. Um wie viel Prozent steigt sie?', solution: '20 %', check: numeric(20) },
  { id: 'term-value', category: 'Terme', prompt: 'Berechne 2a(a − b) für a = 3 und b = 6.', solution: '−18', check: numeric(-18) },
  { id: 'binomial', category: 'Terme', prompt: 'Löse die Klammer auf: (x − 4)²', solution: 'x² − 8x + 16', check: oneOf('x^2-8x+16', '16-8x+x^2') },
  { id: 'rearrange', category: 'Terme', prompt: 'Stelle u = 2(a + b) nach a um.', solution: 'a = u/2 − b', check: oneOf('a=u/2-b', 'u/2-b', 'a=0.5u-b', '0.5u-b') },
  { id: 'term-nested', category: 'Terme', prompt: 'Berechne a − (2b − a) für a = 1 und b = 10.', solution: '−18', check: numeric(-18) },
  { id: 'difference-squares', category: 'Terme', prompt: 'Löse die Klammern auf: (3 − x)(3 + x)', solution: '9 − x²', check: oneOf('9-x^2', '-x^2+9') },
  { id: 'simplify-term', category: 'Terme', prompt: 'Fasse zusammen: 4x + 3x − 2', solution: '7x − 2', check: oneOf('7x-2', '-2+7x') },
  { id: 'simplify-term-second', category: 'Terme', prompt: 'Fasse zusammen: 9a − 4b + 3a + b', solution: '12a − 3b', check: oneOf('12a-3b', '-3b+12a') },
  { id: 'expand-brackets', category: 'Terme', prompt: 'Löse die Klammer auf: 3(2x − 5)', solution: '6x − 15', check: oneOf('6x-15', '-15+6x') },
  { id: 'factorise-term', category: 'Terme', prompt: 'Klammere 4 aus: 8x + 12', solution: '4(2x + 3)', check: oneOf('4(2x+3)', '4*(2x+3)') },
  { id: 'linear-equation', category: 'Terme', prompt: 'Löse die Gleichung 5x − 7 = 18.', note: 'Gib den Wert von x ein.', solution: 'x = 5', check: numeric(5) },
  { id: 'square-area', category: 'Geometrie', prompt: 'Ein Quadrat hat den Flächeninhalt 121 cm². Seine Seitenlänge beträgt:', solution: '11 cm', check: numeric(11) },
  { id: 'equal-area', category: 'Geometrie', prompt: 'Ein Rechteck ist 4 cm × 9 cm groß. Die Seitenlänge eines flächengleichen Quadrats ist:', solution: '6 cm', check: numeric(6) },
  { id: 'triangle-angles', category: 'Geometrie', prompt: 'Ein rechtwinkliges Dreieck hat einen Winkel von 35°. Nenne die beiden anderen Winkel.', note: 'Trenne die Werte mit einem Semikolon.', solution: '55°; 90°', check: twoNumbers(55, 90) },
  { id: 'circle-radius', category: 'Geometrie', prompt: 'Ein Kreis hat einen Durchmesser von 12 cm. Sein Radius beträgt:', solution: '6 cm', check: numeric(6) },
  { id: 'rectangle-perimeter', category: 'Geometrie', prompt: 'Ein Rechteck ist 7 cm lang und 4 cm breit. Sein Umfang beträgt:', solution: '22 cm', check: numeric(22) },
  { id: 'triangle-third-angle', category: 'Geometrie', prompt: 'Zwei Winkel eines Dreiecks sind 46° und 64° groß. Der dritte Winkel beträgt:', solution: '70°', check: numeric(70) },
  { id: 'triangle-area', category: 'Geometrie', prompt: 'Ein Dreieck hat die Grundseite 12 cm und die zugehörige Höhe 5 cm. Sein Flächeninhalt beträgt:', solution: '30 cm²', check: numeric(30) },
  { id: 'triangle-largest-angle', category: 'Geometrie', prompt: 'In einem Dreieck gilt a = 5 cm, b = 7 cm und c = 9 cm. Welcher Winkel ist der größte?', note: 'Gib α, β oder γ ein.', solution: 'γ', check: oneOf('γ', 'gamma') },
  { id: 'cube-volume', category: 'Geometrie', prompt: 'Ein Würfel hat eine Kantenlänge von 4 cm. Sein Volumen beträgt:', solution: '64 cm³', check: numeric(64) },
  { id: 'pythagoras-triple', category: 'Geometrie', prompt: 'Ein rechtwinkliges Dreieck hat Katheten von 6 cm und 8 cm. Die Hypotenuse ist lang:', solution: '10 cm', check: numeric(10) },
  { id: 'vertex', category: 'Funktionen', prompt: 'Gib den Scheitelpunkt der Funktion f(x) = (x + 5)² + 1 an.', note: 'Schreibweise zum Beispiel: S(2/3)', solution: 'S(−5/1)', check: oneOf('s(-5/1)', '(-5/1)', '-5/1') },
  { id: 'zero', category: 'Funktionen', prompt: 'Die Gerade hat die Gleichung y = 2x − 6. Ihre Nullstelle ist x₀ =', solution: '3', check: numeric(3) },
  { id: 'vertex-second', category: 'Funktionen', prompt: 'Gib den Scheitelpunkt der Funktion f(x) = (x − 3)² − 2 an.', note: 'Verwende die Schreibweise S(x/y).', solution: 'S(3/−2)', check: oneOf('s(3/-2)', '(3/-2)', '3/-2') },
  { id: 'zero-second', category: 'Funktionen', prompt: 'Die Gerade hat die Gleichung y = −3x + 9. Ihre Nullstelle ist x₀ =', solution: '3', check: numeric(3) },
  { id: 'function-value', category: 'Funktionen', prompt: 'Für f(x) = 2x + 1 gilt bei x = 4:', solution: 'f(4) = 9', check: oneOf('9', 'f(4)=9') },
  { id: 'function-value-second', category: 'Funktionen', prompt: 'Berechne f(5) für f(x) = 3x − 4.', solution: '11', check: numeric(11) },
  { id: 'function-slope', category: 'Funktionen', prompt: 'Gib den Anstieg der Geraden y = −2x + 7 an.', solution: '−2', check: numeric(-2) },
  { id: 'function-intercept', category: 'Funktionen', prompt: 'Gib den y-Achsenabschnitt der Geraden y = −2x + 7 an.', solution: '7', check: numeric(7) },
  { id: 'sine-ninety', category: 'Funktionen', prompt: 'sin(90°) =', solution: '1', check: numeric(1) },
  { id: 'sine-zero', category: 'Funktionen', prompt: 'sin(0°) =', solution: '0', check: numeric(0) },
  { id: 'probability', category: 'Stochastik', prompt: 'Von 12 Pullovern sind 8 bunt gemustert. Die Wahrscheinlichkeit, einen gemusterten Pullover zu ziehen, ist:', note: 'Bruch, Dezimalzahl oder Prozentzahl sind möglich.', solution: '2/3', check: probability(2 / 3) },
  { id: 'probability-zero', category: 'Stochastik', prompt: 'In einer Urne liegen nur rote und gelbe Kugeln. Die Wahrscheinlichkeit, eine blaue Kugel zu ziehen, ist:', solution: '0', check: probability(0) },
  { id: 'probability-red', category: 'Stochastik', prompt: 'In einer Urne liegen 9 rote und 11 gelbe Kugeln. Die Wahrscheinlichkeit für Rot ist:', note: 'Bruch, Dezimalzahl oder Prozentzahl sind möglich.', solution: '9/20 = 0,45 = 45 %', check: probability(0.45) },
  { id: 'probability-complement', category: 'Stochastik', prompt: 'Die Wahrscheinlichkeit für Regen beträgt 30 %. Die Wahrscheinlichkeit, dass es nicht regnet, beträgt:', solution: '70 %', check: numeric(70) },
  { id: 'statistics-mean', category: 'Stochastik', prompt: 'Bestimme das arithmetische Mittel: 8; 11; 9; 12', solution: '10', check: numeric(10) },
  { id: 'statistics-range', category: 'Stochastik', prompt: 'Bestimme die Spannweite: 2,5; 3,1; 4,6; 3,8', solution: '2,1', check: numeric(2.1) },
  { id: 'statistics-median', category: 'Stochastik', prompt: 'Bestimme den Median: 2; 5; 7; 8; 10', solution: '7', check: numeric(7) },
  { id: 'probability-complement-second', category: 'Stochastik', prompt: 'Die Trefferwahrscheinlichkeit beträgt 18 %. Wie groß ist die Gegenwahrscheinlichkeit?', solution: '82 %', check: numeric(82) },
  { id: 'probability-green', category: 'Stochastik', prompt: 'In einem Beutel sind 3 grüne und 9 weiße Kugeln. Wie groß ist die Wahrscheinlichkeit für Grün?', note: 'Bruch, Dezimalzahl oder Prozentzahl sind möglich.', solution: '1/4 = 0,25 = 25 %', check: probability(0.25) },
  { id: 'probability-die', category: 'Stochastik', prompt: 'Ein fairer Würfel wird einmal geworfen. Wie groß ist die Wahrscheinlichkeit für eine gerade Zahl?', note: 'Bruch, Dezimalzahl oder Prozentzahl sind möglich.', solution: '1/2 = 0,5 = 50 %', check: probability(0.5) },
  { id: 'probability-expected', category: 'Stochastik', prompt: 'Bei 20 Versuchen liegt die Trefferwahrscheinlichkeit bei 30 %. Wie viele Treffer sind im Mittel zu erwarten?', solution: '6', check: numeric(6) },
  { id: 'sequence', category: 'Zahlenfolgen', prompt: 'Setze die Zahlenfolge fort: 10; 20; 40; 70; ___; ___', note: 'Trenne die beiden Zahlen mit einem Semikolon.', solution: '110; 160', check: oneOf('110;160', '110|160') },
  { id: 'sequence-differences', category: 'Zahlenfolgen', prompt: 'Setze die Zahlenfolge fort: 5; 9; 15; 23; ___; ___', note: 'Trenne die beiden Zahlen mit einem Semikolon.', solution: '33; 45', check: oneOf('33;45', '33|45') },
  { id: 'sequence-squares', category: 'Zahlenfolgen', prompt: 'Setze fort: 4; 9; 16; 25; ___; ___', note: 'Trenne die beiden Zahlen mit einem Semikolon.', solution: '36; 49', check: oneOf('36;49', '36|49') },
  { id: 'sequence-division', category: 'Zahlenfolgen', prompt: 'Setze fort: 81; 27; 9; 3; ___; ___', note: 'Trenne die beiden Zahlen mit einem Semikolon.', solution: '1; 1/3', check: oneOf('1;1/3', '1|1/3') },
  { id: 'sequence-products', category: 'Zahlenfolgen', prompt: 'Setze fort: 2; 6; 12; 20; 30; ___; ___', note: 'Trenne die beiden Zahlen mit einem Semikolon.', solution: '42; 56', check: oneOf('42;56', '42|56') },
  { id: 'sequence-subtraction', category: 'Zahlenfolgen', prompt: 'Setze fort: 100; 95; 85; 70; ___; ___', note: 'Trenne die beiden Zahlen mit einem Semikolon.', solution: '50; 25', check: oneOf('50;25', '50|25') },
];

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const createExam = () => {
  const categories = [...new Set(QUESTION_BANK.map((question) => question.category))];
  const questionsByCategory = new Map(
    categories.map((category) => [
      category,
      shuffle(QUESTION_BANK.filter((question) => question.category === category)),
    ]),
  );
  const selected = categories.map((category) => questionsByCategory.get(category)![0]);
  const extraCategories = shuffle(categories).slice(0, EXAM_LENGTH - selected.length);
  const extras = extraCategories.map((category) => questionsByCategory.get(category)![1]);
  return shuffle([...selected, ...extras]);
};

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(SESSION_SECONDS);
  const [bestScore, setBestScore] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem('matheklar-best-score');
    const parsed = Number(saved);
    if (!Number.isFinite(parsed)) return;
    const frame = window.requestAnimationFrame(() => {
      setBestScore(Math.min(EXAM_LENGTH, Math.max(0, parsed)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (phase !== 'exam') return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'exam' || timeLeft !== 0) return;
    const frame = window.requestAnimationFrame(() => setPhase('result'));
    return () => window.cancelAnimationFrame(frame);
  }, [phase, timeLeft]);

  const score = useMemo(
    () => questions.filter((question) => question.check(answers[question.id] ?? '')).length,
    [answers, questions],
  );

  const categoryResults = useMemo(() => {
    const results = new Map<string, { correct: number; total: number }>();
    questions.forEach((question) => {
      const current = results.get(question.category) ?? { correct: 0, total: 0 };
      current.total += 1;
      if (question.check(answers[question.id] ?? '')) current.correct += 1;
      results.set(question.category, current);
    });
    return [...results.entries()].map(([category, result]) => ({ category, ...result }));
  }, [answers, questions]);

  useEffect(() => {
    if (phase !== 'result' || score <= bestScore) return;
    const frame = window.requestAnimationFrame(() => {
      setBestScore(score);
      window.localStorage.setItem('matheklar-best-score', String(score));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bestScore, phase, score]);

  const answeredCount = Object.values(answers).filter((answer) => answer.trim()).length;

  const startExam = () => {
    setQuestions(createExam());
    setAnswers({});
    setTimeLeft(SESSION_SECONDS);
    setPhase('exam');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitExam = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPhase('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateAnswer = (id: string, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
  };

  if (phase === 'intro') {
    return (
      <main className="landing-shell">
        <nav className="topbar" aria-label="Hauptnavigation">
          <a className="brand" href="#start" aria-label="MatheKlar Startseite">
            <span className="brand-mark">M</span>
            <span>MatheKlar</span>
          </a>
          <span className="class-badge">Klasse 10</span>
        </nav>

        <section className="hero" id="start">
          <div className="hero-copy">
            <p className="eyebrow">Kopfrechenteil · Abschlussprüfung</p>
            <h1>15 Minuten.<br />12 Punkte.<br /><em>Du schaffst das.</em></h1>
            <p className="hero-lead">
              Trainiere genau die kurzen Aufgabentypen, die dir in der Prüfung begegnen.
              Jede Runde mischt 12 Aufgaben neu aus einem Pool von {QUESTION_BANK.length} Aufgaben.
            </p>
            <button className="primary-button" onClick={startExam} type="button">
              Übung starten <span aria-hidden="true">→</span>
            </button>
            <p className="privacy-note">Keine Anmeldung. Deine Ergebnisse bleiben auf diesem Gerät.</p>
          </div>

          <div className="hero-side">
            <aside className="exam-preview" aria-label="Übungsübersicht">
              <div className="preview-topline">
                <span>Deine Übungsrunde</span>
                <span className="live-dot"><i /> bereit</span>
              </div>
              <div className="preview-score"><strong>12</strong><span>Aufgaben</span></div>
              <div className="preview-rule" />
              <dl className="preview-facts">
                <div><dt>Zeit</dt><dd>15:00 min</dd></div>
                <div><dt>Hilfsmittel</dt><dd>keine</dd></div>
                <div><dt>Aufgabenpool</dt><dd>{QUESTION_BANK.length}</dd></div>
                <div><dt>Bestwert</dt><dd>{bestScore || '–'} / 12</dd></div>
              </dl>
            </aside>

            <a className="qr-card" href={SHARE_URL} rel="noreferrer" target="_blank">
              {/* A relative path works both at / and below the GitHub Pages repository path. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="QR-Code zur MatheKlar-Webseite" height="512" src="qr-code.png" width="512" />
              <span>
                <small>Direkt aufs Handy</small>
                <strong>Scannen & loslegen</strong>
                <span>frtitze.github.io/kopfrechen-trainer</span>
              </span>
            </a>
          </div>
        </section>

        <section className="topic-strip" aria-label="Themen der Übung">
          <span>Grundrechnen</span><span>Einheiten</span><span>Prozent</span><span>Terme</span>
          <span>Geometrie</span><span>Funktionen</span><span>Stochastik</span><span>Zahlenfolgen</span>
        </section>
      </main>
    );
  }

  if (phase === 'result') {
    const percentage = Math.round((score / EXAM_LENGTH) * 100);
    return (
      <main className="result-shell">
        <nav className="topbar compact">
          <button className="brand brand-button" onClick={() => setPhase('intro')} type="button">
            <span className="brand-mark">M</span><span>MatheKlar</span>
          </button>
          <span className="class-badge">Auswertung</span>
        </nav>

        <section className="result-hero">
          <div className="result-ring" style={{ '--score-angle': `${percentage * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{score}</strong><span>von 12</span></div>
          </div>
          <div>
            <p className="eyebrow">Runde abgeschlossen</p>
            <h1>{score >= 10 ? 'Prüfungsreif!' : score >= 7 ? 'Gute Basis.' : 'Dranbleiben lohnt sich.'}</h1>
            <p>
              {score >= 10
                ? 'Sehr stark – du löst die meisten Aufgabentypen sicher.'
                : score >= 7
                  ? 'Schau dir die markierten Lösungen an und starte danach eine neue Mischung.'
                  : 'Nutze die Lösungen als Lernspur. Die nächste Runde stellt neue Aufgaben zusammen.'}
            </p>
            <button className="primary-button" onClick={startExam} type="button">Neue Runde <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <section className="topic-results" aria-labelledby="topic-results-title">
          <div className="section-heading">
            <div><p className="eyebrow">Deine Themen</p><h2 id="topic-results-title">Stärken & Übungsfelder</h2></div>
            <p className="topic-results-note">Diese Auswertung bleibt auf deinem Gerät.</p>
          </div>
          <div className="skill-grid">
            {categoryResults.map(({ category, correct, total }) => {
              const categoryPercentage = Math.round((correct / total) * 100);
              return (
                <article className="skill-card" key={category}>
                  <div><strong>{category}</strong><span>{correct} / {total} richtig</span></div>
                  <div
                    aria-label={`${categoryPercentage} Prozent richtig`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={categoryPercentage}
                    className="skill-track"
                    role="progressbar"
                  >
                    <span style={{ width: `${categoryPercentage}%` }} />
                  </div>
                  <p>{correct === total ? 'Sicher gelöst' : correct === 0 ? 'Hier weiterüben' : 'Auf gutem Weg'}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="solution-section">
          <div className="section-heading">
            <div><p className="eyebrow">Deine Antworten</p><h2>Lösungen im Überblick</h2></div>
            <span className="best-chip">Bestwert: {Math.max(bestScore, score)} / 12</span>
          </div>
          <ol className="solution-list">
            {questions.map((question, index) => {
              const correct = question.check(answers[question.id] ?? '');
              return (
                <li className={correct ? 'solution-card correct' : 'solution-card incorrect'} key={question.id}>
                  <span className="solution-number">{String(index + 1).padStart(2, '0')}</span>
                  <div className="solution-copy">
                    <span className="category-label">{question.category}</span>
                    <p>{question.prompt}</p>
                    <dl>
                      <div><dt>Deine Antwort</dt><dd>{answers[question.id] || '–'}</dd></div>
                      {!correct && <div><dt>Richtig</dt><dd>{question.solution}</dd></div>}
                    </dl>
                  </div>
                  <span className="status-mark" aria-label={correct ? 'richtig' : 'noch nicht richtig'}>{correct ? '✓' : '×'}</span>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    );
  }

  return (
    <main className="exam-shell">
      <header className="exam-header">
        <a className="brand" href="#aufgabe-1"><span className="brand-mark">M</span><span>MatheKlar</span></a>
        <div className={`timer ${timeLeft <= 180 ? 'timer-warning' : ''}`} aria-live="polite">
          <span>Zeit</span><strong>{formatTime(timeLeft)}</strong>
        </div>
        <div className="progress-copy" aria-label={`${answeredCount} von 12 beantwortet`}>
          <strong>{answeredCount}</strong><span>von 12 beantwortet</span><b aria-hidden="true">/ 12</b>
        </div>
      </header>

      <div className="exam-layout">
        <aside className="exam-sidebar">
          <p className="eyebrow">Übersicht</p><h2>Deine Runde</h2>
          <div className="progress-track"><span style={{ width: `${(answeredCount / EXAM_LENGTH) * 100}%` }} /></div>
          <ol className="question-nav" aria-label="Aufgabennavigation">
            {questions.map((question, index) => (
              <li key={question.id}>
                <a className={answers[question.id]?.trim() ? 'answered' : ''} href={`#aufgabe-${index + 1}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>{question.category}
                </a>
              </li>
            ))}
          </ol>
          <p className="sidebar-note"><strong>Hinweis</strong> Komma und Punkt werden bei Dezimalzahlen akzeptiert.</p>
        </aside>

        <form className="question-form" onSubmit={submitExam}>
          <div className="exam-title">
            <p className="eyebrow">Kopfrechenteil</p>
            <h1>Abschlussprüfung · Übungsrunde</h1>
            <p>Gib nur deine Ergebnisse an. Jede Aufgabe zählt einen Punkt.</p>
          </div>

          <ol className="question-list">
            {questions.map((question, index) => (
              <li className="question-card" id={`aufgabe-${index + 1}`} key={question.id}>
                <div className="question-meta">
                  <span className="question-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="category-label">{question.category}</span>
                  <span className="point-label">1 P</span>
                </div>
                <label htmlFor={`answer-${question.id}`}>{question.prompt}</label>
                {question.note && <p className="question-note">{question.note}</p>}
                <div className="answer-row">
                  <input
                    autoComplete="off"
                    id={`answer-${question.id}`}
                    inputMode="text"
                    onChange={(event) => updateAnswer(question.id, event.target.value)}
                    placeholder="Deine Antwort"
                    type="text"
                    value={answers[question.id] ?? ''}
                  />
                  {answers[question.id]?.trim() && <span className="saved-mark" aria-label="Antwort gespeichert">✓</span>}
                </div>
              </li>
            ))}
          </ol>

          <section className="submit-panel">
            <div><p className="eyebrow">Fertig?</p><h2>Runde auswerten</h2><p>Du hast {answeredCount} von 12 Aufgaben beantwortet.</p></div>
            <button className="primary-button" type="submit">Antworten prüfen <span aria-hidden="true">→</span></button>
          </section>
        </form>
      </div>
    </main>
  );
}
