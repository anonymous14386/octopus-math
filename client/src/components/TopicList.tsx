import { useState, useEffect } from 'react';
import { getSession, deleteSession, type StudySession, type Topic } from '../api';

interface TopicListProps {
  sessionId: number;
  onSelectTopic: (topic: Topic, session: StudySession) => void;
  onStartQuiz: (sessionId: number, session: StudySession) => void;
  onSessionDeleted: () => void;
}

export default function TopicList({ sessionId, onSelectTopic, onStartQuiz, onSessionDeleted }: TopicListProps) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const s = await getSession(sessionId);
        if (!cancelled) setSession(s);
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Failed to load session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  async function handleDelete() {
    if (!confirm('Delete this study session and all its problems?')) return;
    setDeleting(true);
    try {
      await deleteSession(sessionId);
      onSessionDeleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Delete failed.');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="bg-red-900/30 border border-red-700 text-red-400 rounded-md px-4 py-3 text-sm">
        {errorMsg}
      </div>
    );
  }

  if (!session) return null;

  const topics = session.topics || [];

  return (
    <div>
      {/* Session header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">{session.title}</h2>
          <p className="text-sm text-gray-500 mt-1">{session.subject} &middot; {topics.length} topic(s)</p>
        </div>
        <div className="flex gap-2">
          {topics.length > 0 && (
            <button
              onClick={() => onStartQuiz(sessionId, session)}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Start Quiz
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-2 text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {topics.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          No topics found. The study guide may still be processing.
        </div>
      ) : (
        <div className="grid gap-3">
          {topics.map((topic, idx) => (
            <div
              key={idx}
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 flex items-center justify-between transition-colors group cursor-pointer"
              onClick={() => onSelectTopic(topic, session)}
            >
              <div>
                <p className="font-semibold text-gray-100 group-hover:text-blue-300 transition-colors">
                  {topic.name}
                </p>
                <div className="flex gap-4 mt-1 text-xs text-gray-500">
                  <span>{topic.keyFormulas?.length ?? 0} formula(s)</span>
                  <span>{topic.practiceProblems?.length ?? 0} practice problem(s)</span>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
