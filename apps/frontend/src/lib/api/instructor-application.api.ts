import { apiClient } from './axios';

export interface CredentialFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface ApplyInstructorInput {
  expertise: string;
  experience: string;
  qualifications?: string;
  motivation: string;
  files?: File[];
}

export type InstructorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface InstructorApplication {
  id: string;
  userId: string;
  status: InstructorApplicationStatus;
  expertise: string;
  experience: string;
  qualifications: string | null;
  credentialFiles: CredentialFile[];
  motivation: string;
  rejectReason: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const instructorApplicationApi = {
  apply: (input: ApplyInstructorInput) => {
    const fd = new FormData();
    fd.append('expertise', input.expertise);
    fd.append('experience', input.experience);
    if (input.qualifications) fd.append('qualifications', input.qualifications);
    fd.append('motivation', input.motivation);
    (input.files ?? []).forEach((file) => fd.append('files', file));
    return apiClient.post<InstructorApplication>(
      '/instructor-applications',
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
  getMine: () =>
    apiClient.get<InstructorApplication | null>('/instructor-applications/me'),
};
