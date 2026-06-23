'use client';

import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/common/ErrorMessage';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AddLessonModal } from '@/components/instructor/AddLessonModal';
import { LessonTypeIcon, type LessonType } from '@/components/instructor/lessonTypeMeta';
import Link from 'next/link';
import { Check, ChevronDown, FileText, GraduationCap, GripVertical, Pencil, Plus, Sparkles, Trash2, Video, X } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ButtonHTMLAttributes } from 'react';

interface LessonAsset {
  videoUrl?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  fileType?: string | null;
}

interface Lesson {
  id: string;
  title: string;
  type: LessonType;
  isFinalQuiz?: boolean;
  videoAsset?: LessonAsset | null;
  documentAsset?: LessonAsset | null;
}

interface Section {
  id: string;
  title: string;
  lessons?: Lesson[];
}

type ConfirmDeleteState =
  | { kind: 'section'; id: string; title: string; lessonCount: number }
  | { kind: 'lesson'; id: string; title: string }
  | null;

type ApiErrorShape = { response?: { data?: { message?: string } } };

/** Hình dạng tối thiểu của cache query ['course-edit', id] (axios response). */
type SectionsCache = { data: Section[] };

/**
 * Bọc một phần để kéo thả đổi vị trí bằng dnd-kit.
 * `children` nhận props để gắn vào nút cầm kéo (drag handle) và cờ isDragging.
 */
function SortableSection({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (
    handleProps: ButtonHTMLAttributes<HTMLButtonElement>,
    isDragging: boolean,
  ) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10' : undefined}
    >
      {children(
        { ...attributes, ...listeners } as ButtonHTMLAttributes<HTMLButtonElement>,
        isDragging,
      )}
    </div>
  );
}

