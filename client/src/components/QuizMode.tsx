import { useState, useEffect } from 'react';
import katex from 'katex';
import { getProblems, submitAttempt, type Problem } from '../api';

interface QuizModeProps {
  sessionId: number;
  onDone: () => void;
}

function renderMath(text: string): React.ReactNode[] {
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const formula = part.slice(1, -1);
      try {
        const html = katex.renderToString(formula, { throwOnError: false, displayMode: false });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        return <span key={i}>{part}</span>;
      }
    }
    return <span key={i}>{part}</span>;
  });
}

type AnswerState = 'unanswered' | 'correct' | 'missed';

interface AttemptResult {
  problemId: number;
  topicName: string;
  correct: boolean;
}

export default function QuizMode({ sessionId, onDone }: QuizModeProps) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [results, setResults] = useState<AttemptResult[]>([]);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const probs = await getProblems(sessionId);
        if (!cancelled) {
          // Shuffle
          const shuffled = [...probs].sort(() => Math.random() - 0.5);
          setProblems(shuffled);
        }
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'Failed to load problems.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  async function handleAnswer(correct: boolean) {
    setAnswerState(correct ? 'correct' : 'missed');
    setSubmitting(true);
    const prob = problems[current];
    try {
      await submitAttempt(sessionId, String(prob.id), correct);
    } catch { /* best effort */ }
    setResults((r: AttemptResult[]) => [...r, { problemId: prob.id, topicName: prob.topicName, correct }]);
    setSubmitting(false);
  }

  function handleNext() {
    const nextIdx = current + 1;
    if (nextIdx >= problems.length) {
      setDone(true);
    } else {
      setCurrent(nextIdx);
      setAnswerState('unanswered');
      setShowHint(false);
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

  if (problems.length === 0) {
    return (
      <div className="text-center py-24 text-gray-500">
        No problems found for this session.
        <div className="mt-4">
          <button onClick={onDone} className="text-blue-400 hover:underline text-sm">← Back</button>
        </div>
      </div>
    );
  }

  if (done) {
    const totalCorrect = results.filter((r: AttemptResult) => r.correct).length;
    const total = results.length;
    const pct = total > 0 ? Math.round((totalCorrect / total) * 100) : 0;

    // Group by topic
    const byTopic: Record<string, { correct: number; total: number }> = {};
    for (const r of results) {
      if (!byTopic[r.topicName]) byTopic[r.topicName] = { correct: 0, total: 0 };
      byTopic[r.topicName].total++;
      if (r.correct) byTopic[r.topicName].correct++;
    }

    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-100 mb-2">Quiz Complete!</h2>
        <p className="text-gray-500 text-sm mb-6">Here's how you did.</p>

        {/* Score card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center mb-6">
          <div className="text-6xl font-bold mb-2" style={{ color: pct >= 70 ? '#60a5fa' : pct >= 50 ? '#facc15' : '#f87171' }}>
            {pct}%
          </div>
          <p className="text-gray-400 text-lg">{totalCorrect} / {total} correct</p>
        </div>

        {/* By topic */}
        {Object.keys(byTopic).length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-500 mb-4">By Topic</h3>
            <div className="space-y-3">
              {Object.entries(byTopic).map(([topic, stats]) => {
                const topicPct = Math.round((stats.correct / stats.total) * 100);
                return (
                  <div key={topic}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{topic}</span>
                      <span className="text-gray-500">{stats.correct}/{stats.total}</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${topicPct}%`,
                          backgroundColor: topicPct >= 70 ? '#60a5fa' : topicPct >= 50 ? '#facc15' : '#f87171',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onDone}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Back to Sessions
          </button>
          <button
            onClick={() => {
              setCurrent(0);
              setResults([]);
              setAnswerState('unanswered');
              setShowHint(false);
              setDone(false);
              setProblems((p: Problem[]) => [...p].sort(() => Math.random() - 0.5));
            }}
            className="px-4 py-2 text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg text-sm transition-colors"
          >
            Retry Quiz
          </button>
        </div>
      </div>
    );
  }

  const prob = problems[current];
  const solutionLines = prob.solution ? prob.solution.split(/\n+/).filter((l: string) => l.trim()) : [];
  const difficultyColor = {
    easy: 'text-green-400 bg-green-900/30 border-green-800',
    medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
    hard: 'text-red-400 bg-red-900/30 border-red-800',
  }[prob.difficulty];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-500 mb-2">
          <span>Question {current + 1} of {problems.length}</span>
          <span>{results.filter((r: AttemptResult) => r.correct).length} correct so far</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((current) / problems.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Problem card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-7 mb-4">
        <div className="flex items-center justify-between mb-5">
          <span className="text-xs text-gray-500">{prob.topicName}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${difficultyColor}`}>
            {prob.difficulty}
          </span>
        </div>

        <p className="text-lg text-gray-100 leading-relaxed mb-6">
          {renderMath(prob.question)}
        </p>

        {/* Hint */}
        {prob.hint && answerState === 'unanswered' && (
          <div className="mb-4">
            <button
              onClick={() => setShowHint((s: boolean) => !s)}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showHint ? '▲ Hide hint' : '▼ Show hint'}
            </button>
            {showHint && (
              <div className="mt-2 bg-blue-900/20 border border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-200">
                {renderMath(prob.hint)}
              </div>
            )}
          </div>
        )}

        {/* Self-report buttons */}
        {answerState === 'unanswered' && (
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer(true)}
              disabled={submitting}
              className="flex-1 py-3 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>Got it</span>
              <span className="text-green-300">✓</span>
            </button>
            <button
              onClick={() => handleAnswer(false)}
              disabled={submitting}
              className="flex-1 py-3 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>Missed it</span>
              <span className="text-red-300">✗</span>
            </button>
          </div>
        )}

        {/* Result feedback */}
        {answerState !== 'unanswered' && (
          <div className={`rounded-lg border p-4 mb-4 ${
            answerState === 'correct'
              ? 'bg-green-900/20 border-green-700'
              : 'bg-red-900/20 border-red-700'
          }`}>
            <p className={`font-semibold mb-1 ${answerState === 'correct' ? 'text-green-400' : 'text-red-400'}`}>
              {answerState === 'correct' ? 'Nice work!' : 'No worries — review the solution below.'}
            </p>
          </div>
        )}

        {/* Solution (shown after answer) */}
        {answerState !== 'unanswered' && solutionLines.length > 0 && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-5 py-4 mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Step-by-step solution</p>
            <div className="space-y-1.5">
              {solutionLines.map((line, i) => (
                <p key={i} className="text-sm text-gray-300 leading-relaxed">
                  {renderMath(line)}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Next button */}
        {answerState !== 'unanswered' && (
          <button
            onClick={handleNext}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
          >
            {current + 1 >= problems.length ? 'See Results' : 'Next Question →'}
          </button>
        )}
      </div>
    </div>
  );
}
