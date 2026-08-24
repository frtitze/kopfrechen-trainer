interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  TEACHER_CODE_HASH: string;
  SESSION_SIGNING_SECRET: string;
}

type AttemptItem = {
  questionId: string;
  category: string;
  correct: boolean;
};

type TokenPayload =
  | { role: 'teacher'; exp: number }
  | { role: 'student'; groupId: string; code: string; exp: number };

const GROUP_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ALLOWED_CATEGORIES = new Set([
  'Grundrechnen',
  'Einheiten',
  'Prozentrechnung',
  'Terme',
  'Geometrie',
  'Funktionen',
  'Stochastik',
  'Zahlenfolgen',
]);
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const RETENTION_DAYS = 365;

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });

const normalizeCode = (value: unknown) =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const timingSafeEqual = (first: string, second: string) => {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
};

const signingKey = (secret: string) =>
  crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

const signToken = async (payload: TokenPayload, secret: string) => {
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
};

const verifyToken = async (token: string, secret: string): Promise<TokenPayload | null> => {
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(secret),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as TokenPayload;
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
};

const bearerToken = (request: Request) => {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};

const teacherPayload = async (request: Request, env: Env) => {
  const payload = await verifyToken(bearerToken(request), env.SESSION_SIGNING_SECRET);
  return payload?.role === 'teacher' ? payload : null;
};

const corsHeaders = (request: Request, env: Env) => {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const randomGroupCode = () => {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return [...values].map((value) => GROUP_ALPHABET[value % GROUP_ALPHABET.length]).join('');
};

const groupRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  name: String(row.name),
  code: String(row.code),
  isOpen: Boolean(row.is_open),
  createdAt: String(row.created_at),
  openedAt: String(row.opened_at),
  closedAt: row.closed_at ? String(row.closed_at) : null,
  attemptCount: Number(row.attempt_count ?? 0),
  averagePercent: row.average_percent == null ? null : Number(row.average_percent),
  lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
});

const cleanupOldAttempts = async (env: Env) => {
  await env.DB.prepare(`DELETE FROM attempts WHERE submitted_at < datetime('now', ?)`)
    .bind(`-${RETENTION_DAYS} days`)
    .run();
};

const handleTeacherLogin = async (request: Request, env: Env, cors: HeadersInit) => {
  if (!env.TEACHER_CODE_HASH || !env.SESSION_SIGNING_SECRET) {
    return json({ error: 'Der Lehrerzugang ist noch nicht eingerichtet.' }, 503, cors);
  }
  const body = await request.json().catch(() => ({})) as { accessCode?: unknown };
  const accessCode = cleanText(body.accessCode, 120);
  const suppliedHash = await sha256Hex(accessCode);
  if (!accessCode || !timingSafeEqual(suppliedHash, env.TEACHER_CODE_HASH.toLowerCase())) {
    return json({ error: 'Der Zugangscode ist nicht richtig.' }, 401, cors);
  }
  const token = await signToken(
    { role: 'teacher', exp: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60 },
    env.SESSION_SIGNING_SECRET,
  );
  return json({ token }, 200, cors);
};

const handleJoinGroup = async (request: Request, env: Env, cors: HeadersInit) => {
  const body = await request.json().catch(() => ({})) as { code?: unknown };
  const code = normalizeCode(body.code);
  if (code.length !== 6) return json({ error: 'Bitte gib den sechsstelligen Gruppencode ein.' }, 400, cors);

  const group = await env.DB.prepare('SELECT id, name, code FROM practice_groups WHERE code = ? AND is_open = 1')
    .bind(code)
    .first<{ id: string; name: string; code: string }>();
  if (!group) return json({ error: 'Diese Gruppe ist nicht geöffnet. Prüfe den Code bei deiner Lehrkraft.' }, 404, cors);

  const token = await signToken(
    { role: 'student', groupId: group.id, code: group.code, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 },
    env.SESSION_SIGNING_SECRET,
  );
  return json({ group: { code: group.code, name: group.name }, token }, 200, cors);
};

const validAttemptItems = (value: unknown): value is AttemptItem[] =>
  Array.isArray(value) &&
  value.length === 12 &&
  new Set(value.map((item) => item?.questionId)).size === value.length &&
  value.every((item) =>
    item &&
    typeof item.questionId === 'string' && item.questionId.length >= 1 && item.questionId.length <= 80 &&
    typeof item.category === 'string' && ALLOWED_CATEGORIES.has(item.category) &&
    typeof item.correct === 'boolean');

