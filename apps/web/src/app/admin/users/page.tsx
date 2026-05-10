'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin.api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Search } from 'lucide-react';

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
        <p className="text-gray-800">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Hủy</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700">Xác nhận</button>
        </div>
      </div>
    </div>
  );
}

const ROLE_CLASS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  instructor: 'bg-blue-100 text-blue-700',
  student: 'bg-gray-100 text-gray-600',
};

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<{ userId: string; action: 'active' | 'locked'; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, role, status, search],
    queryFn: () => adminApi.getUsers({ page, limit: 20, role: role || undefined, status: status || undefined, search: search || undefined }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'active' | 'locked' }) => adminApi.updateUserStatus(id, s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); setConfirm(null); },
  });

  const users: any[] = data?.data?.users ?? [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      {confirm && (
        <ConfirmDialog
          message={`${confirm.action === 'locked' ? 'Khóa' : 'Mở khóa'} tài khoản "${confirm.name}"?`}
          onConfirm={() => statusMutation.mutate({ id: confirm.userId, s: confirm.action })}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Người dùng</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} tổng</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Tìm email / tên..."
            className="border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
          <option value="">Tất cả role</option>
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
          <option value="admin">Admin</option>
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400">
          <option value="">Tất cả trạng thái</option>
          <option value="active">Active</option>
          <option value="locked">Locked</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Họ tên</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Ngày tạo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Không có dữ liệu</td></tr>
              ) : users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{u.email}</td>
                  <td className="px-4 py-3 text-gray-700">{u.fullName}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_CLASS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {u.status === 'active' ? 'Active' : 'Locked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(u.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3">
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => setConfirm({ userId: u.id, action: u.status === 'active' ? 'locked' : 'active', name: u.email })}
                        className={`text-xs font-medium ${u.status === 'active' ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}
                      >
                        {u.status === 'active' ? 'Khóa' : 'Mở khóa'}
                      </button>
                    )}
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
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Sau →</button>
        </div>
      )}
    </div>
  );
}
