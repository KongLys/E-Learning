import { apiClient } from './axios';

export const chatApi = {
  createRoom: (instructorId: string, courseId: string) =>
    apiClient.post('/chat/rooms', { instructorId, courseId }).then(res => res.data),

  getRooms: () =>
    apiClient.get('/chat/rooms').then(res => res.data),

  getMessages: (roomId: string, cursor?: string, limit: number = 20) =>
    apiClient.get(`/chat/rooms/${roomId}/messages`, {
      params: { cursor, limit },
    }).then(res => res.data),

  sendMessage: (roomId: string, content: string, messageType: 'text' | 'image' = 'text') =>
    apiClient.post(`/chat/rooms/${roomId}/messages`, { content, messageType }).then(res => res.data),
};
