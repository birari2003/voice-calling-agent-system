import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  audioToExotel,
  clearExotelAudio,
  parseExotelEvent,
} from '../src/telephony/exotelProtocol.js';

describe('Exotel AgentStream protocol', () => {
  it('reads call and caller identifiers from the start event', () => {
    const event = parseExotelEvent(
      JSON.stringify({
        event: 'start',
        stream_sid: 'MZ1',
        start: {
          stream_sid: 'MZ1',
          call_sid: 'CA1',
          account_sid: 'AC1',
          from: '+919876543210',
          to: '+911234567890',
          media_format: { encoding: 'audio/x-raw', sample_rate: '8000', bit_rate: '16' },
        },
      }),
    );
    assert.equal(event?.event, 'start');
    if (event?.event === 'start') assert.equal(event.start.call_sid, 'CA1');
  });

  it('encodes outgoing audio and can clear playback for barge-in', () => {
    assert.deepEqual(audioToExotel('MZ1', Buffer.from([1, 2, 3])), {
      event: 'media',
      stream_sid: 'MZ1',
      media: { payload: 'AQID' },
    });
    assert.deepEqual(clearExotelAudio('MZ1'), { event: 'clear', stream_sid: 'MZ1' });
  });

  it('rejects invalid JSON and unknown event names', () => {
    assert.equal(parseExotelEvent('bad'), null);
    assert.equal(parseExotelEvent('{"event":"unknown"}'), null);
  });
});
