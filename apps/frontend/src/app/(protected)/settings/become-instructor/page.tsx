'use client';

import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import {
  instructorApplicationApi,
  type ApplyInstructorDto,
} from '@/lib/api/instructor-application.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { notify } from '@/store/dialog.store';

const schema = z.object({
  expertise: z.string().min(10, 'Tối thiểu 10 ký tự').max(2000, 'Tối đa 2000 ký tự'),
  experience: z.string().min(10, 'Tối thiểu 10 ký tự').max(2000, 'Tối đa 2000 ký tự'),
  motivation: z.string().min(10, 'Tối thiểu 10 ký tự').max(2000, 'Tối đa 2000 ký tự'),
});

type FormData = z.infer<typeof schema>;

const inputClass =
  'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky focus:border-sky transition-colors resize-none';

export default function BecomeInstructorPage() {
  const { user, refreshUser } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-application-me'],
    queryFn: () => instructorApplicationApi.getMine().then((r) => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema) });

  const applyMutation = useMutation({
    mutationFn: (dto: ApplyInstructorDto) => instructorApplicationApi.apply(dto),
    onSuccess: async () => {
      notify.success('Đã gửi đơn đăng ký. Vui lòng chờ quản trị viên duyệt.');
      reset();
      await qc.invalidateQueries({ queryKey: ['instructor-application-me'] });
    },
    onError: (err: any) => {
      notify.error(err?.response?.data?.message ?? 'Gửi đơn thất bại');
    },
  });

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
        <form
          onSubmit={handleSubmit((d) => applyMutation.mutate(d))}
          className="space-y-4"
        >
          <Field
            label="Lĩnh vực / chuyên môn giảng dạy *"
            placeholder="Ví dụ: Lập trình web, Thiết kế UI/UX, Marketing..."
            error={errors.expertise?.message}
            register={register('expertise')}
          />
          <Field
            label="Kinh nghiệm & bằng cấp *"
            placeholder="Mô tả kinh nghiệm làm việc, giảng dạy, chứng chỉ liên quan..."
            error={errors.experience?.message}
            register={register('experience')}
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
