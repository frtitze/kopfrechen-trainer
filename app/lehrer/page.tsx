'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTeacherGroup,
  getTeacherGroupStats,
  listTeacherGroups,
  setTeacherGroupOpen,
  statsConfigured,
  teacherLogin,
} from '../../lib/stats-api';
import type { GroupStats, TeacherGroup } from '../../lib/stats-api';

const TOKEN_KEY = 'matheklar-teacher-session';

const formatDate = (value: string | null) => {
  if (!value) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(`${value.replace(' ', 'T')}Z`));
};

const formatDuration = (seconds: number | null) => {
  if (seconds == null) return '–';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest} min`;
};

export default function TeacherPage() {
  const [token, setToken] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (!saved) return;
    const frame = window.requestAnimationFrame(() => setToken(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setGroups([]);
    setStats(null);
    setSelectedId('');
  }, []);

  const loadGroups = useCallback(async (currentToken: string, keepSelection = true) => {
    try {
      const result = await listTeacherGroups(currentToken);
      setGroups(result.groups);
      setMessage('');
      const stillExists = keepSelection && result.groups.some((group) => group.id === selectedId);
      if (!stillExists) setSelectedId(result.groups[0]?.id ?? '');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Die Gruppen konnten nicht geladen werden.';
      setMessage(text);
      if (text.includes('erneut')) logout();
    }
  }, [logout, selectedId]);

  useEffect(() => {
    if (!token) return;
    const frame = window.requestAnimationFrame(() => void loadGroups(token));
    return () => window.cancelAnimationFrame(frame);
  }, [loadGroups, token]);

  useEffect(() => {
    if (!token || !selectedId) return;
    let active = true;
    getTeacherGroupStats(token, selectedId)
      .then((result) => { if (active) setStats(result); })
      .catch((error) => { if (active) setMessage(error instanceof Error ? error.message : 'Die Auswertung konnte nicht geladen werden.'); });
    return () => { active = false; };
  }, [selectedId, token, groups]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedId) ?? null,
    [groups, selectedId],
  );
  const selectedStats = stats?.group.id === selectedId ? stats : null;

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await teacherLogin(accessCode);
      window.localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setAccessCode('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Die Anmeldung ist fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newGroupName.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await createTeacherGroup(token, newGroupName);
      setNewGroupName('');
      await loadGroups(token, false);
      setSelectedId(result.group.id);
      setMessage(`Gruppe „${result.group.name}“ ist geöffnet. Code: ${result.group.code}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Die Gruppe konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  };

  const toggleGroup = async (group: TeacherGroup) => {
    setBusy(true);
    setMessage('');
    try {
      await setTeacherGroupOpen(token, group.id, !group.isOpen);
      await loadGroups(token);
      setMessage(group.isOpen ? `„${group.name}“ wurde geschlossen.` : `„${group.name}“ ist wieder geöffnet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Der Status konnte nicht geändert werden.');
    } finally {
      setBusy(false);
    }
  };

  if (!statsConfigured) {
    return (
      <main className="teacher-shell">
        <nav className="topbar compact">
          <a className="brand" href="../"><span className="brand-mark">M</span><span>MatheKlar</span></a>
          <span className="class-badge">Lehrerbereich</span>
        </nav>
        <section className="teacher-empty">
          <p className="eyebrow">Einmalige Einrichtung</p>
          <h1>Die Statistik ist vorbereitet.</h1>
          <p>Nach dem Verbinden der sicheren Datenbank erscheint hier automatisch die Gruppenverwaltung.</p>
        </section>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="teacher-shell">
        <nav className="topbar compact">
          <a className="brand" href="../"><span className="brand-mark">M</span><span>MatheKlar</span></a>
          <span className="class-badge">Lehrerbereich</span>
        </nav>
        <section className="teacher-login">
          <div>
            <p className="eyebrow">Geschützter Bereich</p>
            <h1>Guten Morgen.</h1>
            <p>Mit deinem Lehrer-Code verwaltest du Gruppen und erkennst gemeinsame Übungsfelder – ohne Schülernamen.</p>
          </div>
          <form className="teacher-login-card" onSubmit={handleLogin}>
            <label htmlFor="teacher-code">Lehrer-Code</label>
            <input
              autoComplete="current-password"
              id="teacher-code"
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="Dein persönlicher Zugangscode"
              required
              type="password"
              value={accessCode}
            />
            {message && <p className="form-message error-message" role="alert">{message}</p>}
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? 'Wird geprüft …' : 'Lehrerbereich öffnen'} <span aria-hidden="true">→</span>
            </button>
            <p>Die Anmeldung bleibt auf diesem Gerät 90 Tage gespeichert.</p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="teacher-shell">
      <nav className="topbar compact teacher-topbar">
        <a className="brand" href="../"><span className="brand-mark">M</span><span>MatheKlar</span></a>
        <div className="teacher-nav-actions">
          <button className="text-button" onClick={() => void loadGroups(token)} type="button">Aktualisieren</button>
          <button className="text-button" onClick={logout} type="button">Abmelden</button>
        </div>
      </nav>

      <section className="teacher-heading">
        <div>
          <p className="eyebrow">Anonyme Gruppenstatistik</p>
          <h1>Klassen im Blick.</h1>
          <p>Neue Gruppe anlegen oder eine bestehende Gruppe öffnen. Die Schüler geben anschließend nur den sechsstelligen Code ein.</p>
        </div>
        <form className="new-group-card" onSubmit={handleCreateGroup}>
          <label htmlFor="group-name">Neue Gruppe</label>
          <div>
            <input
              id="group-name"
              maxLength={40}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="z. B. 10a · Montag"
              required
              value={newGroupName}
            />
            <button className="primary-button" disabled={busy} type="submit">Anlegen</button>
          </div>
        </form>
      </section>

      {message && <p className="dashboard-message" role="status">{message}</p>}

      <div className="teacher-layout">
        <aside className="group-panel">
          <div className="panel-title"><h2>Deine Gruppen</h2><span>{groups.length}</span></div>
          {groups.length === 0 ? (
            <p className="empty-copy">Lege oben deine erste Gruppe an.</p>
          ) : (
            <div className="group-list">
              {groups.map((group) => (
                <button
                  className={`group-list-item ${selectedId === group.id ? 'selected' : ''}`}
                  key={group.id}
                  onClick={() => setSelectedId(group.id)}
                  type="button"
                >
                  <span><strong>{group.name}</strong><small>{group.attemptCount} Ergebnisse</small></span>
                  <span className={group.isOpen ? 'status-open' : 'status-closed'}>{group.isOpen ? 'offen' : 'zu'}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="stats-panel">
          {!selectedGroup || !selectedStats ? (
            <div className="empty-copy">Wähle links eine Gruppe aus.</div>
          ) : (
            <>
              <header className="group-detail-header">
                <div>
                  <p className="eyebrow">{selectedGroup.isOpen ? 'Gruppe geöffnet' : 'Gruppe geschlossen'}</p>
                  <h2>{selectedGroup.name}</h2>
                </div>
                <div className="group-code-box"><span>Schüler-Code</span><strong>{selectedGroup.code}</strong></div>
                <button className="secondary-button" disabled={busy} onClick={() => void toggleGroup(selectedGroup)} type="button">
                  {selectedGroup.isOpen ? 'Gruppe schließen' : 'Wieder öffnen'}
                </button>
              </header>

              <div className="summary-grid">
                <article><span>Runden</span><strong>{selectedStats.summary.attemptCount}</strong></article>
                <article><span>Durchschnitt</span><strong>{selectedStats.summary.averageScore == null ? '–' : `${selectedStats.summary.averageScore} / 12`}</strong></article>
                <article><span>Trefferquote</span><strong>{selectedStats.summary.averagePercent == null ? '–' : `${selectedStats.summary.averagePercent} %`}</strong></article>
                <article><span>Ø Zeit</span><strong>{formatDuration(selectedStats.summary.averageDurationSeconds)}</strong></article>
              </div>

              <section className="category-dashboard" aria-labelledby="category-title">
                <div className="section-heading compact-heading">
                  <div><p className="eyebrow">Gemeinsame Übungsfelder</p><h2 id="category-title">Themenübersicht</h2></div>
                  <p className="topic-results-note">Letztes Ergebnis: {formatDate(selectedStats.summary.lastAttemptAt)}</p>
                </div>
                {selectedStats.categories.length === 0 ? (
                  <p className="empty-copy">Sobald die erste Runde abgeschlossen ist, erscheint hier die Auswertung.</p>
                ) : (
                  <div className="category-table">
                    {selectedStats.categories.map((category) => (
                      <article key={category.category}>
                        <div><strong>{category.category}</strong><span>{category.correct} von {category.total} richtig</span></div>
                        <div className="skill-track"><span style={{ width: `${category.percent}%` }} /></div>
                        <b>{category.percent} %</b>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </div>

      <footer className="teacher-privacy">
        <strong>Datensparsam eingerichtet</strong>
        <span>Keine Namen, Konten oder eingegebenen Antworten. Einzelne Übungsrunden werden nach 365 Tagen automatisch gelöscht.</span>
      </footer>
    </main>
  );
}
