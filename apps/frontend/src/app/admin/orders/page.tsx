'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const STATUS_CLASS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  refunded: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-600',
  pending: 'bg-gray-100 text-gray-600',
};

const STATUS_TEXT_CLASS: Record<string, string> = {
  paid: 'text-green-600',
  refunded: 'text-amber-600',
  failed: 'text-red-600',
  pending: 'text-gray-600',
};

function OrderDetailModal({ order, onClose, onRefund, refunding }: { order: any; onClose: () => void; onRefund: () => void; refunding: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Chi tiết đơn hàng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Order ID</span>
              <p className="font-mono text-xs text-gray-700 mt-1">{order.orderId}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Trạng thái</span>
              <p className={`font-medium mt-1 ${STATUS_TEXT_CLASS[order.status] ?? 'text-gray-600'}`}>{order.status}</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Tổng tiền</span>
              <p className="font-semibold text-gray-900 mt-1">{Number(order.totalAmount).toLocaleString('vi-VN')}₫</p>
            </div>
            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Ngày</span>
              <p className="text-gray-700 mt-1">{new Date(order.createdAt).toLocaleString('vi-VN')}</p>
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Sản phẩm</span>
            <ul className="mt-2 space-y-1.5">
              {order.items?.map((item: any) => (
                <li key={item.courseId} className="flex justify-between text-sm">
                  <span className="text-gray-700">{item.title}</span>
                  <span className="text-gray-400">{Number(item.price).toLocaleString('vi-VN')}₫</span>
                </li>
              ))}
            </ul>
          </div>
          {order.payment && (
            <div className="border-t pt-3 space-y-1">
              <span className="text-xs text-gray-400 uppercase tracking-wide">Thanh toán</span>
              <p className="text-xs text-gray-600">Transaction: {order.payment.transactionId ?? '—'}</p>
              <p className="text-xs text-gray-600">Trạng thái: {order.payment.status}</p>
            </div>
          )}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Đóng</button>
          {order.status === 'paid' && (
            <button onClick={onRefund} disabled={refunding} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {refunding ? 'Đang hoàn...' : 'Hoàn tiền'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ['', 'pending', 'paid', 'failed', 'refunded'];
const STATUS_LABELS: Record<string, string> = { '': 'Tất cả trạng thái', pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded' };

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', page, status],
    queryFn: () => adminApi.getOrders({ status: status || undefined, page, limit: 20 }),
  });

  const refundMutation = useMutation({
    mutationFn: (id: string) => adminApi.refundOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-orders'] }); setSelected(null); },
  });

  const orders: any[] = data?.data?.orders ?? [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onRefund={() => refundMutation.mutate(selected.orderId)}
          refunding={refundMutation.isPending}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Đơn hàng</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} tổng</p>
        </div>
      </div>

      <div className="flex gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Order ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Khóa học</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Tổng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Ngày</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Không có dữ liệu</td></tr>
              ) : orders.map((o: any) => (
                <tr key={o.orderId} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(o)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{o.orderId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-700">{o.items?.map((i: any) => i.title).join(', ')}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{Number(o.totalAmount).toLocaleString('vi-VN')}₫</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setSelected(o)} className="text-xs text-gray-500 hover:text-gray-900 font-medium">Xem</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={14} /> Trước</button>
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Sau <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
