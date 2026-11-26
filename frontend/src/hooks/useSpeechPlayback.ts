import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionsApi } from '../api/sessions';

/** Plays assistant messages in order through ElevenLabs. */
export function useSpeechPlayback(sessionId: string) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const stop = useCallback(() => {
    generationRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  // On unmount, silence audio and let the playback loop exit. This does not bump the
  // generation, so React StrictMode's simulated unmount does not cancel a queued reply.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioRef.current?.pause();
    };
  }, []);

  /**
   * Speaks the given assistant message IDs in order. Resolves true only if every message
   * played to the end (false when stopped, interrupted, or on error).
   */
  const speak = useCallback(
    async (messageIds: number[]): Promise<boolean> => {
      if (!messageIds.length) return true;
      stop();
      const generation = generationRef.current;
      setSpeaking(true);
      setError('');
      try {
        type SpeechResult = { blob: Blob; error?: never } | { blob?: never; error: unknown };
        const load = (id: number): Promise<SpeechResult> =>
          sessionsApi.speech(sessionId, id).then(
            (blob) => ({ blob }),
            (error: unknown) => ({ error }),
          );

        // Use credentialed fetch so the protected endpoint always receives the dashboard session
        // cookie. Generate one next line while the current line plays to remove inter-line gaps.
        let pending = load(messageIds[0]!);
        for (let index = 0; index < messageIds.length; index += 1) {
          const result = await pending;
          if ('error' in result) {
            if (generation !== generationRef.current || !mountedRef.current) return false;
            setError(
              result.error instanceof Error
                ? result.error.message
                : 'Spoken replies are unavailable. Read the transcript instead.',
            );
            return false;
          }
          if (generation !== generationRef.current || !mountedRef.current) return false;
          const nextId = messageIds[index + 1];
          if (nextId !== undefined) pending = load(nextId);

          const url = URL.createObjectURL(result.blob);
          try {
            const audio = new Audio(url);
            audioRef.current = audio;
            await new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onpause = () => resolve();
              audio.onerror = () => reject(new Error('The spoken reply could not be played.'));
              audio.play().catch(reject);
            });
          } finally {
            URL.revokeObjectURL(url);
          }
          if (generation !== generationRef.current) return false;
        }
        return true;
      } catch (caught) {
        setError(
          (caught as { name?: string }).name === 'NotAllowedError'
            ? 'The browser blocked audio playback. Click a play button in the transcript to hear replies.'
            : caught instanceof Error
              ? caught.message
              : 'The reply audio could not be played.',
        );
        return false;
      } finally {
        if (generation === generationRef.current) {
          audioRef.current = null;
          setSpeaking(false);
        }
      }
    },
    [sessionId, stop],
  );

  return { speaking, error, speak, stop };
}
