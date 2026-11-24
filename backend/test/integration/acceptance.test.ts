/**
 * Blueprint section 18, end-to-end acceptance scenario, driven through the real HTTP API.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { ApiClient, startServer } from './client.js';
import { ADMIN, JPEG, TEST_PASSWORD } from './fixtures.js';

let server: Server;
let baseUrl: string;
let admin: ApiClient;

before(async () => {
  ({ server, baseUrl } = await startServer());
  admin = await new ApiClient(baseUrl).login(ADMIN.email, ADMIN.password);
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function converse(client: ApiClient, sessionId: string, replies: string[]) {
  let last: any;
  for (const text of replies) {
    last = await client.post(`/sessions/${sessionId}/turn`, { text });
    assert.equal(last.status, 200, JSON.stringify(last.body));
  }
  return last.body.data;
}

async function complaintCount(): Promise<number> {
  return (await admin.get('/complaints?limit=1')).body.pagination.total;
}

describe('acceptance scenario', () => {
  let citizenId: number;
  let complaintId: number;
  let sessionId: string;

  it('1-2: admin logs in and creates a test citizen', async () => {
    const created = await admin.post('/citizens', {
      fullName: 'Acceptance Citizen',
      phone: '+919900000001',
      preferredLanguage: 'en',
      locality: 'Zoo Road',
      ward: '4',
      contactAuthorized: true,
      consentSource: 'Acceptance test form',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    citizenId = created.body.data.id;
  });

  it('3-4: a simulated session discloses the AI and asks for a language', async () => {
    const started = await admin.post('/sessions', { citizenId, language: null });
    assert.equal(started.status, 201);
    sessionId = started.body.data.id;
    const texts = started.body.data.messages.map((m: any) => m.messageText).join(' ');
    // With no preset language the disclosure is in the default language (Assamese);
    // every language's disclosure names the "AI" assistant.
    assert.match(texts, /\bAI\b/);
    assert.equal(started.body.data.conversationState, 'LANGUAGE_SELECTION');
    assert.equal(started.body.data.mode, 'simulation');
  });

  it('5-7: answers, read-back of issue/location/name, then confirmation', async () => {
    const before = await complaintCount();
    const data = await converse(admin, sessionId, [
      'English',
      'Garbage has not been collected for five days',
      'Zoo Road, ward 4, near the post office',
    ]);
    assert.equal(data.conversationState, 'AWAIT_CONFIRMATION');
    const readBack = data.messages.find((m: any) => m.conversationState === 'READ_BACK');
    assert.match(
      readBack.messageText,
      /Garbage has not been collected.*Zoo Road.*Acceptance Citizen/,
    );
    assert.equal(await complaintCount(), before, 'no complaint before confirmation');

    const confirmed = await converse(admin, sessionId, ['yes']);
    assert.equal(confirmed.conversationState, 'COMPLETED');
    assert.equal(confirmed.outcome, 'complaint_created');
    complaintId = confirmed.complaint.id;
    assert.match(confirmed.complaint.ticketId, /^NS-\d{4}-[0-9A-F]{10}$/);
  });

  it('8: exactly one complaint, linked to the session, even if confirmation is retried', async () => {
    const before = await complaintCount();
    const retry = await admin.post(`/sessions/${sessionId}/confirm`);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.complaintId, complaintId);
    assert.equal(await complaintCount(), before);
    const complaint = (await admin.get(`/complaints/${complaintId}`)).body.data;
    assert.equal(complaint.sourceSessionId, sessionId);
    assert.equal(complaint.source, 'simulated_ai');
    assert.equal(complaint.citizenConfirmed, true);
  });

  it('9: the dashboard shows the complaint', async () => {
    const overview = (await admin.get('/dashboard/overview')).body;
    assert.ok(overview.metrics.complaints >= 1);
    assert.ok(overview.metrics.pendingReview >= 1);
  });

  it('10-12: an assigned operator opens the ticket, reads the transcript, adds a photo', async () => {
    const operator = await new ApiClient(baseUrl).login('operator@test.local', TEST_PASSWORD);
    assert.equal(
      (await operator.get(`/complaints/${complaintId}`)).status,
      404,
      'not yet assigned',
    );

    const staff = (await admin.get('/complaints/assignees')).body.data;
    const operatorId = staff.find((user: any) => user.name === 'Test Operator').id;
    assert.equal(
      (await admin.post(`/complaints/${complaintId}/assign`, { assignedTo: operatorId })).status,
      200,
    );

    assert.equal((await operator.get(`/complaints/${complaintId}`)).status, 200);
    const transcript = await operator.get(`/complaints/${complaintId}/transcript`);
    assert.equal(transcript.status, 200);
    assert.ok(transcript.body.data.messages.some((m: any) => m.speaker === 'citizen'));
    assert.equal(transcript.body.data.hasRecording, false);
    assert.equal(
      (await operator.get(`/sessions/${sessionId}`)).status,
      403,
      'no general session access',
    );

    const form = new FormData();
    form.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'garbage.jpg');
    const upload = await operator.request('POST', `/complaints/${complaintId}/attachments`, form);
    assert.equal(upload.status, 201, JSON.stringify(upload.body));
    const photos = (await operator.get(`/complaints/${complaintId}/attachments`)).body.data;
    assert.equal(photos.length, 1);
    const download = await operator.get(`/attachments/${photos[0].id}/download`);
    assert.equal(download.status, 200);
    assert.deepEqual(download.body, JPEG);
  });

  it('13: reports reflect the new complaint and session', async () => {
    const overview = (await admin.get('/reports/overview')).body.data;
    assert.ok(overview.complaintsFromAiSessions >= 1);
    assert.ok(overview.sessionsWithComplaint >= 1);
    const outcomes = (await admin.get('/reports/sessions')).body.data.outcomes;
    assert.ok(outcomes.some((row: any) => row.key === 'complaint_created' && row.count >= 1));
  });

  it('14: cancellation and a "no" answer create no complaint', async () => {
    const before = await complaintCount();
    const cancelled = (await admin.post('/sessions', { citizenId, language: 'en' })).body.data.id;
    const cancelledEnd = await converse(admin, cancelled, ['Water pipe is leaking badly', 'stop']);
    assert.equal(cancelledEnd.outcome, 'cancelled_by_citizen');

    const rejected = (await admin.post('/sessions', { citizenId, language: 'en' })).body.data.id;
    const corrected = await converse(admin, rejected, [
      'Streetlight is broken on our lane',
      'Zoo Road',
      'skip',
      'no',
    ]);
    assert.equal(corrected.conversationState, 'ASK_CORRECTION_FIELD');
    const confirmTooEarly = await admin.post(`/sessions/${rejected}/confirm`);
    assert.equal(confirmTooEarly.status, 409);
    assert.equal(confirmTooEarly.body.error.code, 'CONFIRMATION_REQUIRED');
    await admin.post(`/sessions/${rejected}/complete`);
    assert.equal(await complaintCount(), before);
  });
});
