'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { formatVND } from '@/lib/utils';
import { notify } from '@/store/dialog.store';
import { getApiErrorMessage } from '@/lib/api/error';

const inputClass = 'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky';

interface CoursePricing {
  price?: number | string;
  discountPrice?: number | string | null;
}

function PricingForm({ courseId, initial }: { courseId: string; initial: CoursePricing }) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(Number(initial.price ?? 0));
  const [discountPrice, setDiscountPrice] = useState<number | ''>(
    initial.discountPrice != null ? Number(initial.discountPrice) : '',
  );
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      instructorApi.updateCourse(courseId, {
        price,
        discountPrice: discountPrice === '' ? undefined : Number(discountPrice),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-manage', courseId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => notify.error(getApiErrorMessage(err, 'Lưu thất bại')),
  });

  const invalidDiscount = discountPrice !== '' && Number(discountPrice) >= price;

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-2xl font-bold text-ink">Định giá</h1>
        <p className="mt-1 text-sm text-muted">
          Đặt giá cho khóa học của bạn. Để cung cấp miễn phí, hãy đặt giá bằng 0.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-1">Giá (VND)</label>
          <input
            type="text"
            inputMode="numeric"
            value={price === 0 ? '' : String(price)}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              setPrice(digits === '' ? 0 : Number(digits));
            }}
            placeholder="0"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">{price > 0 ? formatVND(price) : 'Miễn phí'}</p>
        </div>
        {/* Tạm ẩn ô Giá khuyến mãi — chưa nối vào luồng hiển thị/thanh toán cho học viên.
            Bật lại bằng cách đổi `false` thành `true`. */}
        {false && (
          <div>
            <label className="block text-sm font-medium mb-1">Giá khuyến mãi (VND)</label>
            <input
              type="text"
              inputMode="numeric"
              value={discountPrice === '' ? '' : String(discountPrice)}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setDiscountPrice(digits === '' ? '' : Number(digits));
              }}
              className={inputClass}
              placeholder="Tùy chọn"
            />
            {invalidDiscount && <p className="mt-1 text-xs text-semantic-error">Giá khuyến mãi phải nhỏ hơn giá gốc</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || invalidDiscount}
          className="rounded-md bg-sky px-5 py-2 text-sm font-semibold text-white hover:bg-sky-deep disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Đang lưu...' : 'Lưu'}
        </button>
        {saved && <span className="text-sm text-leaf">Đã lưu</span>}
      </div>
    </div>
  );
}

export default function CoursePricingPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery<CoursePricing>({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  if (isLoading || !data) return <LoadingSpinner />;

  return <PricingForm courseId={id} initial={data} />;
}
