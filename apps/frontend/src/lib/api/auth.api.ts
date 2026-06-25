import { apiClient } from './axios';

export interface LoginDto { email: string; password: string }
export interface RegisterDto { email: string; password: string; fullName: string; role?: string }
export interface VerifyRegisterOtpDto { email: string; code: string }
export interface ResendRegisterOtpDto { email: string }

export const authApi = {
  login: (dto: LoginDto) => apiClient.post('/auth/login', dto),
  requestRegisterOtp: (dto: RegisterDto) =>
    apiClient.post('/auth/register/request-otp', dto),
  verifyRegisterOtp: (dto: VerifyRegisterOtpDto) =>
    apiClient.post('/auth/register/verify-otp', dto),
  resendRegisterOtp: (dto: ResendRegisterOtpDto) =>
    apiClient.post('/auth/register/resend-otp', dto),
  googleLogin: (idToken: string) => apiClient.post('/auth/google', { idToken }),
  refresh: (refreshToken: string) => apiClient.post('/auth/refresh', { refreshToken }),
  me: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
};
