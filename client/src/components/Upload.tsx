import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFiles, uploadText, generateStudy, type StudySession, type MathClass } from '../api';

interface UploadProps {
  classes: MathClass[];
  activeClassId: number | null;
  onSessionCreated: (sessionId: number, session: StudySession) => void;
}

type UploadState = 'idle' | 'uploading' | 'generating' | 'done' | 'error';

export default function Upload({ classes, activeClassId, onSessionCreated }: UploadProps) {
  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(activeClassId);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setUploadState('uploading');
    setErrorMsg('');
    try {
      const result = await uploadFiles(files, selectedClassId);
      setExtractedText(result.extractedText);
      setSessionId(result.sessionId);
      setUploadState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
      setUploadState('error');
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    handleFiles(acceptedFiles);
  }, []);

  function handleHtmlInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleFiles(files);
    // reset so same file can be re-selected
    e.target.value = '';
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    multiple: true,
  });

  async function handleTextSubmit() {
    if (!pastedText.trim()) return;
    setUploadState('uploading');
    setErrorMsg('');
    try {
      const result = await uploadText(pastedText.trim(), pastedTitle || 'Pasted Material', selectedClassId);
      setSessionId(result.sessionId);
      setExtractedText(pastedText.trim());
      setUploadState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed.');
      setUploadState('error');
    }
  }

  async function handleGenerate() {
    if (sessionId == null) return;
    setUploadState('generating');
    setErrorMsg('');
    try {
      const result = await generateStudy(sessionId);
      const session: StudySession = {
        id: sessionId,
        classId: selectedClassId,
        title: pastedTitle || 'Study Session',
        subject: 'Precalculus',
        status: 'ready',
        rawText: extractedText,
        topics: result.topics,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onSessionCreated(sessionId, session);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed.');
      setUploadState('error');
    }
  }

  function reset() {
    setUploadState('idle');
    setExtractedText('');
    setSessionId(null);
    setErrorMsg('');
    setPastedText('');
    setPastedTitle('');
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-2 text-gray-100">Upload Study Material</h2>
      <p className="text-gray-500 mb-4 text-sm">
        Upload PDFs, text files, or paste your notes. The AI will generate a structured study guide.
      </p>

      {/* Class selector */}
      {classes.length > 0 && (
        <div className="mb-5 flex items-center gap-3">
          <label className="text-sm text-gray-400 shrink-0">Add to class:</label>
          <select
            value={selectedClassId ?? ''}
            onChange={e => setSelectedClassId(e.target.value === '' ? null : parseInt(e.target.value))}
            className="bg-gray-900 border border-gray-800 text-gray-200 text-sm rounded px-3 py-1.5 outline-none focus:border-blue-500"
          >
            <option value="">No class</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('file')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            activeTab === 'file' ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          File Upload
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            activeTab === 'text' ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Paste Text
        </button>
      </div>

      {uploadState === 'idle' || uploadState === 'error' ? (
        <>
          {activeTab === 'file' ? (
            <div className="space-y-3">
              {/* Standard file dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'
                }`}
              >
                <input {...getInputProps()} />
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {isDragActive ? (
                  <p className="text-blue-400 font-medium">Drop files here…</p>
                ) : (
                  <>
                    <p className="text-gray-300 font-medium">Drag & drop files here</p>
                    <p className="text-gray-500 text-sm mt-1">or click to select — PDF, TXT, JPG, PNG</p>
                  </>
                )}
              </div>

              {/* WebAssign HTML — separate because browsers block HTML drag-drop */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-200">WebAssign saved page</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Save your quiz as <span className="text-gray-400">Webpage, Complete</span> — upload only the <span className="text-gray-400">.html</span> file
                  </p>
                </div>
                <input
                  ref={htmlInputRef}
                  type="file"
                  accept=".html,.htm"
                  className="hidden"
                  onChange={handleHtmlInput}
                />
                <button
                  onClick={() => htmlInputRef.current?.click()}
                  className="shrink-0 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors"
                >
                  Browse…
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="mb-3">
                <label className="block text-sm text-gray-400 mb-1">Session Title</label>
                <input
                  type="text"
                  placeholder="e.g. Chapter 5 — Trigonometry"
                  value={pastedTitle}
                  onChange={e => setPastedTitle(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-gray-200 text-sm outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <label className="block text-sm text-gray-400 mb-1">Paste your notes or textbook content</label>
              <textarea
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                rows={10}
                placeholder="Paste your study material here…"
                className="w-full bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-gray-200 text-sm outline-none focus:border-blue-500 transition-colors resize-y font-mono"
              />
              <button
                onClick={handleTextSubmit}
                disabled={!pastedText.trim()}
                className="mt-3 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {uploadState === 'error' && errorMsg && (
            <div className="mt-4 bg-red-900/30 border border-red-700 text-red-400 rounded-md px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}
        </>
      ) : uploadState === 'uploading' ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Processing files…</p>
        </div>
      ) : uploadState === 'generating' ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Generating your study guide with AI…</p>
          <p className="text-gray-600 text-sm mt-2">This may take up to 30 seconds.</p>
        </div>
      ) : (
        /* uploadState === 'done' */
        <div>
          <div className="bg-blue-900/20 border border-blue-700 rounded-xl p-4 mb-5 flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-blue-300 text-sm font-medium">
              Material uploaded successfully.
            </p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5">
            <p className="text-sm text-gray-400 mb-2 font-medium">Extracted text preview:</p>
            <pre className="text-xs text-gray-500 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
              {extractedText.slice(0, 2000)}{extractedText.length > 2000 ? '\n…' : ''}
            </pre>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
            >
              Generate Study Guide
            </button>
            <button
              onClick={reset}
              className="px-4 py-2.5 text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg text-sm transition-colors"
            >
              Start Over
            </button>
          </div>

          {errorMsg && (
            <div className="mt-4 bg-red-900/30 border border-red-700 text-red-400 rounded-md px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
