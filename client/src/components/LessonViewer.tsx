import { useState, type ReactNode } from 'react';
import katex from 'katex';
import { type Topic, type PracticeProblems } from '../api';

interface LessonViewerProps {
  topic: Topic;
}

// Split text on $...$ inline math delimiters and render each part.
function renderMath(text: string): ReactNode[] {
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

function renderBlockMath(formula: string): string {
  try {
    return katex.renderToString(formula.replace(/^\$\$?|\$\$?$/g, '').trim(), {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    return formula;
  }
}

interface PracticeProblemCardProps {
  problem: PracticeProblems;
  index: number;
}

function PracticeProblemCard({ problem, index }: PracticeProblemCardProps) {
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const difficultyColor = {
    easy: 'text-green-400 bg-green-900/30 border-green-800',
    medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
    hard: 'text-red-400 bg-red-900/30 border-red-800',
  }[problem.difficulty];

  const solutionSteps = problem.solution
    ? problem.solution.split(/\n+/).filter(l => l.trim())
    : [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="font-medium text-gray-200 flex-1">
          <span className="text-gray-500 mr-2">{index}.</span>
          {renderMath(problem.question)}
        </p>
        <span className={`ml-3 shrink-0 text-xs font-semibold px-2 py-0.5 rounded border capitalize ${difficultyColor}`}>
          {problem.difficulty}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        {problem.hint && (
          <button
            onClick={() => setShowHint((s: boolean) => !s)}
            className="text-xs px-3 py-1 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded transition-colors"
          >
            {showHint ? 'Hide Hint' : 'Show Hint'}
          </button>
        )}
        <button
          onClick={() => setShowSolution((s: boolean) => !s)}
          className="text-xs px-3 py-1 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 rounded transition-colors"
        >
          {showSolution ? 'Hide Solution' : 'Show Solution'}
        </button>
      </div>

      {showHint && problem.hint && (
        <div className="mt-3 bg-blue-900/20 border border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-200">
          <span className="font-semibold text-blue-400">Hint: </span>
          {renderMath(problem.hint)}
        </div>
      )}

      {showSolution && (
        <div className="mt-3 bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Solution</p>
          <div className="space-y-1">
            {solutionSteps.map((step, i) => (
              <p key={i} className="text-sm text-gray-300 leading-relaxed">
                {renderMath(step)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LessonViewer({ topic }: LessonViewerProps) {
  const explanationParagraphs = topic.explanation
    ? topic.explanation.split(/\n\n+/)
    : [];

  return (
    <div className="max-w-3xl">
      <h2 className="text-3xl font-bold text-gray-100 mb-6">{topic.name}</h2>

      {/* Explanation */}
      {explanationParagraphs.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">Explanation</h3>
          <div className="space-y-3">
            {explanationParagraphs.map((para, i) => (
              <p key={i} className="text-gray-300 leading-relaxed">
                {renderMath(para)}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Key Formulas */}
      {topic.keyFormulas && topic.keyFormulas.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">Key Formulas</h3>
          <div className="space-y-3">
            {topic.keyFormulas.map((formula, i) => (
              <div
                key={i}
                className="bg-gray-900 border border-gray-800 rounded-lg px-5 py-3 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: renderBlockMath(formula) }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Worked Example */}
      {topic.workedExample && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">Worked Example</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="font-semibold text-gray-200 mb-4">
              {renderMath(topic.workedExample.problem)}
            </p>
            <ol className="list-decimal list-inside space-y-2 mb-4">
              {topic.workedExample.steps.map((step, i) => (
                <li key={i} className="text-gray-300 text-sm leading-relaxed">
                  {renderMath(step)}
                </li>
              ))}
            </ol>
            {topic.workedExample.answer && (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-4 py-2 mt-3">
                <span className="text-blue-400 font-semibold text-sm">Answer: </span>
                <span className="text-gray-200 text-sm">{renderMath(topic.workedExample.answer)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Practice Problems */}
      {topic.practiceProblems && topic.practiceProblems.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-blue-400 mb-3">
            Practice Problems
          </h3>
          <div className="space-y-4">
            {topic.practiceProblems.map((prob, i) => (
              <PracticeProblemCard key={i} problem={prob} index={i + 1} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
