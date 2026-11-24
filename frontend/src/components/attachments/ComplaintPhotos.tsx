import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ImageOff, ImagePlus, Link2, LoaderCircle, X } from 'lucide-react';
import {
  ACCEPTED_PHOTO_TYPES,
  attachmentsApi,
  formatBytes,
  type Attachment,
  type CreatedUploadLink,
} from '../../api/attachments';

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const sourceLabels: Record<Attachment['source'], string> = {
  dashboard: 'Staff upload',
  upload_link: 'Citizen link',
  whatsapp: 'WhatsApp',
};
const linkStatusLabels = {
  active: 'Active',
  expired: 'Expired',
  revoked: 'Revoked',
  used: 'Upload limit reached',
} as const;

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Loads a protected photo with the user's session and exposes it as an object URL. */
function useProtectedImage(attachmentId: number) {
  const query = useQuery({
    queryKey: ['attachment-blob', attachmentId],
    queryFn: () => attachmentsApi.download(attachmentId),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  return { url, isLoading: query.isLoading, isError: query.isError };
}

function PhotoThumb({ attachment, onOpen }: { attachment: Attachment; onOpen: () => void }) {
  const image = useProtectedImage(attachment.id);
  return (
    <button
      type="button"
      className="photo-thumb"
      onClick={onOpen}
      aria-label={`Open photo ${attachment.originalFilename}`}
    >
      {image.url ? (
        <img src={image.url} alt="" />
      ) : image.isError ? (
        <ImageOff size={20} />
      ) : (
        <LoaderCircle size={18} className="spin-icon" />
      )}
      <span className="photo-source">{sourceLabels[attachment.source]}</span>
    </button>
  );
}

function PhotoViewer({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const image = useProtectedImage(attachment.id);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal photo-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Photo preview"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">{sourceLabels[attachment.source].toUpperCase()}</span>
            <h2>{attachment.originalFilename}</h2>
            <p>
              {attachment.uploader?.name ?? 'Citizen'} ·{' '}
              {dateTime.format(new Date(attachment.createdAt))} · {formatBytes(attachment.fileSize)}
            </p>
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Close preview"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="photo-viewer-body">
          {image.url ? (
            <img src={image.url} alt={`Complaint photo ${attachment.originalFilename}`} />
          ) : image.isError ? (
            <p className="form-error">The photo could not be loaded.</p>
          ) : (
            <LoaderCircle size={22} className="spin-icon" />
          )}
        </div>
      </section>
    </div>
  );
}

export function ComplaintPhotos({
  complaintId,
  canUpload,
}: {
  complaintId: number;
  canUpload: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [newLink, setNewLink] = useState<CreatedUploadLink | null>(null);
  const [copied, setCopied] = useState(false);

  const photos = useQuery({
    queryKey: ['attachments', complaintId],
    queryFn: () => attachmentsApi.list(complaintId),
  });
  const links = useQuery({
    queryKey: ['upload-links', complaintId],
    queryFn: () => attachmentsApi.links(complaintId),
    enabled: canUpload,
  });
  const createLink = useMutation({
    mutationFn: () => attachmentsApi.createLink(complaintId),
    onSuccess: (result) => {
      setNewLink(result.data);
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: ['upload-links', complaintId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (linkId: number) => attachmentsApi.revokeLink(linkId),
    onSuccess: (result) => {
      if (newLink?.id === result.data.id) setNewLink(null);
      void queryClient.invalidateQueries({ queryKey: ['upload-links', complaintId] });
    },
  });

  // Photos upload one at a time so each gets its own validation result.
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    const errors: string[] = [];
    setUploadErrors([]);
    setProgress({ done: 0, total: list.length });
    for (const [index, file] of list.entries()) {
      try {
        await attachmentsApi.upload(complaintId, file);
      } catch (caught) {
        errors.push(`${file.name}: ${errorText(caught, 'Upload failed.')}`);
      }
      setProgress({ done: index + 1, total: list.length });
    }
    setProgress(null);
    setUploadErrors(errors);
    if (inputRef.current) inputRef.current.value = '';
    void queryClient.invalidateQueries({ queryKey: ['attachments', complaintId] });
  };

  const copyLink = async () => {
    if (!newLink) return;
    try {
      await navigator.clipboard.writeText(newLink.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const items = photos.data?.data ?? [];
  const activeLinks = (links.data?.data ?? []).filter((link) => link.status === 'active');
  const pastLinks = (links.data?.data ?? []).filter((link) => link.status !== 'active');

  return (
    <section className="complaint-detail-card" aria-labelledby="photos-heading">
      <div className="detail-card-heading">
        <div>
          <span className="eyebrow">ATTACHMENTS</span>
          <h2 id="photos-heading">Photos {items.length ? `(${items.length})` : ''}</h2>
        </div>
        {canUpload && (
          <div className="photo-actions">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_PHOTO_TYPES}
              multiple
              hidden
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <button
              className="secondary-button"
              disabled={!!progress}
              onClick={() => inputRef.current?.click()}
            >
              {progress ? (
                <LoaderCircle size={14} className="spin-icon" />
              ) : (
                <ImagePlus size={14} />
              )}
              {progress ? `Uploading ${progress.done}/${progress.total}…` : 'Upload photos'}
            </button>
            <button
              className="secondary-button"
              disabled={createLink.isPending}
              onClick={() => createLink.mutate()}
            >
              <Link2 size={14} /> Citizen upload link
            </button>
          </div>
        )}
      </div>
      {uploadErrors.length > 0 && (
        <div className="form-error" role="alert">
          {uploadErrors.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
      {photos.isLoading && <p className="studio-muted">Loading photos…</p>}
      {photos.isError && (
        <div className="form-error" role="alert">
          {errorText(photos.error, 'Could not load photos.')}
        </div>
      )}
      {photos.data && !items.length && (
        <p className="studio-muted photo-empty">
          No photos yet.
          {canUpload ? ' Upload JPG, PNG or WebP photos, or create a citizen upload link.' : ''}
        </p>
      )}
      {items.length > 0 && (
        <div className="photo-grid">
          {items.map((attachment) => (
            <PhotoThumb
              key={attachment.id}
              attachment={attachment}
              onOpen={() => setViewing(attachment)}
            />
          ))}
        </div>
      )}
      {createLink.isError && (
        <div className="form-error" role="alert">
          {errorText(createLink.error, 'Could not create the upload link.')}
        </div>
      )}
      {newLink && (
        <div className="upload-link-created" role="status">
          <strong>Upload link created</strong>
          <p>
            Copy it now; it will not be shown again. Valid until{' '}
            {dateTime.format(new Date(newLink.expiresAt))} for up to {newLink.maxUploads} photos.
          </p>
          <div className="upload-link-row">
            <input
              readOnly
              value={newLink.url}
              aria-label="Citizen upload link"
              onFocus={(e) => e.target.select()}
            />
            <button className="secondary-button" onClick={() => void copyLink()}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <small>
            Simulation: this link is not sent to the citizen automatically. Share it manually for
            testing.
          </small>
        </div>
      )}
      {canUpload && (activeLinks.length > 0 || pastLinks.length > 0) && (
        <div className="upload-links">
          <h3>Citizen upload links</h3>
          <ul>
            {[...activeLinks, ...pastLinks].slice(0, 6).map((link) => (
              <li key={link.id}>
                <span
                  className={`session-badge ${link.status === 'active' ? 'success' : 'neutral'}`}
                >
                  {linkStatusLabels[link.status]}
                </span>
                <span>
                  {link.uploadCount}/{link.maxUploads} photos · expires{' '}
                  {dateTime.format(new Date(link.expiresAt))}
                </span>
                {link.status === 'active' && (
                  <button
                    className="text-link"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(link.id)}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {viewing && <PhotoViewer attachment={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
