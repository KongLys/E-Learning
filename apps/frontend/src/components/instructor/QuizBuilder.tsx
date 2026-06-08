'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';

type QType = 'single' | 'multiple' | 'true_false';
interface OptDraft { content: string; isCorrect: boolean }
interface QDraft { content: string; questionType: QType; points: number; explanation: string; options: OptDraft[] }

const emptyDraft = (): QDraft => ({
  content: '', questionType: 'single', points: 1, explanation: '',
  options: [{ content: '', isCorrect: true }, { content: '', isCorrect: false }],
});

const typeLabel: Record<QType, string> = {
  single: 'Một đáp án đúng',
  multiple: 'Nhiều đáp án đúng',
  true_false: 'Đúng / Sai',
};

export function QuizBuilder({ lessonId, onError }: { lessonId: string; onError: (m: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['quiz-build', lessonId], queryFn: () => instructorApi.getQuiz(lessonId) });
  const quiz: any = data?.data;
  const questions: any[] = quiz?.questions ?? [];

  const [passingScore, setPassingScore] = useState<number | null>(null);
  const [timeLimitMin, setTimeLimitMin] = useState<number | null>(null);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  if (quiz && !hydrated) {
    setPassingScore(quiz.passingScore ?? 70);
    setTimeLimitMin(quiz.timeLimit ? Math.round(quiz.timeLimit / 60) : 0);
    setMaxAttempts(quiz.maxAttempts ?? 0);
    setHydrated(true);
  }

  const [draft, setDraft] = useState<QDraft | null>(null);
  const onErr = (e: any) => onError(e?.response?.data?.message ?? 'Có lỗi xảy ra');
  const refresh = () => qc.invalidateQueries({ queryKey: ['quiz-build', lessonId] });

  const saveConfig = useMutation({
    mutationFn: () => instructorApi.configQuiz(lessonId, {
      passingScore: passingScore ?? 70,
      timeLimit: (timeLimitMin ?? 0) * 60,
      maxAttempts: maxAttempts ?? 0,
    }),
    onSuccess: () => { onError(''); refresh(); },
    onError: onErr,
  });

  const addQuestion = useMutation({
    mutationFn: (d: QDraft) => instructorApi.addQuizQuestion(lessonId, {
      content: d.content,
      questionType: d.questionType,
      orderIndex: questions.length + 1,
      points: d.points,
      explanation: d.explanation || undefined,
      options: d.options.map((o, i) => ({ content: o.content, isCorrect: o.isCorrect, orderIndex: i + 1 })),
    }),
    onSuccess: () => { onError(''); setDraft(null); refresh(); },
    onError: onErr,
  });

  const deleteQuestion = useMutation({
    mutationFn: (qId: string) => instructorApi.deleteQuizQuestion(qId),
    onSuccess: () => { onError(''); refresh(); },
    onError: onErr,
  });

  return (
    <div className="space-y-5">
      {/* Cấu hình quiz */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Cấu hình bài kiểm tra</h3>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-gray-500">Điểm đạt (%)
            <input type="number" min={1} max={100} value={passingScore ?? 70}
              onChange={(e) => setPassingScore(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500">Giới hạn (phút, 0=không)
            <input type="number" min={0} value={timeLimitMin ?? 0}
              onChange={(e) => setTimeLimitMin(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-gray-500">Số lần làm (0=∞)
            <input type="number" min={0} value={maxAttempts ?? 0}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
        </div>
        <button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}
          className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">
          {saveConfig.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </div>

      {/* Danh sách câu hỏi */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Câu hỏi ({questions.length})</h3>
        {questions.map((q: any, i: number) => (
          <div key={q.id} className="border rounded-lg px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-medium">{i + 1}. {q.content}</span>
                <span className="ml-2 text-xs text-gray-400">({typeLabel[q.questionType as QType]} · {q.points}đ)</span>
              </div>
              <button onClick={() => deleteQuestion.mutate(q.id)} className="text-red-400 hover:text-red-600 text-xs">Xóa</button>
            </div>
            <ul className="mt-1 ml-4 space-y-0.5">
              {q.options?.map((o: any) => (
                <li key={o.id} className={`text-xs ${o.isCorrect ? 'text-green-600' : 'text-gray-500'}`}>
                  {o.isCorrect ? '✓' : '○'} {o.content}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Soạn câu hỏi mới */}
      {draft ? (
        <QuestionForm
          draft={draft}
          setDraft={setDraft}
          onSave={() => addQuestion.mutate(draft)}
          onCancel={() => setDraft(null)}
          saving={addQuestion.isPending}
        />
      ) : (
        <button onClick={() => setDraft(emptyDraft())}
          className="text-xs border border-blue-500 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50">
          + Thêm câu hỏi
        </button>
      )}
    </div>
  );
}

function QuestionForm({
  draft, setDraft, onSave, onCancel, saving,
}: {
  draft: QDraft; setDraft: (d: QDraft) => void; onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const setType = (t: QType) => {
    if (t === 'true_false') {
      setDraft({ ...draft, questionType: t, options: [{ content: 'Đúng', isCorrect: true }, { content: 'Sai', isCorrect: false }] });
    } else {
      setDraft({ ...draft, questionType: t });
    }
  };

  const toggleCorrect = (idx: number) => {
    const options = draft.options.map((o, i) => {
      if (draft.questionType === 'multiple') return i === idx ? { ...o, isCorrect: !o.isCorrect } : o;
      return { ...o, isCorrect: i === idx }; // single & true_false: chỉ 1 đúng
    });
    setDraft({ ...draft, options });
  };

  const setOptContent = (idx: number, content: string) =>
    setDraft({ ...draft, options: draft.options.map((o, i) => (i === idx ? { ...o, content } : o)) });

  const addOption = () => setDraft({ ...draft, options: [...draft.options, { content: '', isCorrect: false }] });
  const removeOption = (idx: number) =>
    setDraft({ ...draft, options: draft.options.filter((_, i) => i !== idx) });

  const isTF = draft.questionType === 'true_false';

  return (
    <div className="border-2 border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/40">
      <input value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })}
        placeholder="Nội dung câu hỏi..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />

      <div className="flex items-center gap-3 flex-wrap">
        {(['single', 'multiple', 'true_false'] as QType[]).map((t) => (
          <label key={t} className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="radio" checked={draft.questionType === t} onChange={() => setType(t)} />
            {typeLabel[t]}
          </label>
        ))}
        <label className="text-xs text-gray-500 ml-auto">Điểm
          <input type="number" min={1} value={draft.points}
            onChange={(e) => setDraft({ ...draft, points: Math.max(1, Number(e.target.value) || 1) })}
            className="ml-1 w-16 border border-gray-300 rounded px-2 py-1 text-sm" />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-500">
          Đáp án {draft.questionType === 'multiple' ? '(tick các đáp án đúng)' : '(tick đáp án đúng)'}
        </p>
        {draft.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type={draft.questionType === 'multiple' ? 'checkbox' : 'radio'}
              checked={o.isCorrect} onChange={() => toggleCorrect(i)} />
            <input value={o.content} onChange={(e) => setOptContent(i, e.target.value)}
              disabled={isTF} placeholder={`Đáp án ${i + 1}`}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100" />
            {!isTF && draft.options.length > 2 && (
              <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
            )}
          </div>
        ))}
        {!isTF && (
          <button onClick={addOption} className="text-xs text-blue-600 hover:underline">+ Thêm đáp án</button>
        )}
      </div>

      <textarea value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
        rows={2} placeholder="Giải thích (hiện sau khi nộp, tuỳ chọn)..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />

      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving || !draft.content.trim()}
          className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Lưu câu hỏi'}
        </button>
        <button onClick={onCancel} className="text-xs border px-4 py-2 rounded-lg">Hủy</button>
      </div>
    </div>
  );
}
