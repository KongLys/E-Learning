import { apiClient } from './axios';

export interface ApplyInstructorDto {
  expertise: string;
  experience: string;
  motivation: string;
}

export type InstructorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface InstructorApplication {
  id: string;
  userId: string;
  status: InstructorApplicationStatus;
  expertise: string;
  experience: string;
  motivation: string;
  rejectReason: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const instructorApplicationApi = {
  apply: (dto: ApplyInstructorDto) =>
    apiClient.post<InstructorApplication>('/instructor-applications', dto),
  getMine: () =>
    apiClient.get<InstructorApplication | null>('/instructor-applications/me'),
};
