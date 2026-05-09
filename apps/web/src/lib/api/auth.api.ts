import { apiClient } from './axios';

export interface LoginDto { email: string; password: string }
export interface RegisterDto { email: string; password: string; fullName: string; role?: string }

export const authApi = {
  login: (dto: LoginDto) => apiClient.post('/auth/login', dto),
  register: (dto: RegisterDto) => apiClient.post('/auth/register', dto),
  refresh: (refreshToken: string) => apiClient.post('/auth/refresh', { refreshToken }),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
};
