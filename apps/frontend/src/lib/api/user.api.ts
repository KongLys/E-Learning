import { apiClient } from './axios';

export interface UpdateMeDto {
  fullName?: string;
  phone?: string;
  bio?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export const userApi = {
  getMe: () => apiClient.get('/users/me'),
  updateMe: (dto: UpdateMeDto) => apiClient.patch('/users/me', dto),
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post('/users/me/avatar', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  changePassword: (dto: ChangePasswordDto) => apiClient.patch('/users/me/password', dto),
};