const handleSubmitAttempt = async (request: Request, env: Env, cors: HeadersInit) => {
  const payload = await verifyToken(bearerToken(request), env.SESSION_SIGNING_SECRET);
  if (!payload || payload.role !== 'student') return json({ error: 'Die Gruppenzuordnung ist abgelaufen. Bitte gib den Code erneut ein.' }, 401, cors);

  const body = await request.json().catch(() => ({})) as {
    attemptId?: unknown;
    durationSeconds?: unknown;
    results?: unknown;
  };
  const attemptId = cleanText(body.attemptId, 50);
  const durationSeconds = Number(body.durationSeconds);
  if (!/^[0-9a-f-]{20,50}$/i.test(attemptId) || !Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 3600 || !validAttemptItems(body.results)) {
    return json({ error: 'Das Ergebnis konnte nicht verarbeitet werden.' }, 400, cors);
  }

  const group = await env.DB.prepare('SELECT id FROM practice_groups WHERE id = ? AND code = ? AND is_open = 1')
    .bind(payload.groupId, payload.code)
    .first();
  if (!group) return json({ error: 'Die Gruppe wurde inzwischen geschlossen.' }, 409, cors);

  const existing = await env.DB.prepare('SELECT id FROM attempts WHERE id = ?').bind(attemptId).first();
  if (existing) return json({ accepted: true }, 200, cors);

  const results = body.results;
  const score = results.filter((item) => item.correct).length;
  const statements = [
    env.DB.prepare('INSERT INTO attempts (id, group_id, duration_seconds, score, total) VALUES (?, ?, ?, ?, ?)')
      .bind(attemptId, payload.groupId, durationSeconds, score, results.length),
    ...results.map((item) =>
      env.DB.prepare('INSERT INTO attempt_results (attempt_id, question_id, category, is_correct) VALUES (?, ?, ?, ?)')
        .bind(attemptId, cleanText(item.questionId, 80), cleanText(item.category, 50), item.correct ? 1 : 0)),
  ];
  await env.DB.batch(statements);
  return json({ accepted: true }, 201, cors);
};

const listGroups = async (env: Env, cors: HeadersInit) => {
  await cleanupOldAttempts(env);
  const result = await env.DB.prepare(`
    SELECT g.*,
      COUNT(a.id) AS attempt_count,
      ROUND(AVG(CASE WHEN a.total > 0 THEN a.score * 100.0 / a.total END), 1) AS average_percent,
      MAX(a.submitted_at) AS last_attempt_at
    FROM practice_groups g
    LEFT JOIN attempts a ON a.group_id = g.id
    GROUP BY g.id
    ORDER BY g.is_open DESC, g.opened_at DESC, g.created_at DESC
  `).all<Record<string, unknown>>();
  return json({ groups: result.results.map(groupRow) }, 200, cors);
};

const createGroup = async (request: Request, env: Env, cors: HeadersInit) => {
  const body = await request.json().catch(() => ({})) as { name?: unknown };
  const name = cleanText(body.name, 40);
  if (!name) return json({ error: 'Bitte gib einen Gruppennamen ein.' }, 400, cors);

  const id = crypto.randomUUID();
  let code = '';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomGroupCode();
    const exists = await env.DB.prepare('SELECT code FROM practice_groups WHERE code = ?').bind(candidate).first();
    if (!exists) { code = candidate; break; }
  }
  if (!code) return json({ error: 'Es konnte kein Gruppencode erzeugt werden. Bitte versuche es erneut.' }, 503, cors);

  await env.DB.prepare('INSERT INTO practice_groups (id, name, code) VALUES (?, ?, ?)').bind(id, name, code).run();
  const row = await env.DB.prepare('SELECT * FROM practice_groups WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return json({ group: groupRow(row!) }, 201, cors);
};

