'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communityApi } from '@/lib/api/community.api';
import { useAuthStore } from '@/store/auth.store';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import Link from 'next/link';

function CommentItem({
  comment, postAuthorId, onDelete, onSolution, onReply
}: {
  comment: any;
  postAuthorId: string;
  onDelete: (id: string) => void;
  onSolution: (id: string) => void;
  onReply: (parentId: string) => void;
}) {
  const { user } = useAuthStore();
  const [editMode, setEditMode] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: () => communityApi.updateComment(comment.id, editBody),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['community-post', comment.postId] }); setEditMode(false); },
  });

  return (
    <div className={`border rounded-xl p-4 space-y-2 ${comment.isSolution ? 'border-green-300 bg-green-50' : 'bg-white'}`}>
      {comment.isSolution && <span className="text-xs text-green-700 font-medium">✓ Giải pháp</span>}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {editMode ? (
            <div className="space-y-2">
              <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm resize-none" />
              <div className="flex gap-2">
                <button onClick={() => updateMutation.mutate()} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Lưu</button>
                <button onClick={() => setEditMode(false)} className="text-xs border px-2 py-1 rounded">Hủy</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{comment.body}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{comment.author?.fullName}</span>
            <span>{new Date(comment.createdAt).toLocaleDateString('vi-VN')}</span>
            {user && !comment.parentId && (
              <button onClick={() => onReply(comment.id)} className="hover:text-blue-500">Trả lời</button>
            )}
            {user && comment.authorId === user.id && (
              <button onClick={() => setEditMode(true)} className="hover:text-blue-500">Sửa</button>
            )}
            {user && (comment.authorId === user.id || user.role === 'admin' || user.role === 'instructor') && (
              <button onClick={() => onDelete(comment.id)} className="hover:text-red-500">Xóa</button>
            )}
            {user && user.id === postAuthorId && !comment.parentId && (
              <button onClick={() => onSolution(comment.id)} className={`font-medium ${comment.isSolution ? 'text-green-600' : 'hover:text-green-600'}`}>
                {comment.isSolution ? '✓ Bỏ giải pháp' : 'Đánh dấu giải pháp'}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Replies */}
      {comment.replies?.length > 0 && (
        <div className="ml-6 mt-3 space-y-2 border-l-2 border-gray-100 pl-4">
          {comment.replies.map((reply: any) => (
            <div key={reply.id} className="text-sm">
              <p className="text-gray-800">{reply.body}</p>
              <div className="flex gap-2 mt-1 text-xs text-gray-400">
                <span>{reply.author?.fullName}</span>
                {user && (reply.authorId === user.id || user.role === 'admin') && (
                  <button onClick={() => onDelete(reply.id)} className="hover:text-red-500">Xóa</button>
                )}
              </div>
            </div>
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
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');

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

  if (isLoading) return <LoadingSpinner />;
  const post = data?.data;
  if (!post) return <div className="p-8 text-center text-gray-500">Bài viết không tồn tại</div>;

  const comments: any[] = post.comments ?? [];
  const replyTarget = replyTo ? comments.find((c: any) => c.id === replyTo) : null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <Link href={`/courses/${post.course?.slug}/community`} className="text-sm text-gray-500 hover:text-gray-700">← Quay lại cộng đồng</Link>

      {/* Post */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{post.title}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span>{post.author?.fullName}</span>
              <span>{new Date(post.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
          <button onClick={() => voteMutation.mutate()} className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-orange-500 p-2 rounded-lg hover:bg-orange-50">
            <span className="text-lg leading-none">▲</span>
            <span className="text-xs font-medium">{post.upvotes}</span>
          </button>
        </div>
        <p className="text-gray-700 whitespace-pre-wrap">{post.body}</p>
      </div>

      {/* Comments */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">{comments.length} bình luận</h2>
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
        <div className="bg-white border rounded-xl p-4 space-y-3">
          {replyTarget && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded px-3 py-1.5">
              <span>Trả lời: <strong>{replyTarget.author?.fullName}</strong></span>
              <button onClick={() => setReplyTo(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
            </div>
          )}
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder={replyTo ? 'Nội dung trả lời...' : 'Viết bình luận...'}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
          />
          <button
            onClick={() => addCommentMutation.mutate()}
            disabled={!commentBody.trim() || addCommentMutation.isPending}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700"
          >
            {addCommentMutation.isPending ? 'Đang gửi...' : 'Gửi'}
          </button>
        </div>
      )}
    </div>
  );
}
