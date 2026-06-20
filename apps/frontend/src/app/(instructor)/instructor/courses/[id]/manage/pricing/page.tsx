'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { formatVND } from '@/lib/utils';
import { notify } from '@/store/dialog.store';

const inputClass = 'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky';

export default function CoursePricingPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [price, setPrice] = useState(0);
  const [discountPrice, setDiscountPrice] = useState<number | ''>('');
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['course-manage', id],
    queryFn: () => instructorApi.getCourseById(id).then((r) => r.data),
  });

  useEffect(() => {
    if (data) {
      setPrice(Number(data.price ?? 0));
      setDiscountPrice(data.discountPrice != null ? Number(data.discountPrice) : '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      instructorApi.updateCourse(id, {
        price,
        discountPrice: discountPrice === '' ? undefined : Number(discountPrice),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-manage', id] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => notify.error(err?.response?.data?.message ?? 'Lưu thất bại'),
  });

  if (isLoading) return <LoadingSpinner />;

  const invalidDiscount = discountPrice !== '' && Number(discountPrice) >= price;

  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-2xl font-bold text-ink">Định giá</h1>
        <p className="mt-1 text-sm text-muted">
          Đặt giá cho khóa học của bạn. Để cung cấp miễn phí, hãy đặt giá bằng 0.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-lg">
        <div>
          <label className="block text-sm font-medium mb-1">Giá (VND)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">{price > 0 ? formatVND(price) : 'Miễn phí'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Giá khuyến mãi (VND)</label>
          <input
            type="number"
            min={0}
            value={discountPrice}
            onChange={(e) => setDiscountPrice(e.target.value === '' ? '' : Number(e.target.value))}
            className={inputClass}
            placeholder="Tùy chọn"
          />
          {invalidDiscount && <p className="mt-1 text-xs text-semantic-error">Giá khuyến mãi phải nhỏ hơn giá gốc</p>}
        </div>
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
