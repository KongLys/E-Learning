'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { couponApi, CreateCouponDto } from '@/lib/api/coupon.api';
import { instructorApi } from '@/lib/api/instructor.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Download, Plus, Trash2, Upload } from 'lucide-react';

type Tab = 'list' | 'create' | 'import';

function generateCode(prefix = 'GIAMGIA') {
  return `${prefix}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN');
}

export default function CouponsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('list');
  const [form, setForm] = useState<CreateCouponDto>({
    code: generateCode(),
    discountPct: 10,
    maxUses: 0,
  });
  const [formError, setFormError] = useState('');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: couponsData, isLoading: couponsLoading } = useQuery({
    queryKey: ['instructor-coupons'],
    queryFn: () => couponApi.list(),
  });
  const coupons: any[] = couponsData?.data ?? [];

  const { data: coursesData } = useQuery({
    queryKey: ['instructor-courses'],
    queryFn: () => instructorApi.getCourses(),
  });
  const courses: any[] = coursesData?.data?.courses ?? coursesData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (dto: CreateCouponDto) => couponApi.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instructor-coupons'] });
      setForm({ code: generateCode(), discountPct: 10, maxUses: 0 });
      setFormError('');
      setTab('list');
    },
    onError: (err: any) => setFormError(err?.response?.data?.message ?? 'Lỗi tạo coupon'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => couponApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instructor-coupons'] }),
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Lỗi xóa coupon'),
  });

  const bulkMutation = useMutation({
    mutationFn: (file: File) => couponApi.bulkCreate(file),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['instructor-coupons'] });
      setBulkResults(res.data ?? []);
      setCsvPreview([]);
      setCsvFile(null);
    },
    onError: (err: any) => alert(err?.response?.data?.message ?? 'Lỗi import CSV'),
  });

  const parseCsvPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1, 11).map((line) => {
        const values = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
        return row;
      });
      setCsvPreview(rows);
    };
    reader.readAsText(file, 'utf-8');
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'list', label: 'Danh sách coupon' },
    { key: 'create', label: 'Tạo thủ công' },
    { key: 'import', label: 'Import CSV' },
  ];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Quản lý Coupon</h1>
        <p className="text-sm text-gray-500">Tạo và quản lý mã giảm giá cho khóa học</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List tab */}
      {tab === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {couponsLoading ? (
            <div className="p-8"><LoadingSpinner /></div>
          ) : coupons.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-gray-400 mb-4">Chưa có coupon nào</p>
              <button onClick={() => setTab('create')} className="text-sm text-blue-600 hover:underline">
                Tạo coupon đầu tiên
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-120">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Mã</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Khóa học</th>
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
                      <td className="px-5 py-3 text-gray-600">{c.course?.title ?? 'Tất cả khóa học'}</td>
                      <td className="px-5 py-3 text-center font-semibold text-blue-600">{c.discountPct}%</td>
                      <td className="px-5 py-3 text-center text-gray-600">
                        {c.usedCount}/{c.maxUses > 0 ? c.maxUses : '∞'}
                      </td>
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
      )}

      {/* Create tab */}
      {tab === 'create' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Tạo coupon thủ công</h2>

          {formError && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-4 py-2">{formError}</p>}

          <div>
            <label className="block text-sm font-medium mb-1.5">Mã coupon *</label>
            <div className="flex gap-2">
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="VD: GIAM20"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, code: generateCode() }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
              >
                Random
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Áp dụng cho khóa học</label>
            <select
              value={form.courseId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value || undefined }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Tất cả khóa học</option>
              {courses.map((c: any) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Giảm giá (%) *</label>
              <input
                type="number"
                min={1}
                max={100}
                value={form.discountPct}
                onChange={(e) => setForm((f) => ({ ...f, discountPct: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Số lần dùng tối đa</label>
              <input
                type="number"
                min={0}
                value={form.maxUses ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, maxUses: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="0 = không giới hạn"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Ngày hết hạn</label>
            <input
              type="date"
              value={form.expiresAt ?? ''}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value || undefined }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={() => createMutation.mutate(form)}
            disabled={createMutation.isPending || !form.code.trim() || form.discountPct < 1}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={16} />
            {createMutation.isPending ? 'Đang tạo...' : 'Tạo coupon'}
          </button>
        </div>
      )}

      {/* Import CSV tab */}
      {tab === 'import' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-blue-800 mb-2">Hướng dẫn import CSV</h3>
            <p className="text-xs text-blue-700 mb-3">
              File CSV phải có các cột: <code className="bg-blue-100 px-1 rounded">code, courseId (tùy chọn), discountPct, maxUses (tùy chọn), expiresAt (tùy chọn)</code>
            </p>
            <button
              onClick={() => couponApi.coursesExport()}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm text-blue-700 font-medium hover:bg-blue-50 transition-colors"
            >
              <Download size={14} />
              Tải danh sách ID khóa học (CSV)
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Chọn file CSV</h2>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              <Upload size={28} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600">
                {csvFile ? csvFile.name : 'Click để chọn file CSV'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Hỗ trợ định dạng .csv</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setCsvFile(f); parseCsvPreview(f); setBulkResults([]); }
              }}
            />

            {csvPreview.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Xem trước (tối đa 10 dòng đầu):</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(csvPreview[0]).map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {csvPreview.map((row, i) => (
                        <tr key={i}>
                          {Object.values(row).map((v: any, j) => (
                            <td key={j} className="px-3 py-2 text-gray-700">{v}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {csvFile && (
              <button
                onClick={() => bulkMutation.mutate(csvFile)}
                disabled={bulkMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Upload size={16} />
                {bulkMutation.isPending ? 'Đang import...' : 'Import coupon'}
              </button>
            )}

            {bulkResults.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Kết quả import:</p>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {bulkResults.map((r: any, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${r.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      <span className="font-mono font-medium">{r.code}</span>
                      <span>{r.success ? '✓ Thành công' : `✗ ${r.error}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
