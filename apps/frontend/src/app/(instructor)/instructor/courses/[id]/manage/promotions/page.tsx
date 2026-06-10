'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponApi, CreateCouponDto } from '@/lib/api/coupon.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Plus, Trash2 } from 'lucide-react';

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500';

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
  const allCoupons: any[] = data?.data ?? [];
  const coupons = allCoupons.filter((c) => (c.courseId ?? c.course?.id) === id);

  const createMutation = useMutation({
    mutationFn: () => couponApi.create({ ...form, courseId: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-coupons'] });
      setForm({ code: generateCode(), discountPct: 10, maxUses: 0 });
      setFormError('');
      setShowForm(false);
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Lỗi tạo coupon'),
  });

  const deleteMutation = useMutation({
    mutationFn: (couponId: string) => couponApi.delete(couponId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-coupons'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Lỗi xóa coupon'),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khuyến mãi</h1>
          <p className="mt-1 text-sm text-gray-500">Tạo và quản lý mã giảm giá riêng cho khóa học này.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Plus size={15} />
          Tạo coupon
        </button>
      </header>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4 max-w-lg">
          {formError && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2">{formError}</p>}
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
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-100"
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
            className="w-full rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Đang tạo...' : 'Tạo coupon'}
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : coupons.length === 0 ? (
        <div className="rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          Chưa có coupon nào cho khóa học này.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Mã</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">Giảm</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">Đã dùng</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">Hết hạn</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coupons.map((c: any) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const full = c.maxUses > 0 && c.usedCount >= c.maxUses;
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono font-medium text-gray-900">{c.code}</td>
                    <td className="px-5 py-3 text-center font-semibold text-purple-600">{c.discountPct}%</td>
                    <td className="px-5 py-3 text-center text-gray-600">{c.usedCount}/{c.maxUses > 0 ? c.maxUses : '∞'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs ${expired ? 'text-red-500' : full ? 'text-gray-400' : 'text-gray-600'}`}>
                        {formatDate(c.expiresAt)}
                        {expired && ' (hết hạn)'}
                        {full && !expired && ' (hết lượt)'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => { if (confirm(`Xóa coupon "${c.code}"?`)) deleteMutation.mutate(c.id); }}
                        disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-600 disabled:opacity-50"
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
