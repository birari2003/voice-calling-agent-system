import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CircleCheck,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { ACCEPTED_PHOTO_TYPES, publicUploadApi } from '../api/attachments';

/**
 * Citizen photo upload page reached from a link. It needs no account; the link only allows
 * adding a few photos to one complaint and shows no personal data.
 */
export function PublicUploadPage() {
  const { token = '' } = useParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const info = useQuery({
    queryKey: ['public-upload', token],
    queryFn: () => publicUploadApi.info(token),
    retry: false,
  });

  const left = remaining ?? info.data?.remainingUploads ?? 0;

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    setUploading(true);
    for (const file of Array.from(files).slice(0, left)) {
      try {
        const result = await publicUploadApi.upload(token, file);
        setRemaining(result.remainingUploads);
        setUploaded((count) => count + 1);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The photo could not be uploaded.');
        break;
      }
    }
    if (files.length > left) setError(`Only ${left} more photo(s) can be added with this link.`);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <main className="public-upload">
      <header className="public-upload-brand">
        <span className="brand-mark">
          <Building2 size={20} />
        </span>
        <span>
          NagarSeva
          <small>Municipal complaint service</small>
        </span>
      </header>
      <section className="public-upload-card">
        {info.isLoading && (
          <p className="public-upload-state">
            <LoaderCircle size={18} className="spin-icon" /> Checking your link…
          </p>
        )}
        {info.isError && (
          <div className="public-upload-state error" role="alert">
            <TriangleAlert size={22} />
            <h1>Link not available</h1>
            <p>
              {info.error instanceof Error
                ? info.error.message
                : 'This upload link has expired or is no longer valid.'}
            </p>
          </div>
        )}
        {info.data && (
          <>
            <h1>Add photos to your complaint</h1>
            <p className="public-upload-ticket">
              Ticket <strong>{info.data.ticketId}</strong>
            </p>
            <p>
              Photos help municipal staff find and fix the problem. You can add{' '}
              <strong>{left}</strong> more photo{left === 1 ? '' : 's'} (JPG, PNG or WebP, up to{' '}
              {info.data.maxFileSizeMb} MB each).
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_PHOTO_TYPES}
              multiple
              hidden
              onChange={(event) => void upload(event.target.files)}
            />
            <button
              className="primary-button public-upload-button"
              disabled={uploading || left <= 0}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <LoaderCircle size={18} className="spin-icon" />
              ) : (
                <ImagePlus size={18} />
              )}
              {uploading
                ? 'Uploading…'
                : left > 0
                  ? 'Choose or take photos'
                  : 'Upload limit reached'}
            </button>
            {uploaded > 0 && (
              <p className="public-upload-success" role="status">
                <CircleCheck size={17} /> {uploaded} photo{uploaded === 1 ? '' : 's'} received.
                Thank you.
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="public-upload-note">
              <ShieldCheck size={15} /> Photos are only visible to authorized municipal staff. This
              link expires on{' '}
              {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(info.data.expiresAt),
              )}
              .
            </p>
          </>
        )}
      </section>
    </main>
  );
}
