'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communityApi } from '@/lib/api/community.api';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

/** Một comment hoặc reply — hỗ trợ sửa, upvote, xóa, đánh dấu giải pháp (chỉ top-level). */
function CommentItem({
  comment, postAuthorId, isReply = false, onDelete, onSolution, onReply,
}: {
  comment: any;
  postAuthorId: string;
  isReply?: boolean;
  onDelete: (id: string) => void;
  onSolution?: (id: string) => void;
  onReply?: (parentId: string) => void;
}) {
  const { user } = useAuthStore();
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () => communityApi.updateComment(comment.id, editBody),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['community-post', comment.postId] }); setEditMode(false); },
  });
  const voteMutation = useMutation({
    mutationFn: () => communityApi.voteComment(comment.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-post', comment.postId] }),
  });

  const canEdit = user && comment.authorId === user.id;
  const canDelete = user && (comment.authorId === user.id || user.role === 'admin' || user.role === 'instructor');

  return (
    <div className={`border rounded-[20px] p-4 space-y-2 ${comment.isSolution ? 'border-leaf bg-leaf-soft' : 'border-outline bg-white'}`}>
      {comment.isSolution && <span className="text-xs text-leaf-deep font-semibold">✓ Giải pháp</span>}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {editMode ? (
            <div className="space-y-2">
              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} className="w-full border border-outline rounded-xl px-3 py-2 text-base resize-none focus:border-sky focus:ring-4 focus:ring-sky-soft outline-none transition" />
              <div className="flex gap-2">
                <button onClick={() => updateMutation.mutate()} className="text-sm bg-sky text-white px-3 py-1.5 rounded-xl font-medium hover:bg-sky-deep transition-colors">Lưu</button>
                <button onClick={() => setEditMode(false)} className="text-sm border border-outline px-3 py-1.5 rounded-xl text-ink-mute hover:bg-skylearn-sunken transition-colors">Hủy</button>
              </div>
            </div>
          ) : (
            <p className="text-base text-ink-deep whitespace-pre-wrap">{comment.body}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-ink-subtle">
            <span>{comment.author?.fullName}</span>
            <span>{new Date(comment.createdAt).toLocaleDateString('vi-VN')}</span>
            <button onClick={() => voteMutation.mutate()} className="flex items-center gap-1 hover:text-sky font-medium transition-colors">
              ▲ {comment.upvotes ?? 0}
            </button>
            {user && !isReply && onReply && (
              <button onClick={() => onReply(comment.id)} className="hover:text-sky transition-colors">Trả lời</button>
            )}
            {canEdit && (
              <button onClick={() => setEditMode(true)} className="hover:text-sky transition-colors">Sửa</button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(comment.id)} className="hover:text-coral transition-colors">Xóa</button>
            )}
            {user && user.id === postAuthorId && !isReply && onSolution && (
              <button onClick={() => onSolution(comment.id)} className={`font-semibold transition-colors ${comment.isSolution ? 'text-leaf-deep' : 'hover:text-leaf-deep'}`}>
                {comment.isSolution ? '✓ Bỏ giải pháp' : 'Đánh dấu giải pháp'}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Replies */}
      {comment.replies?.length > 0 && (
        <div className="ml-6 mt-3 space-y-2 border-l-2 border-outline pl-4">
          {comment.replies.map((reply: any) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postAuthorId={postAuthorId}
              isReply
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommunityPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const router = useRouter();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [editPost, setEditPost] = useState(false);
  const [postBody, setPostBody] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['community-post', postId],
    queryFn: () => communityApi.getPost(postId),
  });

  const addCommentMutation = useMutation({
    mutationFn: () => communityApi.addComment(postId, { body: commentBody, parentId: replyTo ?? undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['community-post', postId] }); setCommentBody(''); setReplyTo(null); },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => communityApi.deleteComment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-post', postId] }),
  });

  const solutionMutation = useMutation({
    mutationFn: (id: string) => communityApi.markSolution(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-post', postId] }),
  });

  const voteMutation = useMutation({
    mutationFn: () => communityApi.votePost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-post', postId] }),
  });

  const updatePostMutation = useMutation({
    mutationFn: () => communityApi.updatePost(postId, postBody),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['community-post', postId] }); setEditPost(false); },
  });

  const pinMutation = useMutation({
    mutationFn: () => communityApi.pinPost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-post', postId] }),
  });

  const hideMutation = useMutation({
    mutationFn: () => communityApi.hidePost(postId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community-post', postId] }),
  });

  const post = data?.data;

  const deletePostMutation = useMutation({
    mutationFn: () => communityApi.deletePost(postId),
    onSuccess: () => router.push(post?.course?.slug ? `/courses/${post.course.slug}/community` : '/'),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!post) return <div className="p-8 text-center text-ink-subtle">Bài viết không tồn tại</div>;

  const comments: any[] = post.comments ?? [];
  const replyTarget = replyTo ? comments.find((c: any) => c.id === replyTo) : null;

  const isAuthor = user && user.id === post.authorId;
  const isAdmin = user?.role === 'admin';
  const isCourseInstructor = user && post.course?.instructorId === user.id;
  const canEditPost = isAuthor || isAdmin;
  const canDeletePost = isAuthor || isAdmin || isCourseInstructor;
  const canModerate = isAdmin || isCourseInstructor;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <Link href={`/courses/${post.course?.slug}/community`} className="text-sm text-ink-subtle hover:text-ink-mute transition-colors">← Quay lại cộng đồng</Link>

      {/* Post */}
      <div className={`bg-white border rounded-[20px] p-6 space-y-4 ${post.isPinned ? 'border-sun' : 'border-outline'}`}>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            {post.isPinned && <span className="text-xs text-sun-deep font-semibold">📌 Đã ghim</span>}
            <h1 className="text-2xl font-bold text-ink-deep">{post.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-ink-subtle">
              <span>{post.author?.fullName}</span>
              <span>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
          <button onClick={() => voteMutation.mutate()} className="flex flex-col items-center gap-0.5 text-ink-subtle hover:text-sky p-2 rounded-xl hover:bg-sky-soft transition-colors">
            <span className="text-lg leading-none">▲</span>
            <span className="text-xs font-semibold">{post.upvotes}</span>
          </button>
        </div>

        {editPost ? (
          <div className="space-y-2">
            <textarea value={postBody} onChange={(e) => setPostBody(e.target.value)} rows={5} className="w-full border border-outline rounded-xl px-3.5 py-2.5 text-base resize-none focus:border-sky focus:ring-4 focus:ring-sky-soft outline-none transition" />
            <div className="flex gap-2">
              <button onClick={() => updatePostMutation.mutate()} disabled={!postBody.trim() || updatePostMutation.isPending} className="bg-sky text-white px-4 h-10 rounded-xl text-sm font-semibold hover:bg-sky-deep disabled:opacity-50 transition-colors">Lưu</button>
              <button onClick={() => setEditPost(false)} className="border border-outline px-4 h-10 rounded-xl text-sm text-ink-mute hover:bg-skylearn-sunken transition-colors">Hủy</button>
            </div>
          </div>
        ) : (
          <p className="text-base text-ink-deep whitespace-pre-wrap">{post.body}</p>
        )}

        {/* Quản lý bài đăng */}
        {user && (canEditPost || canDeletePost || canModerate) && !editPost && (
          <div className="flex items-center gap-3 pt-2 border-t border-outline text-sm">
            {canEditPost && (
              <button onClick={() => { setPostBody(post.body); setEditPost(true); }} className="text-ink-mute hover:text-sky transition-colors">Sửa bài</button>
            )}
            {canModerate && (
              <button onClick={() => pinMutation.mutate()} className="text-ink-mute hover:text-sun-deep transition-colors">
                {post.isPinned ? 'Bỏ ghim' : 'Ghim'}
              </button>
            )}
            {canModerate && (
              <button onClick={() => hideMutation.mutate()} className="text-ink-mute hover:text-sun-deep transition-colors">
                {post.status === 'hidden' ? 'Hiện bài' : 'Ẩn bài'}
              </button>
            )}
            {canDeletePost && (
              <button
                onClick={() => { if (confirm('Xóa bài đăng này?')) deletePostMutation.mutate(); }}
                className="text-ink-mute hover:text-coral transition-colors ml-auto"
              >
                Xóa bài
              </button>
            )}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="space-y-3">
        <h2 className="font-semibold text-ink-deep">{comments.length} bình luận</h2>
        {comments.map((comment: any) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            postAuthorId={post.authorId}
            onDelete={(id) => deleteCommentMutation.mutate(id)}
            onSolution={(id) => solutionMutation.mutate(id)}
            onReply={(parentId) => setReplyTo(parentId)}
          />
        ))}
      </div>

      {/* Add comment */}
      {user && (
        <div className="bg-white border border-outline rounded-[20px] p-4 space-y-3">
          {replyTarget && (
            <div className="flex items-center gap-2 text-sm text-sky-deep bg-sky-soft rounded-xl px-3 py-2">
              <span>Trả lời: <strong>{replyTarget.author?.fullName}</strong></span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-ink-subtle hover:text-ink-mute">✕</button>
            </div>
          )}
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder={replyTo ? 'Nội dung trả lời...' : 'Viết bình luận...'}
            rows={3}
            className="w-full border border-outline rounded-xl px-3.5 py-2.5 text-base resize-none focus:border-sky focus:ring-4 focus:ring-sky-soft outline-none transition"
          />
          <button
            onClick={() => addCommentMutation.mutate()}
            disabled={!commentBody.trim() || addCommentMutation.isPending}
            className="bg-sky text-white px-5 h-11 rounded-2xl text-sm font-semibold disabled:opacity-50 hover:bg-sky-deep transition-colors"
          >
            {addCommentMutation.isPending ? 'Đang gửi...' : 'Gửi'}
          </button>
        </div>
      )}
    </div>
  );
}
