import { useState, useEffect } from 'react';
import { getSession, deleteSession, generateProblems, getProblemCounts, type StudySession, type Topic, type ProblemCounts } from '../api';

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
  const [problemCounts, setProblemCounts] = useState<Record<string, ProblemCounts>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const s = await getSession(sessionId);
        if (!cancelled) {
          setSession(s);
          // Load problem counts for each topic
          const counts: Record<string, ProblemCounts> = {};
          await Promise.all((s.topics || []).map(async t => {
            try {
              counts[t.name] = await getProblemCounts(sessionId, t.name);
            } catch { /* ignore */ }
          }));
          if (!cancelled) setProblemCounts(counts);
        }
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Failed to load session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  async function handleGenerate(topicName: string) {
    setGenerating(g => ({ ...g, [topicName]: true }));
    try {
      await generateProblems(sessionId, topicName);
      const counts = await getProblemCounts(sessionId, topicName);
      setProblemCounts(c => ({ ...c, [topicName]: counts }));
    } catch { /* ignore */ } finally {
      setGenerating(g => ({ ...g, [topicName]: false }));
    }
  }

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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors"
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
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-colors"
            >
              <div
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => onSelectTopic(topic, session)}
              >
                <div>
                  <p className="font-semibold text-gray-100 group-hover:text-blue-300 transition-colors">
                    {topic.name}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-gray-500">
                    <span>{topic.keyFormulas?.length ?? 0} formula(s)</span>
                    {problemCounts[topic.name] ? (
                      <>
                        <span className="text-green-500">{problemCounts[topic.name].easy}e</span>
                        <span className="text-yellow-500">{problemCounts[topic.name].medium}m</span>
                        <span className="text-red-500">{problemCounts[topic.name].hard}h</span>
                        <span>/ 30 problems</span>
                      </>
                    ) : (
                      <span>0 problems</span>
                    )}
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              {(problemCounts[topic.name]?.total ?? 0) < 30 && (
                <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {30 - (problemCounts[topic.name]?.total ?? 0)} problems needed to reach bank of 30
                  </p>
                  <button
                    onClick={() => handleGenerate(topic.name)}
                    disabled={generating[topic.name]}
                    className="text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded font-medium transition-colors flex items-center gap-1.5"
                  >
                    {generating[topic.name] ? (
                      <>
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        Generating…
                      </>
                    ) : 'Generate Problems'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
