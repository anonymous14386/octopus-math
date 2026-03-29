import { useState, useEffect, useCallback } from 'react';
import Login from './components/Login';
import Upload from './components/Upload';
import TopicList from './components/TopicList';
import LessonViewer from './components/LessonViewer';
import QuizMode from './components/QuizMode';
import { getSessions, generateStudy, type StudySession, type Topic } from './api';

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

export default function App() {
  const [state, setState] = useState<AppState>({
    authed: false,
    view: 'upload',
    sessions: [],
    loading: true,
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        setState(s => ({ ...s, authed: true, loading: false }));
      } else {
        setState(s => ({ ...s, authed: false, loading: false }));
      }
    } catch {
      setState(s => ({ ...s, authed: false, loading: false }));
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const loadSessions = useCallback(async () => {
    try {
      const sessions = await getSessions();
      setState(s => ({ ...s, sessions }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (state.authed) loadSessions();
  }, [state.authed, loadSessions]);

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
    if (view === 'sessions') loadSessions();
  }

  const navItems: { id: View; label: string }[] = [
    { id: 'upload', label: 'Upload New' },
    { id: 'sessions', label: 'My Sessions' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Nav bar */}
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-blue-400 text-lg tracking-wide">Octopus Math</span>
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

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {state.view === 'upload' && (
          <Upload
            onSessionCreated={(sessionId, session) => {
              loadSessions();
              navigate('study', sessionId, undefined, session);
            }}
          />
        )}

        {state.view === 'sessions' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-gray-100">My Study Sessions</h2>
            {state.sessions.length === 0 ? (
              <div className="text-gray-500 text-center py-16">
                No sessions yet.{' '}
                <button
                  onClick={() => navigate('upload')}
                  className="text-blue-400 hover:underline"
                >
                  Upload some material to get started.
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {state.sessions.map(session => (
                  <div
                    key={session.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-100">{session.title}</p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {session.subject} &middot; {session.topics.length} topic(s) &middot;{' '}
                        <span className={`capitalize ${
                          session.status === 'ready' ? 'text-green-400' :
                          session.status === 'failed' ? 'text-red-400' :
                          session.status === 'processing' ? 'text-yellow-400' : 'text-gray-400'
                        }`}>{session.status}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {session.status === 'ready' && (
                        <>
                          <button
                            onClick={() => navigate('study', session.id, undefined, session)}
                            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded font-medium transition-colors"
                          >
                            Study
                          </button>
                          <button
                            onClick={() => navigate('quiz', session.id, undefined, session)}
                            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded font-medium transition-colors"
                          >
                            Quiz
                          </button>
                        </>
                      )}
                      {(session.status === 'failed' || session.status === 'pending') && (
                        <button
                          onClick={async () => {
                            try {
                              await generateStudy(session.id);
                              loadSessions();
                            } catch { /* ignore */ }
                          }}
                          className="px-3 py-1.5 text-sm bg-yellow-700 hover:bg-yellow-600 rounded font-medium transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
              >
                ← Back to topics
              </button>
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
          <QuizMode
            sessionId={state.sessionId}
            onDone={() => navigate('sessions')}
          />
        )}
      </main>
    </div>
  );
}
