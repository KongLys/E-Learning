import { apiClient } from './axios';

export const communityApi = {
  listPosts: (courseId: string, params?: { type?: string; sort?: string; page?: number }) =>
    apiClient.get(`/courses/${courseId}/posts`, { params }),

  createPost: (courseId: string, data: { title: string; body: string; type: string }) =>
    apiClient.post(`/courses/${courseId}/posts`, data),

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
