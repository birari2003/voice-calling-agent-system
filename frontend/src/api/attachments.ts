import { ApiError, apiBlob, apiRequest } from './client';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';

export interface Attachment {
  id: number;
  complaintId: number;
  source: 'dashboard' | 'upload_link' | 'whatsapp';
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  createdAt: string;
  uploader: { id: number; name: string } | null;
}

export interface UploadLink {
  id: number;
  expiresAt: string;
  maxUploads: number;
  uploadCount: number;
  revokedAt: string | null;
  createdAt: string;
  status: 'active' | 'expired' | 'revoked' | 'used';
  creator?: { id: number; name: string } | null;
}

export interface CreatedUploadLink {
  id: number;
  url: string;
  expiresAt: string;
  maxUploads: number;
}

export interface PublicLinkInfo {
  ticketId: string;
  remainingUploads: number;
  expiresAt: string;
  maxFileSizeMb: number;
}

export const ACCEPTED_PHOTO_TYPES = 'image/jpeg,image/png,image/webp';

function photoForm(file: File): FormData {
  const form = new FormData();
  form.append('photo', file);
  return form;
}

export const attachmentsApi = {
  list: (complaintId: number) =>
    apiRequest<{ data: Attachment[] }>(`/complaints/${complaintId}/attachments`),
  upload: (complaintId: number, file: File) =>
    apiRequest<{ data: Attachment }>(`/complaints/${complaintId}/attachments`, {
      method: 'POST',
      body: photoForm(file),
    }),
  download: (attachmentId: number) => apiBlob(`/attachments/${attachmentId}/download`),
  links: (complaintId: number) =>
    apiRequest<{ data: UploadLink[] }>(`/complaints/${complaintId}/upload-links`),
  createLink: (complaintId: number) =>
    apiRequest<{ data: CreatedUploadLink }>(`/complaints/${complaintId}/upload-link`, {
      method: 'POST',
    }),
  revokeLink: (linkId: number) =>
    apiRequest<{ data: UploadLink }>(`/upload-links/${linkId}/revoke`, { method: 'POST' }),
};

/** Citizen-facing calls: no cookies or CSRF; the link token is the only credential. */
async function publicCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}/public/uploads/${path}`, {
    ...init,
    credentials: 'omit',
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !body.data)
    throw new ApiError(
      body.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      body.error?.code,
    );
  return body.data;
}

export const publicUploadApi = {
  info: (token: string) => publicCall<PublicLinkInfo>(encodeURIComponent(token)),
  upload: (token: string, file: File) =>
    publicCall<{ remainingUploads: number }>(encodeURIComponent(token), {
      method: 'POST',
      body: photoForm(file),
    }),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
