'use client';

export type GroupSession = {
  code: string;
  name: string;
  token: string;
};

export type AttemptResult = {
  questionId: string;
  category: string;
  correct: boolean;
};

export type PendingAttempt = {
  attemptId: string;
  durationSeconds: number;
  token: string;
  results: AttemptResult[];
};

export type TeacherGroup = {
  id: string;
  name: string;
  code: string;
  isOpen: boolean;
  createdAt: string;
  openedAt: string;
  closedAt: string | null;
  attemptCount: number;
  averagePercent: number | null;
  lastAttemptAt: string | null;
};

export type CategoryStat = {
  category: string;
  correct: number;
  total: number;
  percent: number;
};

export type GroupStats = {
  group: Pick<TeacherGroup, 'id' | 'name' | 'code' | 'isOpen'>;
  summary: {
    attemptCount: number;
    averageScore: number | null;
    averagePercent: number | null;
    averageDurationSeconds: number | null;
    lastAttemptAt: string | null;
  };
  categories: CategoryStat[];
};

const configuredUrl =
  process.env.NEXT_PUBLIC_STATS_API_URL?.trim() ||
  'https://matheklar-statistik-api.pages.dev';
export const statsApiUrl = configuredUrl.replace(/\/$/, '');
export const statsConfigured = Boolean(statsApiUrl);

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  if (!statsApiUrl) throw new Error('Die Gruppenstatistik ist noch nicht eingerichtet.');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${statsApiUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Die Verbindung ist gerade nicht verfügbar.');
    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Die Verbindung dauert zu lange. Bitte versuche es noch einmal.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const joinGroup = (code: string) =>
  request<{ group: { code: string; name: string }; token: string }>('/v1/groups/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

export const submitAttempt = (attempt: PendingAttempt) =>
  request<{ accepted: boolean }>('/v1/attempts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${attempt.token}` },
    body: JSON.stringify({
      attemptId: attempt.attemptId,
      durationSeconds: attempt.durationSeconds,
      results: attempt.results,
    }),
  });

export const teacherLogin = (accessCode: string) =>
  request<{ token: string }>('/v1/teacher/login', {
    method: 'POST',
    body: JSON.stringify({ accessCode }),
  });

const teacherRequest = <T>(token: string, path: string, init?: RequestInit) =>
  request<T>(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });

export const listTeacherGroups = (token: string) =>
  teacherRequest<{ groups: TeacherGroup[] }>(token, '/v1/teacher/groups');

export const createTeacherGroup = (token: string, name: string) =>
  teacherRequest<{ group: TeacherGroup }>(token, '/v1/teacher/groups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const setTeacherGroupOpen = (token: string, groupId: string, isOpen: boolean) =>
  teacherRequest<{ group: TeacherGroup }>(token, `/v1/teacher/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isOpen }),
  });

export const getTeacherGroupStats = (token: string, groupId: string) =>
  teacherRequest<GroupStats>(token, `/v1/teacher/groups/${encodeURIComponent(groupId)}/stats`);
