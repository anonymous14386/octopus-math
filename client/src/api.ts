// ---- Types ----

export interface PracticeProblems {
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  hint: string;
  solution: string;
}

export interface WorkedExample {
  problem: string;
  steps: string[];
  answer: string;
}

export interface Topic {
  name: string;
  explanation: string;
  keyFormulas: string[];
  workedExample: WorkedExample;
  practiceProblems: PracticeProblems[];
}

export interface StudySession {
  id: number;
  title: string;
  subject: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  rawText: string | null;
  topics: Topic[];
  createdAt: string;
  updatedAt: string;
}

export interface Problem {
  id: number;
  sessionId: number;
  topicName: string;
  question: string;
  hint: string;
  solution: string;
  difficulty: 'easy' | 'medium' | 'hard';
  reviewFlag: boolean;
}

export interface ProblemCounts {
  easy: number;
  medium: number;
  hard: number;
  total: number;
}

export interface TopicStat {
  topic: string;
  total: number;
  correct: number;
}

export interface QuizStats {
  total: number;
  correct: number;
  byTopic: TopicStat[];
}

// ---- Helpers ----

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    throw new Error('NOT_AUTHENTICATED');
  }

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body.error || errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}

// ---- API Functions ----

export async function uploadFiles(files: File[]): Promise<{ sessionId: number; extractedText: string }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (res.status === 401) throw new Error('NOT_AUTHENTICATED');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function uploadText(text: string, title: string): Promise<{ sessionId: number }> {
  return apiFetch('/api/upload/text', {
    method: 'POST',
    body: JSON.stringify({ text, title }),
  });
}

export async function generateStudy(sessionId: number): Promise<{ topics: Topic[] }> {
  return apiFetch(`/api/study/${sessionId}/generate`, { method: 'POST' });
}

export async function getSession(sessionId: number): Promise<StudySession> {
  return apiFetch(`/api/study/${sessionId}`);
}

export async function getSessions(): Promise<StudySession[]> {
  return apiFetch('/api/study');
}

export async function deleteSession(sessionId: number): Promise<void> {
  await apiFetch(`/api/study/${sessionId}`, { method: 'DELETE' });
}

export async function getProblems(sessionId: number): Promise<Problem[]> {
  return apiFetch(`/api/quiz/${sessionId}`);
}

export async function submitAttempt(sessionId: number, problemId: string, correct: boolean): Promise<void> {
  await apiFetch('/api/quiz/attempt', {
    method: 'POST',
    body: JSON.stringify({ sessionId, problemId, correct }),
  });
}

export async function getStats(sessionId: number): Promise<QuizStats> {
  return apiFetch(`/api/quiz/${sessionId}/stats`);
}

export async function generateProblems(
  sessionId: number,
  topicName: string,
  targets?: { easy?: number; medium?: number; hard?: number },
): Promise<{ created: number; message?: string }> {
  return apiFetch(`/api/study/${sessionId}/topics/${encodeURIComponent(topicName)}/problems`, {
    method: 'POST',
    body: JSON.stringify({ targets }),
  });
}

export async function getProblemCounts(sessionId: number, topicName: string): Promise<ProblemCounts> {
  return apiFetch(`/api/study/${sessionId}/topics/${encodeURIComponent(topicName)}/problems/counts`);
}

export async function toggleReview(problemId: number, reviewFlag?: boolean): Promise<{ reviewFlag: boolean }> {
  return apiFetch(`/api/quiz/problems/${problemId}/review`, {
    method: 'PATCH',
    body: JSON.stringify(reviewFlag != null ? { reviewFlag } : {}),
  });
}
