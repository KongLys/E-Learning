'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { learnApi } from '@/lib/api/learn.api';

interface ReviewQuizUIProps {
  lessonId: string;
  quiz: any; // { id, questions: [{ id, content, questionType, options: [{ id, content }] }] }
  onClose: () => void;
}

type State = 'ready' | 'in_progress' | 'submitted';

export function ReviewQuizUI({ lessonId, quiz, onClose }: ReviewQuizUIProps) {
  const [state, setState] = useState<State>('ready');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<any>(null);

  const questions: any[] = quiz.questions ?? [];

  const submitMutation = useMutation({
    mutationFn: (ans: { questionId: string; optionIds: string[] }[]) =>
      learnApi.submitReviewQuiz(lessonId, ans),
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
      <div className="text-center space-y-4 py-6">
        <h2 className="text-xl font-bold">Quiz ôn tập</h2>
        <p className="text-sm text-gray-500">
          {questions.length} câu hỏi · Luyện tập, không tính vào tiến độ khoá học
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setState('in_progress')}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Bắt đầu làm bài
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 border rounded-lg text-sm hover:bg-gray-50"
          >
            Đóng
          </button>
        </div>
      </div>
    );
  }

  // ----- Màn hình kết quả -----
  if (state === 'submitted' && result) {
    const resultById: Record<string, any> = {};
    for (const r of result.results ?? []) resultById[r.questionId] = r;
    return (
      <div className="space-y-4">
        <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-200">
          <div className="text-3xl font-bold">{result.score.toFixed(0)}%</div>
          <div className="text-sm text-gray-600 mt-1">
            Đúng {result.correct}/{result.total} câu
          </div>
        </div>

        <div className="space-y-3">
          {questions.map((q, i) => {
            const r = resultById[q.id];
            const correct = r?.isCorrect;
            const picked: string[] = answers[q.id] ?? [];
            return (
              <div
                key={q.id}
                className={`p-3 rounded-lg border text-sm ${correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
              >
                <p className="font-medium">
                  {i + 1}. {q.content}
                </p>
                <div className="mt-2 space-y-1">
                  {q.options?.map((opt: any) => {
                    const isCorrectOpt = r?.correctOptionIds?.includes(opt.id);
                    const youPicked = picked.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={`px-2 py-1 rounded ${isCorrectOpt ? 'bg-green-100 text-green-800' : youPicked ? 'bg-red-100 text-red-700' : 'text-gray-600'}`}
                      >
                        {isCorrectOpt ? '✓ ' : youPicked ? '✗ ' : ''}
                        {opt.content}
                      </div>
                    );
                  })}
                </div>
                {r?.explanation && (
                  <p className="text-gray-500 mt-2 text-xs">💡 {r.explanation}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2">
          <button
            onClick={restart}
            className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            Làm lại
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700"
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
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Câu {currentQ + 1} / {questions.length}
        </span>
      </div>

      <div className="h-1 bg-gray-200 rounded">
        <div
          className="h-1 bg-blue-500 rounded"
          style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
        />
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
          onClick={() => setCurrentQ((c) => c - 1)}
          className="px-4 py-2 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
        >
          ← Câu trước
        </button>
        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ((c) => c + 1)}
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
            {submitMutation.isPending ? 'Đang chấm...' : 'Nộp bài'}
          </button>
        )}
      </div>
    </div>
  );
}
