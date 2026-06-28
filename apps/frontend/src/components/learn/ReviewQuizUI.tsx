'use client';

import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Lightbulb, Sparkles, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useAiChatBridge } from '@/store/ai-chat-bridge.store';
import type { AskScope } from '@/lib/api/ai.api';
import type {
  QuizView,
  QuizQuestionView,
  ReviewQuizResult,
  ReviewResultItem,
} from '@/types/quiz';

interface ReviewQuizUIProps {
  quiz: QuizView;
  /** Nộp đáp án, trả về axios response chứa kết quả chấm điểm. */
  submit: (
    answers: { questionId: string; optionIds: string[] }[],
  ) => Promise<{ data: ReviewQuizResult }>;
  onClose: () => void;
  /** Phạm vi RAG cho nút "Vì sao đúng/sai?" (vd: theo bài học). */
  askScope?: AskScope;
}

type State = 'ready' | 'in_progress' | 'submitted';

export function ReviewQuizUI({ quiz, submit, onClose, askScope }: ReviewQuizUIProps) {
  const [state, setState] = useState<State>('ready');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<ReviewQuizResult | null>(null);
  const askAi = useAiChatBridge((s) => s.askAi);

  const questions: QuizQuestionView[] = quiz.questions ?? [];

  /**
   * Mở panel "Hỏi AI" để giải thích một câu. Chỉ gửi questionId + lựa chọn; server
   * tự tra đáp án đúng + chunk nguồn đã lưu để giải thích bám tài liệu (tránh bịa).
   */
  const explainQuestion = (q: QuizQuestionView, r: ReviewResultItem | undefined) => {
    const verdict = r?.isCorrect ? 'đúng' : 'chưa chính xác';
    const displayText = `Vì sao câu "${q.content}" — lựa chọn của tôi ${verdict}?`;
    askAi(displayText.slice(0, 500), askScope, {
      questionId: q.id,
      pickedOptionIds: answers[q.id] ?? [],
    });
  };

  const submitMutation = useMutation({
    mutationFn: (ans: { questionId: string; optionIds: string[] }[]) =>
      submit(ans),
    onSuccess: (data) => {
      setResult(data.data);
      setState('submitted');
    },
  });

  const handleSubmit = () => {
    const ansArr = questions.map((q) => ({
      questionId: q.id,
      optionIds: answers[q.id] ?? [],
    }));
    submitMutation.mutate(ansArr);
  };

  const toggleOption = (questionId: string, optionId: string, isSingle: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (isSingle) return { ...prev, [questionId]: [optionId] };
      return {
        ...prev,
        [questionId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const restart = () => {
    setState('ready');
    setAnswers({});
    setResult(null);
    setCurrentQ(0);
  };

  // ----- Màn hình bắt đầu -----
  if (state === 'ready') {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface-card p-8 text-center">
        <h2 className="font-display text-2xl font-light text-ink">Quiz ôn tập</h2>
        <p className="mt-2 text-sm text-muted">
          {questions.length} câu hỏi · Luyện tập, không tính vào tiến độ khoá học
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setState('in_progress')}
            className="inline-flex h-10 items-center justify-center rounded-pill bg-emphasis px-8 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            Bắt đầu làm bài
          </button>
          <button
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-pill border border-hairline px-6 text-sm font-medium text-muted transition-colors hover:bg-canvas"
          >
            Đóng
          </button>
        </div>
      </div>
    );
  }

  // ----- Màn hình kết quả -----
  if (state === 'submitted' && result) {
    const resultById: Record<string, ReviewResultItem> = {};
    for (const r of result.results ?? []) resultById[r.questionId] = r;
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-hairline bg-surface-card p-6 text-center">
          <div className="font-display text-5xl font-light text-ink">{result.score.toFixed(0)}%</div>
          <div className="mt-1 text-sm text-muted">
            Đúng {result.correct}/{result.total} câu
          </div>
        </div>

        <div className="space-y-2.5">
          {questions.map((q, i) => {
            const r = resultById[q.id];
            const correct = r?.isCorrect;
            const picked: string[] = answers[q.id] ?? [];
            return (
              <div key={q.id} className="rounded-xl border border-hairline bg-surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium text-ink">
                    {i + 1}. {q.content}
                  </p>
                  <span className={`shrink-0 rounded-pill bg-surface-strong px-2.5 py-0.5 text-xs font-medium ${correct ? 'text-semantic-success' : 'text-semantic-error'}`}>
                    {correct ? 'Đúng' : 'Sai'}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {q.options?.map((opt) => {
                    const isCorrectOpt = r?.correctOptionIds?.includes(opt.id);
                    const youPicked = picked.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${isCorrectOpt ? 'bg-surface-strong text-semantic-success' : youPicked ? 'text-semantic-error' : 'text-muted'}`}
                      >
                        {isCorrectOpt ? <Check size={14} className="shrink-0" /> : youPicked ? <X size={14} className="shrink-0" /> : null}
                        {opt.content}
                      </div>
                    );
                  })}
                </div>
                {r?.explanation && (
                  <p className="mt-2 flex items-start gap-1 text-sm text-muted"><Lightbulb size={14} className="mt-0.5 shrink-0" /> {r.explanation}</p>
                )}
                <button
                  onClick={() => explainQuestion(q, r)}
                  className="mt-3 inline-flex items-center gap-1 rounded-pill border border-hairline px-3 py-1 text-xs font-medium text-muted transition-colors hover:bg-canvas"
                >
                  <Sparkles size={13} /> Vì sao {correct ? 'đúng' : 'sai'}?
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={restart}
            className="flex-1 rounded-pill border border-hairline py-2.5 text-sm font-medium text-muted transition-colors hover:bg-canvas"
          >
            Làm lại
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-pill bg-emphasis py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            Đóng
          </button>
        </div>
      </div>
    );
  }

  // ----- Màn hình làm bài -----
  const q = questions[currentQ];
  const isSingle = q?.questionType === 'single' || q?.questionType === 'true_false';
  const selectedOptions = answers[q?.id] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        <span>
          Câu {currentQ + 1} / {questions.length}
        </span>
      </div>

      <div className="h-1 rounded-pill bg-surface-strong">
        <div
          className="h-1 rounded-pill bg-emphasis transition-all"
          style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-card p-6 space-y-4">
        <p className="text-[15px] font-medium text-ink">{q?.content}</p>
        {!isSingle && <p className="text-xs text-muted">Chọn tất cả đáp án đúng</p>}
        <div className="space-y-2">
          {q?.options?.map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                selectedOptions.includes(opt.id)
                  ? 'border-emphasis bg-canvas-soft'
                  : 'border-hairline hover:bg-canvas'
              }`}
            >
              <input
                type={isSingle ? 'radio' : 'checkbox'}
                checked={selectedOptions.includes(opt.id)}
                onChange={() => toggleOption(q.id, opt.id, isSingle)}
                className="accent-emphasis"
              />
              <span className="text-sm text-ink">{opt.content}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          disabled={currentQ === 0}
          onClick={() => setCurrentQ((c) => c - 1)}
          className="inline-flex items-center gap-1 rounded-pill border border-hairline px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Câu trước
        </button>
        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ((c) => c + 1)}
            className="inline-flex items-center gap-1 rounded-pill bg-emphasis px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink"
          >
            Câu tiếp <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="rounded-pill bg-emphasis px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-ink disabled:opacity-50"
          >
            {submitMutation.isPending ? 'Đang chấm...' : 'Nộp bài'}
          </button>
        )}
      </div>
    </div>
  );
}
