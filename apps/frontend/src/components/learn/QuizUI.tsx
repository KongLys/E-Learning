'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';

interface QuizUIProps {
  lessonId: string;
  quiz: any;
  onPassed: () => void;
}

type QuizState = 'ready' | 'in_progress' | 'submitted';

export function QuizUI({ lessonId, quiz, onPassed }: QuizUIProps) {
  const qc = useQueryClient();
  const [state, setState] = useState<QuizState>('ready');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // Lịch sử các lần làm trước (mới nhất trước) — để hiện điểm đã đạt khi quay lại.
  const attemptsQuery = useQuery({
    queryKey: ['quiz-attempts', quiz.id],
    queryFn: async () => (await learnApi.getQuizAttempts(quiz.id)).data,
    enabled: !!quiz.id,
  });
  const attempts = attemptsQuery.data ?? [];

  useEffect(() => {
    if (state !== 'in_progress' || !quiz.timeLimit) return;
    setTimeLeft(quiz.timeLimit);
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(interval); handleSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  const submitMutation = useMutation({
    mutationFn: (ans: { questionId: string; optionIds: string[] }[]) =>
      learnApi.submitQuiz(quiz.id, ans),
    onSuccess: (data) => {
      setResult(data.data);
      setState('submitted');
      qc.invalidateQueries({ queryKey: ['quiz-attempts', quiz.id] });
      if (data.data.isPassed) onPassed();
    },
  });

  const handleSubmit = () => {
    const ansArr = quiz.questions.map((q: any) => ({
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

  const startFresh = () => { setAnswers({}); setResult(null); setCurrentQ(0); setState('in_progress'); };

  const maxAttempts: number = quiz.maxAttempts ?? 0;
  const attemptCount = attempts.length;
  const canRetake = maxAttempts === 0 || attemptCount < maxAttempts;

  // ─── Màn hình chờ / đã làm xong ─────────────────────────────────────────────
  if (state === 'ready') {
    if (attemptsQuery.isLoading) {
      return <p className="py-12 text-center text-sm text-muted">Đang tải…</p>;
    }

    const bestScore = attemptCount > 0 ? Math.max(...attempts.map((a) => a.score)) : null;
    const passedBefore = attempts.some((a) => a.isPassed);

    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface-card p-8 text-center">
        <h2 className="font-display text-2xl font-light text-ink">{quiz.lesson?.title ?? 'Bài kiểm tra'}</h2>

        {attemptCount > 0 ? (
          // Đã từng làm → hiện điểm cao nhất + nút làm lại.
          <>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Điểm cao nhất của bạn
            </p>
            <div className="mt-3 font-display text-5xl font-light text-ink">{bestScore!.toFixed(0)}%</div>
            <p className={`mt-1 text-sm font-medium ${passedBefore ? 'text-semantic-success' : 'text-semantic-error'}`}>
              {passedBefore ? 'Đã đạt' : 'Chưa đạt'}
            </p>
            <p className="mt-3 text-sm text-muted">
              Đã làm {attemptCount}{maxAttempts > 0 ? ` / ${maxAttempts}` : ''} lần · Điểm đạt: {quiz.passingScore}%
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <button
                onClick={startFresh}
                disabled={!canRetake}
                className="inline-flex h-10 items-center justify-center rounded-pill bg-emphasis px-8 text-sm font-medium text-white transition-colors hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                Làm lại
              </button>
              {!canRetake && (
                <p className="text-xs text-muted">Đã hết lượt làm bài (tối đa {maxAttempts} lần).</p>
              )}
            </div>
          </>
        ) : (
          // Chưa làm lần nào → màn hình bắt đầu.
          <>
            <div className="mt-3 space-y-1 text-sm text-muted">
              <p>{quiz.questions?.length ?? 0} câu hỏi</p>
              {quiz.timeLimit && <p>Thời gian: {Math.floor(quiz.timeLimit / 60)} phút</p>}
              <p>Điểm đạt: {quiz.passingScore}%</p>
              {maxAttempts > 0 && <p>Tối đa {maxAttempts} lần làm</p>}
            </div>
            <button
              onClick={() => setState('in_progress')}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-pill bg-emphasis px-8 text-sm font-medium text-white transition-colors hover:bg-ink"
            >
              Bắt đầu làm bài
            </button>
          </>
        )}
      </div>
    );
  }

  // ─── Màn hình kết quả sau khi nộp ────────────────────────────────────────────
  if (state === 'submitted' && result) {
    const passed = result.isPassed;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-2xl border border-hairline bg-surface-card p-8 text-center">
          <div className="font-display text-5xl font-light text-ink">{result.score.toFixed(0)}%</div>
          <div className={`mt-1 text-sm font-semibold uppercase tracking-[0.08em] ${passed ? 'text-semantic-success' : 'text-semantic-error'}`}>
            {passed ? 'Đã đạt' : 'Chưa đạt'}
          </div>
          <div className="mt-2 text-sm text-muted">Điểm đạt: {quiz.passingScore}%</div>
        </div>

        <div className="space-y-2.5">
          {result.results?.map((r: any, i: number) => {
            const q = quiz.questions[i];
            return (
              <div key={r.questionId} className="rounded-xl border border-hairline bg-surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-medium text-ink">{i + 1}. {q?.content}</p>
                  <span className={`shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-medium ${r.isCorrect ? 'bg-surface-strong text-semantic-success' : 'bg-surface-strong text-semantic-error'}`}>
                    {r.isCorrect ? 'Đúng' : 'Sai'}
                  </span>
                </div>
                {!r.isCorrect && r.explanation && (
                  <p className="mt-2 text-sm text-muted">{r.explanation}</p>
                )}
              </div>
            );
          })}
        </div>

        {canRetake ? (
          <button
            onClick={startFresh}
            className="w-full rounded-pill border border-hairline py-2.5 text-sm font-medium text-muted transition-colors hover:bg-canvas"
          >
            Làm lại
          </button>
        ) : (
          <p className="text-center text-xs text-muted">Đã hết lượt làm bài (tối đa {maxAttempts} lần).</p>
        )}
      </div>
    );
  }

  // ─── Màn hình đang làm bài ───────────────────────────────────────────────────
  const questions = quiz.questions ?? [];
  const q = questions[currentQ];
  const isSingle = q?.questionType === 'single' || q?.questionType === 'true_false';
  const selectedOptions = answers[q?.id] ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        <span>Câu {currentQ + 1} / {questions.length}</span>
        {quiz.timeLimit && timeLeft > 0 && (
          <span className={timeLeft < 60 ? 'text-semantic-error' : ''}>
            Còn lại: {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>

      <div className="h-1 rounded-pill bg-surface-strong">
        <div className="h-1 rounded-pill bg-emphasis transition-all" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-card p-6 space-y-4">
        <p className="text-[15px] font-medium text-ink">{q?.content}</p>
        {!isSingle && <p className="text-xs text-muted">Chọn tất cả đáp án đúng</p>}
        <div className="space-y-2">
          {q?.options?.map((opt: any) => (
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
          onClick={() => setCurrentQ((q) => q - 1)}
          className="inline-flex items-center gap-1 rounded-pill border border-hairline px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas disabled:opacity-40"
        >
          <ChevronLeft size={16} /> Câu trước
        </button>
        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ((q) => q + 1)}
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
            {submitMutation.isPending ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        )}
      </div>
    </div>
  );
}
