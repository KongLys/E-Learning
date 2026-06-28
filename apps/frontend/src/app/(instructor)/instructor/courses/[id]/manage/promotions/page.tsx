'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponApi, CreateCouponDto } from '@/lib/api/coupon.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Plus, Trash2 } from 'lucide-react';
import { notify, showConfirm } from '@/store/dialog.store';
import { getApiErrorMessage } from '@/lib/api/error';
import type { Coupon } from '@/types/coupon';

const inputClass = 'w-full border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky';

function generateCode(prefix = 'GIAMGIA') {
  return `${prefix}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

export default function CoursePromotionsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<CreateCouponDto, 'courseId'>>({ code: generateCode(), discountPct: 10, maxUses: 0 });
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['instructor-coupons'],
    queryFn: () => couponApi.list(),
  });
  const allCoupons: Coupon[] = data?.data ?? [];
  const coupons = allCoupons.filter((c) => (c.courseId ?? c.course?.id) === id);

  const createMutation = useMutation({
    mutationFn: () => couponApi.create({ ...form, courseId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-coupons'] });
      setForm({ code: generateCode(), discountPct: 10, maxUses: 0 });
      setFormError('');
      setShowForm(false);
    },
    onError: (err) => setFormError(getApiErrorMessage(err, 'Lỗi tạo coupon')),
  });

  const deleteMutation = useMutation({
    mutationFn: (couponId: string) => couponApi.delete(couponId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-coupons'] }),
    onError: (err) => notify.error(getApiErrorMessage(err, 'Lỗi xóa coupon')),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Khuyến mãi</h1>
          <p className="mt-1 text-sm text-muted">Tạo và quản lý mã giảm giá riêng cho khóa học này.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky px-3 py-2 text-sm font-medium text-white hover:bg-sky-deep"
        >
          <Plus size={15} />
          Tạo coupon
        </button>
      </header>

      {showForm && (
        <div className="rounded-card border border-hairline bg-canvas-soft p-5 space-y-4 max-w-lg">
          {formError && <p className="text-sm text-semantic-error bg-coral-soft rounded-lg px-4 py-2">{formError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1">Mã coupon</label>
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                className="px-3 py-2 border border-hairline-strong rounded-lg text-xs text-ink-mute hover:bg-surface-strong"
              >
                Random
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Giảm giá (%)</label>
              <input type="number" min={1} max={100} value={form.discountPct} onChange={(e) => setForm((f) => ({ ...f, discountPct: Number(e.target.value) }))} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Số lần dùng tối đa</label>
              <input type="number" min={0} value={form.maxUses ?? 0} onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))} className={inputClass} placeholder="0 = không giới hạn" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Ngày hết hạn</label>
            <input
              type="date"
              value={form.expiresAt ?? ''}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || undefined }))}
              className={inputClass}
            />
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !form.code.trim() || form.discountPct < 1}
            className="w-full rounded-lg bg-sky py-2.5 text-sm font-medium text-white hover:bg-sky-deep disabled:opacity-50"
          >
            {createMutation.isPending ? 'Đang tạo...' : 'Tạo coupon'}
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : coupons.length === 0 ? (
        <div className="rounded-card border border-hairline p-10 text-center text-sm text-muted">
          Chưa có coupon nào cho khóa học này.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-canvas-soft border-b border-hairline">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted">Mã</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-muted">Giảm</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-muted">Đã dùng</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-muted">Hết hạn</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {coupons.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const full = c.maxUses > 0 && c.usedCount >= c.maxUses;
                return (
                  <tr key={c.id} className="hover:bg-canvas-soft">
                    <td className="px-5 py-3 font-mono font-medium text-ink">{c.code}</td>
                    <td className="px-5 py-3 text-center font-semibold text-sky">{c.discountPct}%</td>
                    <td className="px-5 py-3 text-center text-ink-mute">{c.usedCount}/{c.maxUses > 0 ? c.maxUses : '∞'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs ${expired ? 'text-semantic-error' : full ? 'text-ink-subtle' : 'text-ink-mute'}`}>
                        {formatDate(c.expiresAt)}
                        {expired && ' (hết hạn)'}
                        {full && !expired && ' (hết lượt)'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={async () => { if (await showConfirm({ title: `Xóa coupon "${c.code}"?` })) deleteMutation.mutate(c.id); }}
                        disabled={deleteMutation.isPending}
                        className="text-coral hover:opacity-80 disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
