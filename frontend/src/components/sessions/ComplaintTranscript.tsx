import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, MessagesSquare } from 'lucide-react';
import { apiRequest } from '../../api/client';
import type { SessionMessage } from '../../api/sessions';
import { TranscriptView } from './SessionParts';

/**
 * Transcript of the session that created a complaint, loaded through the complaint so anyone
 * who can open the ticket (including an assigned operator) can read it.
 */
export function ComplaintTranscript({ complaintId }: { complaintId: number }) {
  const [open, setOpen] = useState(false);
  const transcript = useQuery({
    queryKey: ['complaint-transcript', complaintId],
    queryFn: () =>
      apiRequest<{ data: { messages: SessionMessage[]; hasRecording: boolean } }>(
        `/complaints/${complaintId}/transcript`,
      ),
    enabled: open,
  });
  return (
    <details
      className="complaint-transcript"
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary>
        <MessagesSquare size={14} /> Conversation transcript
      </summary>
      {transcript.isLoading && (
        <p className="studio-muted">
          <LoaderCircle size={14} className="spin-icon" /> Loading transcript…
        </p>
      )}
      {transcript.isError && (
        <p className="form-error" role="alert">
          {transcript.error instanceof Error
            ? transcript.error.message
            : 'Could not load the transcript.'}
        </p>
      )}
      {transcript.data && (
        <>
          <TranscriptView messages={transcript.data.data.messages} />
          <p className="studio-muted">
            Simulated session. No audio recording exists for this conversation.
          </p>
        </>
      )}
    </details>
  );
}
