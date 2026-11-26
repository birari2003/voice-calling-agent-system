/** Exotel AgentStream/Voicebot JSON protocol. Audio payloads are base64 encoded. */
export interface ExotelStartEvent {
  event: 'start';
  stream_sid: string;
  start: {
    stream_sid: string;
    call_sid: string;
    account_sid: string;
    from: string;
    to: string;
    custom_parameters?: Record<string, string>;
    media_format: { encoding: string; sample_rate: string; bit_rate: string };
  };
}

export type ExotelInboundEvent =
  | { event: 'connected' }
  | ExotelStartEvent
  | {
      event: 'media';
      stream_sid: string;
      media: { chunk: string; timestamp: string; payload: string };
    }
  | { event: 'dtmf'; stream_sid: string; dtmf: { digit: string; duration: string } }
  | { event: 'mark'; stream_sid: string; mark: { name: string } }
  | {
      event: 'stop';
      stream_sid: string;
      stop: { call_sid: string; account_sid: string; reason: string };
    };

export type ExotelOutboundEvent =
  | { event: 'media'; stream_sid: string; media: { payload: string } }
  | { event: 'mark'; stream_sid: string; mark: { name: string } }
  | { event: 'clear'; stream_sid: string };

export function parseExotelEvent(raw: string): ExotelInboundEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !('event' in value)) return null;
  const event = (value as { event?: unknown }).event;
  if (!['connected', 'start', 'media', 'dtmf', 'mark', 'stop'].includes(String(event))) return null;
  return value as ExotelInboundEvent;
}

export function audioToExotel(streamSid: string, audio: Buffer): ExotelOutboundEvent {
  return { event: 'media', stream_sid: streamSid, media: { payload: audio.toString('base64') } };
}

export function clearExotelAudio(streamSid: string): ExotelOutboundEvent {
  return { event: 'clear', stream_sid: streamSid };
}