/** Bọc một bài học (li) để kéo thả đổi vị trí trong phần. */
function SortableLessonRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (
    handleProps: ButtonHTMLAttributes<HTMLButtonElement>,
    isDragging: boolean,
  ) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 px-3 py-2.5 ${
        isDragging ? 'relative z-10 bg-sky-soft/60 shadow-md ring-1 ring-sky-soft' : ''
      }`}
    >
      {children(
        { ...attributes, ...listeners } as ButtonHTMLAttributes<HTMLButtonElement>,
        isDragging,
      )}
    </li>
  );
}

/** DndContext riêng cho danh sách bài học của một phần (sắp xếp trong nội bộ phần). */
function LessonsDnd({
  items,
  onReorder,
  children,
}: {
  items: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const oldIdx = items.indexOf(String(active.id));
        const newIdx = items.indexOf(String(over.id));
        if (oldIdx < 0 || newIdx < 0) return;
        onReorder(arrayMove(items, oldIdx, newIdx));
      }}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

/** Nút icon nhỏ cho các thao tác trên phần/bài học. */
function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors disabled:opacity-25 ${
        danger
          ? 'text-ink-subtle hover:bg-coral-soft hover:text-coral'
          : 'text-ink-subtle hover:bg-surface-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** Form nhập tiêu đề inline (thêm phần / đổi tên): Enter để lưu, Esc để hủy. */
function InlineTitleForm({
  initialValue = '',
  placeholder,
  saveLabel,
  isPending,
  autoSelect,
  onSave,
  onCancel,
}: {
  initialValue?: string;
  placeholder: string;
  saveLabel: string;
  isPending?: boolean;
  autoSelect?: boolean;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const canSave = trimmed.length >= 2 && !isPending;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => {
            if (autoSelect) e.target.select();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave(trimmed);
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2 text-sm outline-none ring-1 ring-hairline-strong focus:ring-2 focus:ring-sky"
        />
        <button
          type="button"
          onClick={() => onSave(trimmed)}
          disabled={!canSave}
          className="flex shrink-0 items-center gap-1 rounded-full bg-sky px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-deep disabled:opacity-50"
        >
          <Check size={13} />
          {isPending ? 'Đang lưu...' : saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs text-ink-mute transition-colors hover:bg-canvas-soft"
        >
          <X size={13} />
          Hủy
        </button>
      </div>
      {trimmed.length > 0 && trimmed.length < 2 && (
        <p className="mt-1 text-xs text-sun-deep">Tiêu đề cần ít nhất 2 ký tự.</p>
      )}
    </div>
  );
}

export default function CourseCurriculumPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [addSectionAt, setAddSectionAt] = useState<'top' | 'bottom' | null>(null);
  const [addLessonForSection, setAddLessonForSection] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState>(null);
  // Phần đang được kéo — khi khác null, mọi phần được thu gọn tạm để dễ thả vào vị trí mới
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data, isLoading } = useQuery({
    queryKey: ['course-edit', id],
    queryFn: () => instructorApi.getSections(id),
  });

  // Dữ liệu quản lý (đảm bảo slot quiz cuối khóa tồn tại + cờ bật/tắt + trạng thái AI).
  const manageQuery = useQuery({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id),
  });
  const manage = manageQuery.data?.data as
    | { finalQuizEnabled?: boolean; sections?: Section[] }
    | undefined;
  const finalQuizEnabled = manage?.finalQuizEnabled ?? true;
  const finalQuizLesson = (manage?.sections ?? [])
    .flatMap((s) => s.lessons ?? [])
    .find((l) => l.isFinalQuiz) as
    | (Lesson & {
        quizLesson?: {
          generationStatus?: string | null;
          aiGenerated?: boolean;
          _count?: { questions: number };
        } | null;
      })
    | undefined;

  // Loại trừ phần "Kiểm tra cuối khóa" khỏi danh sách kéo-thả (được quản lý riêng).
  const allSections: Section[] = data?.data ?? [];
  const sections: Section[] = allSections.filter(
    (s) => !(s.lessons ?? []).some((l) => l.isFinalQuiz),
  );
  const totalLessons = sections.reduce((sum, s) => sum + (s.lessons?.length ?? 0), 0);
  const allCollapsed = sections.length > 0 && sections.every((s) => collapsed.has(s.id));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['course-edit', id] });
    qc.invalidateQueries({ queryKey: ['course-manage', id] });
  };
  const onErr = (err: unknown) =>
    setError((err as ApiErrorShape).response?.data?.message ?? 'Có lỗi xảy ra, vui lòng thử lại.');

  const toggleFinalQuizMutation = useMutation({
    mutationFn: (enabled: boolean) => instructorApi.toggleFinalQuiz(id, enabled),
    onMutate: () => setError(''),
    onSuccess: invalidate,
    onError: onErr,
  });

  // ----- Sections -----
  const addSectionMutation = useMutation({
    mutationFn: async ({ title, position }: { title: string; position: 'top' | 'bottom' }) => {
      const res = await instructorApi.addSection(id, { title });
      if (position === 'top') {
        const newId = res?.data?.id;
        const ids = [newId, ...sections.map((s) => s.id)].filter(Boolean);
        await instructorApi.reorderSections(id, ids);
      }
      return res;
    },
    onMutate: () => setError(''),
    onSuccess: () => {
      invalidate();
      setAddSectionAt(null);
    },
    onError: onErr,
  });

  const renameSectionMutation = useMutation({
    mutationFn: ({ sectionId, title }: { sectionId: string; title: string }) =>
      instructorApi.updateSection(id, sectionId, { title }),
    onMutate: () => setError(''),
    onSuccess: () => {
      invalidate();
      setEditingSectionId(null);
    },
    onError: onErr,
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) => instructorApi.deleteSection(id, sectionId),
    onMutate: () => setError(''),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
    onError: (err) => {
      onErr(err);
      setConfirmDelete(null);
    },
  });

  // Cập nhật lạc quan để danh sách đổi chỗ ngay lập tức, lỗi thì khôi phục
  const reorderSectionsMutation = useMutation({
    mutationFn: (ids: string[]) => instructorApi.reorderSections(id, ids),
    onMutate: async (ids) => {
      setError('');
      await qc.cancelQueries({ queryKey: ['course-edit', id] });
      const prev = qc.getQueryData<SectionsCache>(['course-edit', id]);
      qc.setQueryData<SectionsCache>(
        ['course-edit', id],
        (old) =>
          old && {
            ...old,
            data: ids
              .map((sid) => old.data.find((s) => s.id === sid))
              .filter((s): s is Section => s !== undefined),
          },
      );
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(['course-edit', id], ctx.prev);
      onErr(err);
    },
    onSettled: invalidate,
  });

  // ----- Lessons -----
  const addLessonMutation = useMutation({
    mutationFn: ({
      sectionId,
      ...dto
    }: {
      sectionId: string;
      title: string;
      type: LessonType;
      description: string;
    }) => instructorApi.addLesson(sectionId, dto),
    onSuccess: invalidate,
  });

  const renameLessonMutation = useMutation({
    mutationFn: ({ lessonId, title }: { lessonId: string; title: string }) =>
      instructorApi.updateLesson(lessonId, { title }),
    onMutate: () => setError(''),
    onSuccess: () => {
      invalidate();
      setEditingLessonId(null);
    },
    onError: onErr,
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => instructorApi.deleteLesson(lessonId),
    onMutate: () => setError(''),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
    onError: (err) => {
      onErr(err);
      setConfirmDelete(null);
    },
  });

  const reorderLessonsMutation = useMutation({
    mutationFn: ({ sectionId, ids }: { sectionId: string; ids: string[] }) =>
      instructorApi.reorderLessons(sectionId, ids),
    onMutate: async ({ sectionId, ids }) => {
      setError('');
      await qc.cancelQueries({ queryKey: ['course-edit', id] });
      const prev = qc.getQueryData<SectionsCache>(['course-edit', id]);
      qc.setQueryData<SectionsCache>(
        ['course-edit', id],
        (old) =>
          old && {
            ...old,
            data: old.data.map((s) =>
              s.id !== sectionId
                ? s
                : {
                    ...s,
                    lessons: ids
                      .map((lid) => s.lessons?.find((l) => l.id === lid))
                      .filter((l): l is Lesson => l !== undefined),
                  },
            ),
          },
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['course-edit', id], ctx.prev);
      onErr(err);
    },
    onSettled: invalidate,
  });

  const handleSectionDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = sections.map((s) => s.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    reorderSectionsMutation.mutate(arrayMove(ids, oldIdx, newIdx));
  };

  const toggleCollapse = (sectionId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Khung chương trình</h1>
          <p className="mt-1 text-sm text-muted">
            Tạo khóa học theo từng chương, mỗi chương tập trung vào một mục tiêu học tập. Sau đó
            thêm nội dung, hoạt động thực hành và bài kiểm tra.
          </p>
        </div>
      </header>

      {error && <ErrorMessage message={error} />}

      {/* Bài kiểm tra cuối khóa */}
      <div className="rounded-card border border-hairline bg-surface-card p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <GraduationCap size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Bài kiểm tra cuối khóa</h2>
              <button
                type="button"
                role="switch"
                aria-checked={finalQuizEnabled}
                disabled={toggleFinalQuizMutation.isPending}
                onClick={() => toggleFinalQuizMutation.mutate(!finalQuizEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${finalQuizEnabled ? 'bg-sky' : 'bg-hairline-strong'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${finalQuizEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Luôn nằm ở cuối khóa và chiếm <strong>10% tiến độ</strong>. Nếu bạn không tự soạn,
              hệ thống sẽ tự tạo bằng AI (~30 câu bao quát các chương) khi khóa được duyệt xuất bản.
            </p>

            {finalQuizEnabled && finalQuizLesson && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-canvas-soft px-2.5 py-1 text-xs text-ink-mute">
                  {finalQuizLesson.quizLesson?._count?.questions ?? 0} câu hỏi
                </span>
                {finalQuizLesson.quizLesson?.aiGenerated ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700">
                    <Sparkles size={12} /> AI tạo
                  </span>
                ) : (finalQuizLesson.quizLesson?._count?.questions ?? 0) > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-leaf-soft px-2.5 py-1 text-xs text-leaf">
                    Giảng viên soạn
                  </span>
                ) : null}
                {finalQuizLesson.quizLesson?.generationStatus === 'generating' && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">
                    Đang tạo bằng AI…
                  </span>
                )}
                {finalQuizLesson.quizLesson?.generationStatus === 'failed' && (
                  <span className="inline-flex items-center rounded-full bg-coral-soft px-2.5 py-1 text-xs text-coral">
                    Tạo thất bại
                  </span>
                )}
                <Link
                  href={`/instructor/courses/${id}/curriculum/${finalQuizLesson.id}`}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-hairline px-3 py-1 text-xs font-medium text-sky hover:bg-sky-soft"
                >
                  <Pencil size={12} /> Tự soạn câu hỏi
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tổng quan + thu gọn/mở rộng */}
      {sections.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {sections.length} phần &bull; {totalLessons} bài học
          </span>
          <button
            onClick={() =>
              setCollapsed(allCollapsed ? new Set() : new Set(sections.map((s) => s.id)))
            }
            className="font-medium text-sky hover:underline"
          >
            {allCollapsed ? 'Mở rộng tất cả' : 'Thu gọn tất cả'}
          </button>
        </div>
      )}

      {/* Thêm phần ở trên cùng */}
      {sections.length > 0 &&
        (addSectionAt === 'top' ? (
          <div className="rounded-card border-2 border-dashed border-sky bg-sky-soft/40 p-3">
            <InlineTitleForm
              placeholder="Nhập tên phần mới..."
              saveLabel="Thêm phần"
              isPending={addSectionMutation.isPending}
              onSave={(title) => addSectionMutation.mutate({ title, position: 'top' })}
              onCancel={() => setAddSectionAt(null)}
            />
          </div>
        ) : (
          <button
            onClick={() => setAddSectionAt('top')}
            className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-hairline py-3 text-sm text-muted hover:border-sky hover:text-sky"
          >
            <Plus size={16} />
            Thêm phần lên đầu
          </button>
        ))}

      {sections.length === 0 && (
        <div className="rounded-card border-2 border-dashed border-hairline py-10 text-center">
          <p className="text-sm text-muted">
            Chưa có phần nào. Hãy tạo phần đầu tiên cho khóa học của bạn.
          </p>
        </div>
      )}

      {/* Sections — kéo thả bằng nút cầm ở đầu mỗi phần */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={(e) => setActiveDragId(String(e.active.id))}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((section, idx) => {
            const lessons = section.lessons ?? [];
            // Khi đang kéo, thu gọn tạm mọi phần để danh sách ngắn lại, dễ thả đúng chỗ
            const isCollapsed = activeDragId !== null || collapsed.has(section.id);
            const isEditingSection = editingSectionId === section.id;

            return (
              <SortableSection
                key={section.id}
                id={section.id}
                disabled={editingSectionId !== null || reorderSectionsMutation.isPending}
              >
                {(handleProps, isDragging) => (
                  <div
                    className={`overflow-hidden rounded-card border bg-surface-card ${
                      isDragging
                        ? 'border-sky shadow-lg ring-2 ring-sky-soft'
                        : 'border-hairline'
                    }`}
                  >
                    {/* Header phần */}
                    <div className="flex items-center gap-1.5 bg-canvas-soft px-3 py-2.5">
                      <button
                        type="button"
                        {...handleProps}
                        title="Kéo để đổi vị trí phần (hoặc nhấn Space rồi dùng phím mũi tên)"
                        aria-label="Kéo để đổi vị trí phần"
                        className="shrink-0 cursor-grab touch-none rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-strong hover:text-ink-mute active:cursor-grabbing"
                      >
                        <GripVertical size={15} />
                      </button>
                      <IconButton
                        label={isCollapsed ? 'Mở rộng phần' : 'Thu gọn phần'}
                        onClick={() => toggleCollapse(section.id)}
                      >
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                        />
                      </IconButton>

                      {isEditingSection ? (
                        <InlineTitleForm
                          initialValue={section.title}
                          placeholder="Tên phần..."
                          saveLabel="Lưu"
                          autoSelect
                          isPending={renameSectionMutation.isPending}
                          onSave={(title) =>
                            renameSectionMutation.mutate({ sectionId: section.id, title })
                          }
                          onCancel={() => setEditingSectionId(null)}
                        />
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                            <span className="text-ink-subtle">Phần {idx + 1}:</span> {section.title}
                            <span className="ml-2 text-xs font-normal text-ink-subtle">
                              {lessons.length} bài học
                            </span>
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <IconButton
                              label="Đổi tên phần"
                              onClick={() => setEditingSectionId(section.id)}
                            >
                              <Pencil size={14} />
                            </IconButton>
                            <IconButton
                              danger
                              label="Xóa phần"
                              onClick={() =>
                                setConfirmDelete({
                                  kind: 'section',
                                  id: section.id,
                                  title: section.title,
                                  lessonCount: lessons.length,
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                        </>
                      )}
                    </div>

                    {!isCollapsed && (
                      <>
                        {/* Lessons */}
                        <ul className="divide-y divide-hairline">
                          <LessonsDnd
                            items={lessons.map((l) => l.id)}
                            onReorder={(ids) =>
                              reorderLessonsMutation.mutate({ sectionId: section.id, ids })
                            }
                          >
                            {lessons.map((lesson, li) => (
                              <SortableLessonRow
                                key={lesson.id}
                                id={lesson.id}
                                disabled={
                                  editingLessonId !== null || reorderLessonsMutation.isPending
                                }
                              >
                                {(lessonHandle) =>
                                  editingLessonId === lesson.id ? (
                                    <InlineTitleForm
                                      initialValue={lesson.title}
                                      placeholder="Tên bài học..."
                                      saveLabel="Lưu"
                                      autoSelect
                                      isPending={renameLessonMutation.isPending}
                                      onSave={(title) =>
                                        renameLessonMutation.mutate({ lessonId: lesson.id, title })
                                      }
                                      onCancel={() => setEditingLessonId(null)}
                                    />
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        {...lessonHandle}
                                        title="Kéo để đổi vị trí bài học (hoặc nhấn Space rồi dùng phím mũi tên)"
                                        aria-label="Kéo để đổi vị trí bài học"
                                        className="shrink-0 cursor-grab touch-none rounded-lg p-1 text-ink-faint transition-colors hover:bg-surface-strong hover:text-ink-mute active:cursor-grabbing"
                                      >
                                        <GripVertical size={14} />
                                      </button>
                                      <span className="w-4 shrink-0 text-right text-xs text-ink-subtle">
                                        {li + 1}.
                                      </span>
                                      <LessonTypeIcon
                                        type={lesson.type}
                                        size={15}
                                        className="shrink-0 text-ink-subtle"
                                      />
                                      <Link
                                        href={`/instructor/courses/${id}/curriculum/${lesson.id}`}
                                        title="Mở trang soạn nội dung bài học"
                                        className="min-w-0 flex-1 truncate"
                                      >
                                        <span className="block text-sm text-ink hover:text-sky truncate">
                                          {lesson.title}
                                        </span>
                                        {lesson.type === 'video' && (
                                          <span className={`flex items-center gap-1 truncate text-xs ${lesson.videoAsset?.videoUrl ? 'text-leaf' : 'text-ink-subtle'}`}>
                                            <Video size={12} className="shrink-0" />
                                            <span className="truncate">{lesson.videoAsset?.videoUrl ? (lesson.videoAsset.fileName ?? 'video đã tải lên') : 'Chưa có video'}</span>
                                          </span>
                                        )}
                                        {lesson.type === 'document' && (
                                          <span className={`flex items-center gap-1 truncate text-xs ${lesson.documentAsset?.fileUrl ? 'text-leaf' : 'text-ink-subtle'}`}>
                                            <FileText size={12} className="shrink-0" />
                                            <span className="truncate">{lesson.documentAsset?.fileUrl ? (lesson.documentAsset.fileName ?? `${lesson.documentAsset.fileType?.toUpperCase() ?? 'tài liệu'} đã tải lên`) : 'Chưa có file'}</span>
                                          </span>
                                        )}
                                      </Link>
                                      <div className="flex shrink-0 items-center gap-0.5">
                                        <IconButton
                                          label="Đổi tên bài học"
                                          onClick={() => setEditingLessonId(lesson.id)}
                                        >
                                          <Pencil size={14} />
                                        </IconButton>
                                        <IconButton
                                          danger
                                          label="Xóa bài học"
                                          onClick={() =>
                                            setConfirmDelete({
                                              kind: 'lesson',
                                              id: lesson.id,
                                              title: lesson.title,
                                            })
                                          }
                                        >
                                          <Trash2 size={14} />
                                        </IconButton>
                                      </div>
                                    </>
                                  )
                                }
                              </SortableLessonRow>
                            ))}
                          </LessonsDnd>
                          {lessons.length === 0 && (
                            <li className="px-4 py-3 text-xs text-ink-subtle">
                              Chưa có bài học nào trong phần này.
                            </li>
                          )}
                        </ul>

                        {/* Thêm bài học */}
                        <button
                          onClick={() => setAddLessonForSection(section.id)}
                          className="flex w-full items-center gap-1.5 border-t border-hairline px-4 py-2.5 text-xs font-medium text-sky hover:bg-sky-soft"
                        >
                          <Plus size={14} />
                          Thêm bài học
                        </button>
                      </>
                    )}
                  </div>
                )}
              </SortableSection>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Thêm phần ở cuối */}
      {addSectionAt === 'bottom' ? (
        <div className="rounded-card border-2 border-dashed border-sky bg-sky-soft/40 p-3">
          <InlineTitleForm
            placeholder="Nhập tên phần mới..."
            saveLabel="Thêm phần"
            isPending={addSectionMutation.isPending}
            onSave={(title) => addSectionMutation.mutate({ title, position: 'bottom' })}
            onCancel={() => setAddSectionAt(null)}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddSectionAt('bottom')}
          className="w-full rounded-full bg-sky px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-deep"
        >
          + Thêm phần mới
        </button>
      )}

      {addLessonForSection && (
        <AddLessonModal
          sectionTitle={sections.find((s) => s.id === addLessonForSection)?.title}
          isPending={addLessonMutation.isPending}
          onClose={() => setAddLessonForSection(null)}
          onSubmit={(dto) =>
            addLessonMutation.mutateAsync({ sectionId: addLessonForSection, ...dto })
          }
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={confirmDelete.kind === 'section' ? 'Xóa phần này?' : 'Xóa bài học này?'}
          message={
            confirmDelete.kind === 'section'
              ? `Phần "${confirmDelete.title}"${
                  confirmDelete.lessonCount > 0
                    ? ` cùng ${confirmDelete.lessonCount} bài học bên trong`
                    : ''
                } sẽ bị xóa vĩnh viễn.`
              : `Bài học "${confirmDelete.title}" cùng toàn bộ nội dung sẽ bị xóa vĩnh viễn.`
          }
          isPending={deleteSectionMutation.isPending || deleteLessonMutation.isPending}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.kind === 'section') {
              deleteSectionMutation.mutate(confirmDelete.id);
            } else {
              deleteLessonMutation.mutate(confirmDelete.id);
            }
          }}
        />
      )}
    </div>
  );
}
