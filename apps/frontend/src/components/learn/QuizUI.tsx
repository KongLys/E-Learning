'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';

interface QuizUIProps {
  lessonId: string;
  quiz: any;
  onPassed: () => void;
}

type QuizState = 'ready' | 'in_progress' | 'submitted';

export function QuizUI({ lessonId, quiz, onPassed }: QuizUIProps) {
  const [state, setState] = useState<QuizState>('ready');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);

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

  if (state === 'ready') {
    return (
      <div className="text-center space-y-4 py-8">
        <h2 className="text-xl font-bold">{quiz.lesson?.title ?? 'Bài kiểm tra'}</h2>
        <div className="text-sm text-gray-500 space-y-1">
          <p>{quiz.questions?.length ?? 0} câu hỏi</p>
          {quiz.timeLimit && <p>Thời gian: {Math.floor(quiz.timeLimit / 60)} phút</p>}
          <p>Điểm đạt: {quiz.passingScore}%</p>
          {quiz.maxAttempts > 0 && <p>Tối đa {quiz.maxAttempts} lần làm</p>}
        </div>
        <button
          onClick={() => setState('in_progress')}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
        >
          Bắt đầu làm bài
        </button>
      </div>
    );
  }

  if (state === 'submitted' && result) {
    const passed = result.isPassed;
    return (
      <div className="space-y-4">
        <div className={`text-center p-4 rounded-xl ${passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="text-3xl font-bold">{result.score.toFixed(0)}%</div>
          <div className={`font-semibold ${passed ? 'text-green-700' : 'text-red-700'}`}>
            {passed ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'}
          </div>
          <div className="text-sm text-gray-500 mt-1">Điểm đạt: {quiz.passingScore}%</div>
        </div>

        <div className="space-y-3">
          {result.results?.map((r: any, i: number) => {
            const q = quiz.questions[i];
            return (
              <div key={r.questionId} className={`p-3 rounded-lg border text-sm ${r.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <p className="font-medium">{i + 1}. {q?.content}</p>
                <p className={r.isCorrect ? 'text-green-700' : 'text-red-600'}>{r.isCorrect ? '✓ Đúng' : '✗ Sai'}</p>
                {!r.isCorrect && r.explanation && (
                  <p className="text-gray-500 mt-1 text-xs">{r.explanation}</p>
                )}
              </div>
            );
          })}
        </div>

        {!passed && (
          <button
            onClick={() => { setState('ready'); setAnswers({}); setResult(null); setCurrentQ(0); }}
            className="w-full border py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            Làm lại
          </button>
        )}
      </div>
    );
  }

  const questions = quiz.questions ?? [];
  const q = questions[currentQ];
  const isSingle = q?.questionType === 'single' || q?.questionType === 'true_false';
  const selectedOptions = answers[q?.id] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>Câu {currentQ + 1} / {questions.length}</span>
        {quiz.timeLimit && timeLeft > 0 && (
          <span className={timeLeft < 60 ? 'text-red-500 font-bold' : ''}>
            Còn lại: {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
          </span>
        )}
      </div>

      <div className="h-1 bg-gray-200 rounded">
        <div className="h-1 bg-blue-500 rounded" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-4">
        <p className="font-medium">{q?.content}</p>
        {!isSingle && <p className="text-xs text-blue-500">Chọn tất cả đáp án đúng</p>}
        <div className="space-y-2">
          {q?.options?.map((opt: any) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedOptions.includes(opt.id) ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type={isSingle ? 'radio' : 'checkbox'}
                checked={selectedOptions.includes(opt.id)}
                onChange={() => toggleOption(q.id, opt.id, isSingle)}
                className="accent-blue-600"
              />
              <span className="text-sm">{opt.content}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          disabled={currentQ === 0}
          onClick={() => setCurrentQ((q) => q - 1)}
          className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
        >
          ← Câu trước
        </button>
        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ((q) => q + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Câu tiếp →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {submitMutation.isPending ? 'Đang nộp...' : 'Nộp bài'}
          </button>
        )}
      </div>
    </div>
  );
}
