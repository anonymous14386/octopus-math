import { useState, useEffect, useCallback } from 'react';
import Login from './components/Login';
import Upload from './components/Upload';
import TopicList from './components/TopicList';
import LessonViewer from './components/LessonViewer';
import QuizMode from './components/QuizMode';
import { getSessions, generateStudy, getClasses, createClass, deleteClass, type StudySession, type Topic, type MathClass } from './api';

type View = 'upload' | 'sessions' | 'study' | 'quiz';

interface AppState {
  authed: boolean;
  view: View;
  sessionId?: number;
  activeTopic?: Topic;
  sessions: StudySession[];
  activeSession?: StudySession;
  loading: boolean;
}

const CLASS_KEY = 'octopus_math_class';

export default function App() {
  const [state, setState] = useState<AppState>({
    authed: false,
    view: 'upload',
    sessions: [],
    loading: true,
  });

  const [classes, setClasses] = useState<MathClass[]>([]);
  const [activeClassId, setActiveClassId] = useState<number | null>(() => {
    const stored = localStorage.getItem(CLASS_KEY);
    return stored ? parseInt(stored) : null;
  });
  const [showNewClass, setShowNewClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubject, setNewClassSubject] = useState('');

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) setState(s => ({ ...s, authed: true, loading: false }));
      else setState(s => ({ ...s, authed: false, loading: false }));
    } catch {
      setState(s => ({ ...s, authed: false, loading: false }));
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const loadClasses = useCallback(async () => {
    try { setClasses(await getClasses()); } catch { /* ignore */ }
  }, []);

  const loadSessions = useCallback(async (classId: number | null) => {
    try {
      const sessions = await getSessions(classId);
      setState(s => ({ ...s, sessions }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (state.authed) {
      loadClasses();
      loadSessions(activeClassId);
    }
  }, [state.authed, loadClasses, loadSessions, activeClassId]);

  function switchClass(id: number | null) {
    setActiveClassId(id);
    if (id == null) localStorage.removeItem(CLASS_KEY);
    else localStorage.setItem(CLASS_KEY, String(id));
    setState(s => ({ ...s, view: 'sessions' }));
  }

  async function handleCreateClass() {
    if (!newClassName.trim()) return;
    try {
      const c = await createClass(newClassName.trim(), newClassSubject.trim() || 'Mathematics');
      setClasses(cs => [...cs, c]);
      switchClass(c.id);
      setNewClassName('');
      setNewClassSubject('');
      setShowNewClass(false);
    } catch { /* ignore */ }
  }

  async function handleDeleteClass(id: number) {
    if (!confirm('Delete this class? Sessions will be unlinked but not deleted.')) return;
    try {
      await deleteClass(id);
      setClasses(cs => cs.filter(c => c.id !== id));
      if (activeClassId === id) switchClass(null);
    } catch { /* ignore */ }
  }

  if (state.loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading…</div>
      </div>
    );
  }

  if (!state.authed) {
    return <Login onSuccess={() => setState(s => ({ ...s, authed: true }))} />;
  }

  function navigate(view: View, sessionId?: number, activeTopic?: Topic, activeSession?: StudySession) {
    setState(s => ({ ...s, view, sessionId, activeTopic, activeSession }));
    if (view === 'sessions') loadSessions(activeClassId);
  }

  const navItems: { id: View; label: string }[] = [
    { id: 'upload', label: 'Upload New' },
    { id: 'sessions', label: 'My Sessions' },
  ];

  const activeClass = classes.find(c => c.id === activeClassId) ?? null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-4 flex-wrap">
        <span className="font-bold text-blue-400 text-lg tracking-wide">🧮 Octopus Math</span>

        {/* Class selector */}
        <div className="relative flex items-center gap-1">
          <select
            value={activeClassId ?? ''}
            onChange={e => switchClass(e.target.value === '' ? null : parseInt(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {activeClass && (
            <button
              onClick={() => handleDeleteClass(activeClass.id)}
              className="text-gray-600 hover:text-red-400 text-xs transition-colors"
              title="Delete this class"
            >✕</button>
          )}
          <button
            onClick={() => setShowNewClass(v => !v)}
            className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 hover:border-blue-500 text-gray-400 hover:text-blue-400 rounded transition-colors"
            title="New class"
          >+ Class</button>
        </div>

        {/* New class inline form */}
        {showNewClass && (
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded px-3 py-1.5">
            <input
              autoFocus
              placeholder="Class name"
              value={newClassName}
              onChange={e => setNewClassName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateClass(); if (e.key === 'Escape') setShowNewClass(false); }}
              className="bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-600 w-36"
            />
            <input
              placeholder="Subject (optional)"
              value={newClassSubject}
              onChange={e => setNewClassSubject(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateClass(); if (e.key === 'Escape') setShowNewClass(false); }}
              className="bg-transparent text-sm text-gray-200 outline-none placeholder:text-gray-600 w-36"
            />
            <button onClick={handleCreateClass} className="text-xs text-blue-400 hover:text-blue-300 font-medium">Create</button>
            <button onClick={() => setShowNewClass(false)} className="text-xs text-gray-600 hover:text-gray-400">Cancel</button>
          </div>
        )}

        {/* View tabs */}
        <div className="flex gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                state.view === item.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <button
            onClick={async () => {
              await fetch('/logout', { method: 'POST' });
              setState(s => ({ ...s, authed: false }));
            }}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {state.view === 'upload' && (
          <Upload
            classes={classes}
            activeClassId={activeClassId}
            onSessionCreated={(sessionId, session) => {
              loadSessions(activeClassId);
              navigate('study', sessionId, undefined, session);
            }}
          />
        )}

        {state.view === 'sessions' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-100">
              {activeClass ? activeClass.name : 'All Sessions'}
            </h2>
            {state.sessions.length === 0 ? (
              <div className="text-gray-500 text-center py-16">
                No sessions yet.{' '}
                <button onClick={() => navigate('upload')} className="text-blue-400 hover:underline">
                  Upload some material to get started.
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {state.sessions.map(session => {
                  const sessionClass = classes.find(c => c.id === session.classId);
                  return (
                    <div key={session.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-100">{session.title}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {session.subject} &middot; {session.topics.length} topic(s) &middot;{' '}
                          <span className={`capitalize ${
                            session.status === 'ready' ? 'text-green-400' :
                            session.status === 'failed' ? 'text-red-400' :
                            session.status === 'processing' ? 'text-yellow-400' : 'text-gray-400'
                          }`}>{session.status}</span>
                          {sessionClass && activeClassId == null && (
                            <span className="ml-2 text-blue-400 text-xs">{sessionClass.name}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {session.status === 'ready' && (
                          <>
                            <button
                              onClick={() => navigate('study', session.id, undefined, session)}
                              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded font-medium transition-colors"
                            >Study</button>
                            <button
                              onClick={() => navigate('quiz', session.id, undefined, session)}
                              className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded font-medium transition-colors"
                            >Quiz</button>
                          </>
                        )}
                        {(session.status === 'failed' || session.status === 'pending') && (
                          <button
                            onClick={async () => {
                              try { await generateStudy(session.id); loadSessions(activeClassId); } catch { /* ignore */ }
                            }}
                            className="px-3 py-1.5 text-sm bg-yellow-700 hover:bg-yellow-600 rounded font-medium transition-colors"
                          >Retry</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {state.view === 'study' && state.sessionId != null && (
          state.activeTopic ? (
            <div>
              <button
                onClick={() => navigate('study', state.sessionId, undefined, state.activeSession)}
                className="mb-6 text-sm text-blue-400 hover:underline flex items-center gap-1"
              >← Back to topics</button>
              <LessonViewer topic={state.activeTopic} />
            </div>
          ) : (
            <TopicList
              sessionId={state.sessionId}
              onSelectTopic={(topic, session) => navigate('study', state.sessionId, topic, session)}
              onStartQuiz={(sessionId, session) => navigate('quiz', sessionId, undefined, session)}
              onSessionDeleted={() => navigate('sessions')}
            />
          )
        )}

        {state.view === 'quiz' && state.sessionId != null && (
          <QuizMode sessionId={state.sessionId} onDone={() => navigate('sessions')} />
        )}
      </main>
    </div>
  );
}
