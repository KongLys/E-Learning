'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communityApi } from '@/lib/api/community.api';
import { courseApi } from '@/lib/api/course.api';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

const TYPE_LABELS: Record<string, string> = {
  question: 'Hỏi đáp',
  discussion: 'Thảo luận',
  announcement: 'Thông báo',
};

const TYPE_COLORS: Record<string, string> = {
  question: 'bg-blue-100 text-blue-700',
  discussion: 'bg-green-100 text-green-700',
  announcement: 'bg-orange-100 text-orange-700',
};

export default function CourseCommunityPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [sort, setSort] = useState('newest');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', type: 'question' });

  const { data: courseData } = useQuery({
    queryKey: ['course-detail', slug],
    queryFn: () => courseApi.getCourseBySlug(slug),
  });
  const courseId = courseData?.data?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['community-posts', courseId, sort, typeFilter, page],
    queryFn: () => communityApi.listPosts(courseId!, { type: typeFilter || undefined, sort, page }),
    enabled: !!courseId,
  });

  const createMutation = useMutation({
    mutationFn: () => communityApi.createPost(courseId!, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community-posts', courseId] });
      setShowForm(false);
      setForm({ title: '', body: '', type: 'question' });
    },
  });

  const voteMutation = useMutation({
    mutationFn: (postId: string) => communityApi.votePost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-posts', courseId] }),
  });

  const posts: any[] = data?.data?.posts ?? [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cộng đồng</h1>
          <p className="text-sm text-gray-500">{total} bài đăng</p>
        </div>
        {user && (
          <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            + Đăng bài
          </button>
        )}
      </div>

      {/* New post form */}
      {showForm && (
        <div className="border rounded-xl p-4 space-y-3 bg-white">
          <h2 className="font-medium">Bài đăng mới</h2>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Tiêu đề..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Nội dung..."
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <div className="flex items-center gap-4">
            {(['question', 'discussion', ...(user?.role !== 'student' ? ['announcement'] : [])] as string[]).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="postType" value={t} checked={form.type === t} onChange={() => setForm((f) => ({ ...f, type: t }))} />
                {TYPE_LABELS[t]}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.title.trim() || !form.body.trim() || createMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              Đăng
            </button>
            <button onClick={() => setShowForm(false)} className="border px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Hủy</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="newest">Mới nhất</option>
          <option value="upvotes">Nhiều vote nhất</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Tất cả</option>
          <option value="question">Hỏi đáp</option>
          <option value="discussion">Thảo luận</option>
          <option value="announcement">Thông báo</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {posts.length === 0 && <p className="text-center py-10 text-gray-400">Chưa có bài đăng nào</p>}
          {posts.map((post: any) => (
            <div key={post.id} className={`bg-white border rounded-xl p-4 space-y-2 ${post.isPinned ? 'border-orange-200 bg-orange-50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {post.isPinned && <span className="text-xs text-orange-600 font-medium">📌 Ghim</span>}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[post.type]}`}>{TYPE_LABELS[post.type]}</span>
                  </div>
                  <Link href={`/community/${post.id}`} className="font-medium text-gray-900 hover:text-blue-600 line-clamp-2">
                    {post.title}
                  </Link>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{post.body}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>{post.author?.fullName}</span>
                <span>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</span>
                <button onClick={() => voteMutation.mutate(post.id)} className="flex items-center gap-1 hover:text-orange-500">
                  ▲ {post.upvotes}
                </button>
                <span>💬 {post._count?.comments ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">← Trước</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Sau →</button>
        </div>
      )}
    </div>
  );
}
