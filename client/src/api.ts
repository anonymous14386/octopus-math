// ---- Types ----

export interface MathClass {
  id: number;
  name: string;
  subject: string;
  description: string | null;
  createdAt: string;
}

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
  classId: number | null;
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

export async function uploadFiles(files: File[], classId?: number | null): Promise<{ sessionId: number; extractedText: string }> {
  const formData = new FormData();
  for (const file of files) formData.append('files', file);
  if (classId != null) formData.append('classId', String(classId));

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

export async function uploadText(text: string, title: string, classId?: number | null): Promise<{ sessionId: number }> {
  return apiFetch('/api/upload/text', {
    method: 'POST',
    body: JSON.stringify({ text, title, classId }),
  });
}

export async function generateStudy(sessionId: number): Promise<{ topics: Topic[] }> {
  return apiFetch(`/api/study/${sessionId}/generate`, { method: 'POST' });
}

export async function getSession(sessionId: number): Promise<StudySession> {
  return apiFetch(`/api/study/${sessionId}`);
}

export async function getSessions(classId?: number | null): Promise<StudySession[]> {
  const url = classId != null ? `/api/study?classId=${classId}` : '/api/study';
  return apiFetch(url);
}

export async function getClasses(): Promise<MathClass[]> {
  return apiFetch('/api/classes');
}

export async function createClass(name: string, subject: string, description?: string): Promise<MathClass> {
  return apiFetch('/api/classes', {
    method: 'POST',
    body: JSON.stringify({ name, subject, description }),
  });
}

export async function deleteClass(id: number): Promise<void> {
  await apiFetch(`/api/classes/${id}`, { method: 'DELETE' });
}

export async function updateClass(id: number, name: string, subject: string): Promise<MathClass> {
  return apiFetch(`/api/classes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, subject }),
  });
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
