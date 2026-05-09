'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

function OrderDetailModal({ order, onClose, onRefund, refunding }: { order: any; onClose: () => void; onRefund: () => void; refunding: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Chi tiết đơn hàng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-gray-500">Order ID:</span><br /><span className="font-mono text-xs">{order.orderId}</span></div>
            <div><span className="text-gray-500">Trạng thái:</span><br />
              <span className={`font-medium ${order.status === 'paid' ? 'text-green-600' : order.status === 'refunded' ? 'text-orange-600' : order.status === 'failed' ? 'text-red-600' : 'text-gray-600'}`}>{order.status}</span>
            </div>
            <div><span className="text-gray-500">Tổng tiền:</span><br /><span className="font-semibold">{Number(order.totalAmount).toLocaleString('vi-VN')}₫</span></div>
            <div><span className="text-gray-500">Ngày:</span><br />{new Date(order.createdAt).toLocaleString('vi-VN')}</div>
          </div>
          <div>
            <p className="text-gray-500 mb-2">Sản phẩm:</p>
            <ul className="space-y-1">
              {order.items?.map((item: any) => (
                <li key={item.courseId} className="flex justify-between">
                  <span>{item.title}</span>
                  <span className="text-gray-500">{Number(item.price).toLocaleString('vi-VN')}₫</span>
                </li>
              ))}
            </ul>
          </div>
          {order.payment && (
            <div className="border-t pt-3">
              <p className="text-gray-500 mb-1">Thanh toán:</p>
              <div className="text-xs text-gray-600 space-y-0.5">
                <p>Transaction: {order.payment.transactionId ?? '—'}</p>
                <p>Trạng thái: {order.payment.status}</p>
              </div>
            </div>
          )}
        </div>
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Đóng</button>
          {order.status === 'paid' && (
            <button onClick={onRefund} disabled={refunding} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50">
              {refunding ? 'Đang hoàn...' : 'Hoàn tiền'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTIONS = ['', 'pending', 'paid', 'failed', 'refunded'];

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
        <h1 className="text-2xl font-bold">Đơn hàng</h1>
        <span className="text-sm text-gray-500">{total} tổng</span>
      </div>

      <div className="flex gap-3">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s || 'Tất cả trạng thái'}</option>)}
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Order ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Khóa học</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tổng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Không có dữ liệu</td></tr>
              ) : orders.map((o: any) => (
                <tr key={o.orderId} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(o)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.orderId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-700">{o.items?.map((i: any) => i.title).join(', ')}</td>
                  <td className="px-4 py-3 font-medium">{Number(o.totalAmount).toLocaleString('vi-VN')}₫</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      o.status === 'paid' ? 'bg-green-100 text-green-700' :
                      o.status === 'refunded' ? 'bg-orange-100 text-orange-700' :
                      o.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(o.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setSelected(o)} className="text-xs text-blue-500 hover:text-blue-700">Xem</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Trước</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Sau →</button>
        </div>
      )}
    </div>
  );
}
