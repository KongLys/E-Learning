'use client';

import { useRef, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CheckCircle2, Clock, FileText, ImageIcon, Upload, X, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import {
  instructorApplicationApi,
  type ApplyInstructorInput,
} from '@/lib/api/instructor-application.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { notify } from '@/store/dialog.store';
import { getApiErrorMessage } from '@/lib/api/error';

const schema = z.object({
  expertise: z.string().min(10, 'Tối thiểu 10 ký tự').max(2000, 'Tối đa 2000 ký tự'),
  experience: z.string().min(10, 'Tối thiểu 10 ký tự').max(2000, 'Tối đa 2000 ký tự'),
  qualifications: z.string().max(2000, 'Tối đa 2000 ký tự').optional().or(z.literal('')),
  motivation: z.string().min(10, 'Tối thiểu 10 ký tự').max(2000, 'Tối đa 2000 ký tự'),
});

type FormData = z.infer<typeof schema>;

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const inputClass =
  'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky focus:border-sky transition-colors resize-none';

export default function BecomeInstructorPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-application-me'],
    queryFn: () => instructorApplicationApi.getMine().then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const applyMutation = useMutation({
    mutationFn: (input: ApplyInstructorInput) => instructorApplicationApi.apply(input),
    onSuccess: async () => {
      notify.success('Đã gửi đơn đăng ký. Vui lòng chờ quản trị viên duyệt.');
      reset();
      setFiles([]);
      await qc.invalidateQueries({ queryKey: ['instructor-application-me'] });
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Gửi đơn thất bại'));
    },
  });

  const handleFilesSelected = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    const valid: File[] = [];
    for (const file of incoming) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        notify.error(`"${file.name}" không phải ảnh hoặc PDF hợp lệ`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        notify.error(`"${file.name}" vượt quá 10MB`);
        continue;
      }
      valid.push(file);
    }
    setFiles((prev) => {
      const merged = [...prev, ...valid];
      if (merged.length > MAX_FILES) {
        notify.error(`Tối đa ${MAX_FILES} tệp bằng cấp`);
      }
      return merged.slice(0, MAX_FILES);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = (d: FormData) => {
    if (files.length === 0) {
      notify.error('Vui lòng đính kèm ít nhất một ảnh hoặc tệp PDF bằng cấp / chứng chỉ');
      return;
    }
    applyMutation.mutate({
      expertise: d.expertise,
      experience: d.experience,
      qualifications: d.qualifications || undefined,
      motivation: d.motivation,
      files,
    });
  };

  if (isLoading) return <LoadingSpinner />;

  const application = data ?? null;
  const isInstructor = user?.role === 'instructor' || user?.role === 'admin';

  // Đã là giảng viên (hoặc đơn đã được duyệt)
  if (isInstructor || application?.status === 'approved') {
    return (
      <Shell>
        <div className="bg-surface-card border border-hairline rounded-card p-8 text-center">
          <CheckCircle2 className="mx-auto text-semantic-success mb-3" size={40} />
          <h2 className="text-lg font-semibold text-ink mb-1">Bạn đã là giảng viên</h2>
          <p className="text-sm text-ink-subtle mb-5">
            Bạn có thể bắt đầu tạo và quản lý khóa học của mình.
          </p>
          <Link
            href="/instructor/dashboard"
            className="inline-block bg-sky text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-sky-deep transition-colors"
          >
            Tới trang giảng dạy
          </Link>
        </div>
      </Shell>
    );
  }

  // Đơn đang chờ duyệt
  if (application?.status === 'pending') {
    return (
      <Shell>
        <div className="bg-surface-card border border-hairline rounded-card p-8 text-center">
          <Clock className="mx-auto text-amber-500 mb-3" size={40} />
          <h2 className="text-lg font-semibold text-ink mb-1">Đơn đang chờ duyệt</h2>
          <p className="text-sm text-ink-subtle">
            Đơn đăng ký làm giảng viên của bạn đã được gửi và đang chờ quản trị viên
            xem xét. Chúng tôi sẽ thông báo cho bạn khi có kết quả.
          </p>
        </div>
      </Shell>
    );
  }

  // Chưa nộp hoặc đã bị từ chối → hiện form (kèm banner lý do nếu bị từ chối)
  return (
    <Shell>
      {application?.status === 'rejected' && (
        <div className="bg-semantic-error/10 border border-semantic-error/30 rounded-card p-4 mb-6 flex gap-3">
          <XCircle className="text-semantic-error shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-semantic-error mb-0.5">
              Đơn trước đó đã bị từ chối
            </p>
            {application.rejectReason && (
              <p className="text-sm text-ink-subtle">Lý do: {application.rejectReason}</p>
            )}
            <p className="text-xs text-ink-subtle mt-1">
              Bạn có thể chỉnh sửa thông tin và nộp lại đơn mới.
            </p>
          </div>
        </div>
      )}

      <div className="bg-surface-card border border-hairline rounded-card p-6">
        <p className="text-sm text-ink-subtle mb-5">
          Chia sẻ với chúng tôi về chuyên môn và kinh nghiệm của bạn để trở thành
          giảng viên trên nền tảng.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field
            label="Lĩnh vực / chuyên môn giảng dạy *"
            placeholder="Ví dụ: Lập trình web, Thiết kế UI/UX, Marketing..."
            error={errors.expertise?.message}
            register={register('expertise')}
          />
          <Field
            label="Kinh nghiệm làm việc / giảng dạy *"
            placeholder="Mô tả kinh nghiệm làm việc, giảng dạy liên quan đến lĩnh vực của bạn..."
            error={errors.experience?.message}
            register={register('experience')}
          />
          <Field
            label="Bằng cấp & chứng chỉ"
            placeholder="Liệt kê các bằng cấp, chứng chỉ bạn có (không bắt buộc nếu đã đính kèm file)..."
            error={errors.qualifications?.message}
            register={register('qualifications')}
          />

          <CredentialUpload
            files={files}
            inputRef={fileInputRef}
            onSelect={handleFilesSelected}
            onRemove={removeFile}
          />

          <Field
            label="Lý do muốn trở thành giảng viên *"
            placeholder="Điều gì khiến bạn muốn giảng dạy trên nền tảng này?"
            error={errors.motivation?.message}
            register={register('motivation')}
          />

          <button
            type="submit"
            disabled={isSubmitting || applyMutation.isPending}
            className="w-full bg-sky text-white py-2 rounded-lg text-sm font-medium hover:bg-sky-deep disabled:opacity-50 transition-colors"
          >
            {applyMutation.isPending ? 'Đang gửi...' : 'Gửi đơn đăng ký'}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="font-display text-3xl text-ink font-bold mb-2">
        Đăng ký làm giảng viên
      </h1>
      <p className="text-sm text-ink-subtle mb-8">
        Trở thành giảng viên để tạo và bán khóa học của riêng bạn.
      </p>
      {children}
    </div>
  );
}

function Field({
  label,
  placeholder,
  error,
  register,
}: {
  label: string;
  placeholder: string;
  error?: string;
  register: UseFormRegisterReturn;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-ink">{label}</label>
      <textarea {...register} rows={3} placeholder={placeholder} className={inputClass} />
      {error && <p className="text-xs text-semantic-error mt-1">{error}</p>}
    </div>
  );
}

function CredentialUpload({
  files,
  inputRef,
  onSelect,
  onRemove,
}: {
  files: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-ink">
        Ảnh / file bằng cấp, chứng chỉ *
      </label>
      <p className="text-xs text-ink-subtle mb-2">
        Bắt buộc đính kèm ít nhất một ảnh hoặc PDF bằng cấp, chứng chỉ — tối đa 5 tệp, mỗi tệp 10MB.
      </p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-hairline-strong rounded-lg px-3 py-4 text-sm text-ink-subtle hover:border-sky hover:text-sky transition-colors"
      >
        <Upload size={16} />
        Chọn tệp để tải lên
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => onSelect(e.target.files)}
      />

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 border border-hairline rounded-lg px-3 py-2 text-sm"
            >
              {file.type === 'application/pdf' ? (
                <FileText size={16} className="text-semantic-error shrink-0" />
              ) : (
                <ImageIcon size={16} className="text-sky shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate text-ink">{file.name}</span>
              <span className="text-xs text-ink-subtle shrink-0">
                {(file.size / 1024 / 1024).toFixed(1)}MB
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="text-ink-subtle hover:text-semantic-error shrink-0"
                aria-label="Xóa tệp"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
