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
  question: 'bg-sky-soft text-sky-deep',
  discussion: 'bg-leaf-soft text-leaf-deep',
  announcement: 'bg-sun-soft text-sun-deep',
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
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-deep">Cộng đồng</h1>
          <p className="text-sm text-ink-subtle mt-0.5">{total} bài đăng</p>
        </div>
        {user && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-sky text-white px-5 h-12 rounded-2xl text-base font-semibold hover:bg-sky-deep transition-colors"
          >
            + Đăng bài
          </button>
        )}
      </div>

      {/* New post form */}
      {showForm && (
        <div className="border border-outline rounded-[20px] p-5 space-y-3 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <h2 className="font-semibold text-ink-deep">Bài đăng mới</h2>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Tiêu đề..."
            className="w-full border border-outline rounded-xl px-3.5 py-2.5 text-base focus:border-sky focus:ring-4 focus:ring-sky-soft outline-none transition"
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Nội dung..."
            rows={4}
            className="w-full border border-outline rounded-xl px-3.5 py-2.5 text-base resize-none focus:border-sky focus:ring-4 focus:ring-sky-soft outline-none transition"
          />
          <div className="flex items-center gap-4">
            {(['question', 'discussion', ...(user?.role !== 'student' ? ['announcement'] : [])] as string[]).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer text-ink-mute">
                <input type="radio" name="postType" value={t} checked={form.type === t} onChange={() => setForm((f) => ({ ...f, type: t }))} className="accent-sky" />
                {TYPE_LABELS[t]}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.title.trim() || !form.body.trim() || createMutation.isPending}
              className="bg-sky text-white px-5 h-11 rounded-2xl text-sm font-semibold hover:bg-sky-deep disabled:opacity-50 transition-colors"
            >
              Đăng
            </button>
            <button onClick={() => setShowForm(false)} className="border border-outline px-5 h-11 rounded-2xl text-sm hover:bg-skylearn-sunken text-ink-mute transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="border border-outline rounded-xl px-3 py-2 text-sm bg-white focus:border-sky outline-none">
          <option value="newest">Mới nhất</option>
          <option value="upvotes">Nhiều vote nhất</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="border border-outline rounded-xl px-3 py-2 text-sm bg-white focus:border-sky outline-none">
          <option value="">Tất cả</option>
          <option value="question">Hỏi đáp</option>
          <option value="discussion">Thảo luận</option>
          <option value="announcement">Thông báo</option>
        </select>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {posts.length === 0 && (
            <p className="text-center py-12 text-ink-subtle">Chưa có bài đăng nào — hãy là người mở đầu cuộc trò chuyện!</p>
          )}
          {posts.map((post: any) => (
            <div
              key={post.id}
              className={`bg-white border rounded-[20px] p-5 space-y-2.5 transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] ${post.isPinned ? 'border-sun bg-sun-soft/40' : 'border-outline'}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {post.isPinned && <span className="text-xs text-sun-deep font-semibold">📌 Ghim</span>}
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[post.type]}`}>{TYPE_LABELS[post.type]}</span>
                  </div>
                  <Link href={`/community/${post.id}`} className="font-semibold text-ink-deep hover:text-sky line-clamp-2 transition-colors">
                    {post.title}
                  </Link>
                  <p className="text-sm text-ink-mute mt-1 line-clamp-2">{post.body}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-subtle">
                <span>{post.author?.fullName}</span>
                <span>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</span>
                <button onClick={() => voteMutation.mutate(post.id)} className="flex items-center gap-1 hover:text-sky font-medium transition-colors">
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
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-2 text-sm border border-outline rounded-xl disabled:opacity-40 hover:bg-skylearn-sunken transition-colors">← Trước</button>
          <span className="text-sm text-ink-mute">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 text-sm border border-outline rounded-xl disabled:opacity-40 hover:bg-skylearn-sunken transition-colors">Sau →</button>
        </div>
      )}
    </div>
  );
}