const setGroupOpen = async (request: Request, env: Env, cors: HeadersInit, groupId: string) => {
  const body = await request.json().catch(() => ({})) as { isOpen?: unknown };
  if (typeof body.isOpen !== 'boolean') return json({ error: 'Der Gruppenstatus ist ungültig.' }, 400, cors);

  const update = body.isOpen
    ? "UPDATE practice_groups SET is_open = 1, opened_at = CURRENT_TIMESTAMP, closed_at = NULL WHERE id = ?"
    : "UPDATE practice_groups SET is_open = 0, closed_at = CURRENT_TIMESTAMP WHERE id = ?";
  const result = await env.DB.prepare(update).bind(groupId).run();
  if (!result.meta.changes) return json({ error: 'Die Gruppe wurde nicht gefunden.' }, 404, cors);
  const row = await env.DB.prepare('SELECT * FROM practice_groups WHERE id = ?').bind(groupId).first<Record<string, unknown>>();
  return json({ group: groupRow(row!) }, 200, cors);
};

const groupStats = async (env: Env, cors: HeadersInit, groupId: string) => {
  await cleanupOldAttempts(env);
  const group = await env.DB.prepare('SELECT id, name, code, is_open FROM practice_groups WHERE id = ?')
    .bind(groupId)
    .first<{ id: string; name: string; code: string; is_open: number }>();
  if (!group) return json({ error: 'Die Gruppe wurde nicht gefunden.' }, 404, cors);

  const summary = await env.DB.prepare(`
    SELECT COUNT(*) AS attempt_count,
      ROUND(AVG(score), 1) AS average_score,
      ROUND(AVG(score * 100.0 / total), 1) AS average_percent,
      ROUND(AVG(duration_seconds)) AS average_duration_seconds,
      MAX(submitted_at) AS last_attempt_at
    FROM attempts WHERE group_id = ?
  `).bind(groupId).first<Record<string, unknown>>();

  const categories = await env.DB.prepare(`
    SELECT r.category,
      SUM(r.is_correct) AS correct,
      COUNT(*) AS total,
      ROUND(SUM(r.is_correct) * 100.0 / COUNT(*), 1) AS percent
    FROM attempt_results r
    JOIN attempts a ON a.id = r.attempt_id
    WHERE a.group_id = ?
    GROUP BY r.category
    ORDER BY percent ASC, r.category ASC
  `).bind(groupId).all<Record<string, unknown>>();

  return json({
    group: { id: group.id, name: group.name, code: group.code, isOpen: Boolean(group.is_open) },
    summary: {
      attemptCount: Number(summary?.attempt_count ?? 0),
      averageScore: summary?.average_score == null ? null : Number(summary.average_score),
      averagePercent: summary?.average_percent == null ? null : Number(summary.average_percent),
      averageDurationSeconds: summary?.average_duration_seconds == null ? null : Number(summary.average_duration_seconds),
      lastAttemptAt: summary?.last_attempt_at ? String(summary.last_attempt_at) : null,
    },
    categories: categories.results.map((row) => ({
      category: String(row.category),
      correct: Number(row.correct),
      total: Number(row.total),
      percent: Number(row.percent),
    })),
  }, 200, cors);
};

const route = async (request: Request, env: Env, cors: HeadersInit) => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';

  if (request.method === 'GET' && path === '/v1/health') return json({ ok: true }, 200, cors);
  if (request.method === 'POST' && path === '/v1/groups/join') return handleJoinGroup(request, env, cors);
  if (request.method === 'POST' && path === '/v1/attempts') return handleSubmitAttempt(request, env, cors);
  if (request.method === 'POST' && path === '/v1/teacher/login') return handleTeacherLogin(request, env, cors);

  if (path.startsWith('/v1/teacher/')) {
    if (!(await teacherPayload(request, env))) return json({ error: 'Bitte melde dich erneut im Lehrerbereich an.' }, 401, cors);
    if (request.method === 'GET' && path === '/v1/teacher/groups') return listGroups(env, cors);
    if (request.method === 'POST' && path === '/v1/teacher/groups') return createGroup(request, env, cors);

    const match = path.match(/^\/v1\/teacher\/groups\/([^/]+)(\/stats)?$/);
    if (match && request.method === 'PATCH' && !match[2]) return setGroupOpen(request, env, cors, decodeURIComponent(match[1]));
    if (match && request.method === 'GET' && match[2]) return groupStats(env, cors, decodeURIComponent(match[1]));
  }

  return json({ error: 'Nicht gefunden.' }, 404, cors);
};

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: 'Diese Anfrage ist nicht erlaubt.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      return await route(request, env, cors);
    } catch (error) {
      console.error('MatheKlar statistics error', error instanceof Error ? error.message : error);
      return json({ error: 'Die Statistik ist vorübergehend nicht erreichbar.' }, 500, cors);
    }
  },
};

export default worker;
