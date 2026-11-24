import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'off' | 'requesting' | 'ready' | 'recording' | 'error';

export interface RecordingResult {
  /** Null when nothing above the speech threshold was heard; nothing is uploaded then. */
  blob: Blob | null;
  durationMs: number;
}

const SPEECH_THRESHOLD = 0.02; // RMS of the time-domain signal
const SILENCE_AFTER_SPEECH_MS = 1000;
const NO_SPEECH_TIMEOUT_MS = 8000;
const MAX_RECORDING_MS = 30000;
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

function microphoneError(error: unknown): string {
  const name = (error as { name?: string }).name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Microphone permission was denied. Allow it from the browser address bar, or continue by typing.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No microphone was found. Connect one, or continue by typing.';
  if (name === 'NotReadableError')
    return 'The microphone is being used by another application. Close it, or continue by typing.';
  return 'The microphone could not be started. Continue by typing.';
}

/**
 * Browser microphone capture with a level meter and simple voice-activity detection:
 * recording stops automatically after a pause following speech, after a period with no speech,
 * or at the maximum length. Audio stays in memory and is only sent for transcription.
 */
export function useVoiceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('off');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const frameRef = useRef<number>(0);
  const stopRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => undefined);
    streamRef.current = null;
    contextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
    setLevel(0);
    setStatus('off');
  }, []);

  // Always release the microphone when the studio unmounts (navigation, session end).
  useEffect(() => release, [release]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (streamRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(
        'This browser cannot record audio here. Use Chrome, Edge or Firefox on localhost or HTTPS, or continue by typing.',
      );
      setStatus('error');
      return false;
    }
    setStatus('requesting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      analyserRef.current = analyser;
      setStatus('ready');
      return true;
    } catch (caught) {
      setError(microphoneError(caught));
      setStatus('error');
      return false;
    }
  }, []);

  /** Records one utterance. Resolves when recording stops for any reason. */
  const record = useCallback(async (): Promise<RecordingResult> => {
    const stream = streamRef.current;
    const analyser = analyserRef.current;
    if (!stream || !analyser) throw new Error('Microphone is not enabled.');
    await contextRef.current?.resume();
    const mimeType = PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let heardSpeech = false;
    let lastSoundAt = startedAt;

    return new Promise<RecordingResult>((resolve) => {
      const stop = () => {
        cancelAnimationFrame(frameRef.current);
        stopRef.current = null;
        if (recorder.state === 'recording') recorder.stop();
      };
      stopRef.current = stop;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setLevel(0);
        if (streamRef.current) setStatus('ready');
        resolve({
          blob: heardSpeech && chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null,
          durationMs: performance.now() - startedAt,
        });
      };
      const monitor = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) sum += value * value;
        const rms = Math.sqrt(sum / samples.length);
        setLevel(Math.min(1, rms * 12));
        const now = performance.now();
        if (rms > SPEECH_THRESHOLD) {
          heardSpeech = true;
          lastSoundAt = now;
        }
        const elapsed = now - startedAt;
        if (
          elapsed > MAX_RECORDING_MS ||
          (heardSpeech && now - lastSoundAt > SILENCE_AFTER_SPEECH_MS) ||
          (!heardSpeech && elapsed > NO_SPEECH_TIMEOUT_MS)
        ) {
          stop();
          return;
        }
        frameRef.current = requestAnimationFrame(monitor);
      };
      recorder.start(250);
      setStatus('recording');
      frameRef.current = requestAnimationFrame(monitor);
    });
  }, []);

  /** Stops the current recording early (the "Done speaking" button). */
  const stopRecording = useCallback(() => stopRef.current?.(), []);

  return { status, level, error, enable, record, stopRecording, release };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;
