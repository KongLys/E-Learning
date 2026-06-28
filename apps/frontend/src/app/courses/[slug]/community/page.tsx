'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communityApi } from '@/lib/api/community.api';
import { courseApi } from '@/lib/api/course.api';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChevronLeft, ChevronRight, ChevronUp, Image as ImageIcon, MessageSquare, Pin, X } from 'lucide-react';

interface CommunityPostMedia {
  url?: string;
  type?: string;
}
interface CommunityPost {
  id: string;
  title: string;
  body: string;
  type?: string;
  author?: { fullName?: string } | null;
  createdAt: string;
  isPinned?: boolean;
  upvotes?: number;
  media?: CommunityPostMedia[];
  _count?: { comments?: number };
}

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
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [sort, setSort] = useState('newest');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', type: 'question' });
  const [files, setFiles] = useState<File[]>([]);

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
    mutationFn: async () => {
      const media = files.length
        ? await Promise.all(files.map((f) => communityApi.uploadMedia(f)))
        : undefined;
      return communityApi.createPost(courseId!, { ...form, media });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community-posts', courseId] });
      setShowForm(false);
      setForm({ title: '', body: '', type: 'question' });
      setFiles([]);
    },
  });

  const voteMutation = useMutation({
    mutationFn: (postId: string) => communityApi.votePost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-posts', courseId] }),
  });

  const posts: CommunityPost[] = data?.data?.posts ?? [];
  const total: number = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
          {/* Media picker + preview */}
          {files.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {files.map((file, i) => {
                const src = URL.createObjectURL(file);
                const isVideo = file.type.startsWith('video/');
                return (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-outline bg-skylearn-sunken aspect-square">
                    {isVideo ? (
                      <video src={src} className="w-full h-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setFiles((fs) => fs.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ink-deep/70 text-white flex items-center justify-center hover:bg-ink-deep"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-4 flex-wrap">
            {(['question', 'discussion', ...(user?.role !== 'student' ? ['announcement'] : [])] as string[]).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer text-ink-mute">
                <input type="radio" name="postType" value={t} checked={form.type === t} onChange={() => setForm((f) => ({ ...f, type: t }))} className="accent-sky" />
                {TYPE_LABELS[t]}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm cursor-pointer text-sky font-medium ml-auto hover:text-sky-deep">
              <ImageIcon size={16} /> Ảnh/Video
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles((fs) => [...fs, ...picked].slice(0, 10));
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.title.trim() || !form.body.trim() || createMutation.isPending}
              className="bg-sky text-white px-5 h-11 rounded-2xl text-sm font-semibold hover:bg-sky-deep disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Đang đăng...' : 'Đăng'}
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
          {posts.map((post) => (
            <div
              key={post.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/community/${post.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/community/${post.id}`); }}
              className={`bg-white border rounded-[20px] p-5 space-y-2.5 cursor-pointer transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] ${post.isPinned ? 'border-sun bg-sun-soft/40' : 'border-outline'}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {post.isPinned && <span className="inline-flex items-center gap-1 text-xs text-sun-deep font-semibold"><Pin size={12} /> Ghim</span>}
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_COLORS[post.type ?? '']}`}>{TYPE_LABELS[post.type ?? '']}</span>
                  </div>
                  <h3 className="font-semibold text-ink-deep line-clamp-2">{post.title}</h3>
                  <p className="text-sm text-ink-mute mt-1 line-clamp-2">{post.body}</p>
                  {Array.isArray(post.media) && post.media.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-outline bg-skylearn-sunken">
                        {post.media[0].type === 'video' ? (
                          <video src={post.media[0].url} className="w-full h-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.media[0].url} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      {post.media.length > 1 && (
                        <span className="text-xs text-ink-subtle">+{post.media.length - 1} mục khác</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-subtle">
                <span>{post.author?.fullName}</span>
                <span>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); voteMutation.mutate(post.id); }}
                  className="flex items-center gap-1 hover:text-sky font-medium transition-colors"
                >
                  <ChevronUp size={14} /> {post.upvotes}
                </button>
                <span className="flex items-center gap-1 hover:text-sky transition-colors"><MessageSquare size={14} /> {post._count?.comments ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 px-4 py-2 text-sm border border-outline rounded-xl disabled:opacity-40 hover:bg-skylearn-sunken transition-colors"><ChevronLeft size={14} /> Trước</button>
          <span className="text-sm text-ink-mute">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 px-4 py-2 text-sm border border-outline rounded-xl disabled:opacity-40 hover:bg-skylearn-sunken transition-colors">Sau <ChevronRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
