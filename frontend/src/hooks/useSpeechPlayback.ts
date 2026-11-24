import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionsApi } from '../api/sessions';

/**
 * Plays assistant messages in order through the speech service. Synthesis of the next message
 * starts while the current one plays, to keep gaps short on CPU-only machines.
 */
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
      const pending = messageIds.map((id) =>
        sessionsApi.speech(sessionId, id).then(
          (blob) => ({ blob }),
          (caught: unknown) => ({ error: caught }),
        ),
      );
      try {
        for (const item of pending) {
          const result = await item;
          if (generation !== generationRef.current || !mountedRef.current) return false;
          if ('error' in result) {
            setError(
              result.error instanceof Error
                ? result.error.message
                : 'Spoken replies are unavailable. Read the transcript instead.',
            );
            return false;
          }
          const url = URL.createObjectURL(result.blob);
          try {
            const audio = new Audio(url);
            audioRef.current = audio;
            await new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onpause = () => resolve(); // stop() pauses the element
              audio.onerror = () => reject(new Error('The reply audio could not be played.'));
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
