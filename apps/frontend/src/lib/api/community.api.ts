import { apiClient } from './axios';

export interface PostMedia {
  url: string;
  type: 'image' | 'video';
}

export const communityApi = {
  listPosts: (courseId: string, params?: { type?: string; sort?: string; page?: number }) =>
    apiClient.get(`/courses/${courseId}/posts`, { params }),

  createPost: (
    courseId: string,
    data: { title: string; body: string; type: string; media?: PostMedia[] },
  ) => apiClient.post(`/courses/${courseId}/posts`, data),

  uploadMedia: (file: File, onProgress?: (pct: number) => void): Promise<PostMedia> => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient
      .post('/community/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((res) => res.data);
  },

  getPost: (postId: string) => apiClient.get(`/posts/${postId}`),

  updatePost: (postId: string, body: string) => apiClient.patch(`/posts/${postId}`, { body }),

  deletePost: (postId: string) => apiClient.delete(`/posts/${postId}`),

  pinPost: (postId: string) => apiClient.patch(`/posts/${postId}/pin`),

  hidePost: (postId: string) => apiClient.patch(`/posts/${postId}/hide`),

  votePost: (postId: string) => apiClient.post(`/posts/${postId}/vote`),

  addComment: (postId: string, data: { body: string; parentId?: string }) =>
    apiClient.post(`/posts/${postId}/comments`, data),

  updateComment: (commentId: string, body: string) => apiClient.patch(`/comments/${commentId}`, { body }),

  deleteComment: (commentId: string) => apiClient.delete(`/comments/${commentId}`),

  markSolution: (commentId: string) => apiClient.post(`/comments/${commentId}/solution`),

  voteComment: (commentId: string) => apiClient.post(`/comments/${commentId}/vote`),
};
