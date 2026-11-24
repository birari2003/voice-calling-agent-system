import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { ApiClient, startServer } from './client.js';
import { ADMIN, JPEG, TEST_PASSWORD } from './fixtures.js';

let server: Server;
let baseUrl: string;
let admin: ApiClient;
let otherAdmin: ApiClient;
let auditor: ApiClient;
let operator: ApiClient;
const ids: {
  citizen?: number;
  complaint?: number;
  session?: string;
  attachment?: number;
  campaign?: number;
} = {};

before(async () => {
  ({ server, baseUrl } = await startServer());
  admin = await new ApiClient(baseUrl).login(ADMIN.email, ADMIN.password);
  otherAdmin = await new ApiClient(baseUrl).login('admin@other.test', TEST_PASSWORD);
  auditor = await new ApiClient(baseUrl).login('auditor@test.local', TEST_PASSWORD);
  operator = await new ApiClient(baseUrl).login('operator@test.local', TEST_PASSWORD);

  ids.citizen = (
    await admin.post('/citizens', {
      fullName: 'Isolation Citizen',
      phone: '+919900000002',
      preferredLanguage: 'en',
      contactAuthorized: true,
      consentSource: 'Security test form',
    })
  ).body.data.id;
  ids.session = (
    await admin.post('/sessions', { citizenId: ids.citizen, language: 'en' })
  ).body.data.id;
  for (const text of ['Drain is overflowing near the market', 'Fancy Bazaar', 'skip', 'yes'])
    await admin.post(`/sessions/${ids.session}/turn`, { text });
  ids.complaint = (await admin.get(`/sessions/${ids.session}`)).body.data.complaintId;
  const form = new FormData();
  form.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'drain.jpg');
  ids.attachment = (
    await admin.request('POST', `/complaints/${ids.complaint}/attachments`, form)
  ).body.data.id;
  ids.campaign = (await admin.post('/campaigns', { name: 'Isolation campaign' })).body.data.id;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('organization isolation', () => {
  it('another organization cannot read or change any of these records', async () => {
    const reads = [
      `/citizens/${ids.citizen}`,
      `/complaints/${ids.complaint}`,
      `/complaints/${ids.complaint}/transcript`,
      `/complaints/${ids.complaint}/attachments`,
      `/attachments/${ids.attachment}/download`,
      `/sessions/${ids.session}`,
      `/campaigns/${ids.campaign}`,
    ];
    for (const path of reads) assert.equal((await otherAdmin.get(path)).status, 404, `GET ${path}`);
    assert.equal((await otherAdmin.patch(`/citizens/${ids.citizen}`, { notes: 'x' })).status, 404);
    assert.equal((await otherAdmin.post(`/sessions/${ids.session}/cancel`)).status, 404);
    assert.equal((await otherAdmin.post(`/campaigns/${ids.campaign}/cancel`)).status, 404);
    assert.equal(
      (await otherAdmin.post('/sessions', { citizenId: ids.citizen })).status,
      400,
      'cannot start a session for a citizen of another organization',
    );
  });

  it('lists and reports exclude other organizations', async () => {
    const complaints = (await otherAdmin.get('/complaints')).body;
    assert.equal(complaints.pagination.total, 0);
    assert.equal((await otherAdmin.get('/reports/overview')).body.data.complaints, 0);
    assert.equal((await otherAdmin.get('/sessions')).body.pagination.total, 0);
  });
});

describe('role permissions', () => {
  it('auditor is read-only', async () => {
    assert.equal((await auditor.get(`/complaints/${ids.complaint}`)).status, 200);
    assert.equal((await auditor.get(`/attachments/${ids.attachment}/download`)).status, 200);
    const denied = [
      () => auditor.post('/citizens', { fullName: 'X' }),
      () => auditor.patch(`/complaints/${ids.complaint}`, { priority: 'high' }),
      () => auditor.post('/sessions', { citizenId: ids.citizen }),
      () => auditor.post('/campaigns', { name: 'Nope campaign' }),
      () => auditor.post(`/complaints/${ids.complaint}/upload-link`),
    ];
    for (const call of denied) assert.equal((await call()).status, 403);
  });

  it('operator sees only assigned complaints and cannot manage campaigns or reports', async () => {
    assert.equal((await operator.get(`/complaints/${ids.complaint}`)).status, 404);
    assert.equal((await operator.get('/campaigns')).status, 403);
    assert.equal((await operator.get('/reports/overview')).status, 403);
    assert.equal((await operator.get('/sessions')).status, 403);
  });

  it('logged-out requests are rejected', async () => {
    const anonymous = new ApiClient(baseUrl);
    for (const path of [
      '/complaints',
      `/attachments/${ids.attachment}/download`,
      '/reports/overview',
    ])
      assert.equal((await anonymous.get(path)).status, 401, path);
  });
});

describe('request hardening', () => {
  it('rejects writes without a CSRF token', async () => {
    const response = await admin.request(
      'POST',
      '/campaigns',
      { name: 'No CSRF campaign' },
      { csrf: false },
    );
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'CSRF_INVALID');
  });

  it('answers malformed JSON with 400, not a server error', async () => {
    const response = await admin.request('POST', '/campaigns', '{"name": ');
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_JSON');
    assert.ok(response.body.error.reference, 'error carries a reference ID');
  });

  it('tags every response with a request ID and never leaks internals on errors', async () => {
    const response = await admin.get('/complaints/not-a-number');
    assert.ok(response.headers.get('x-request-id'));
    assert.equal(response.status, 400);
    assert.doesNotMatch(JSON.stringify(response.body), /Sequelize|SELECT|at \w+ \(/);
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const unknown = await new ApiClient(baseUrl).post('/auth/login', {
      email: 'nobody@test.local',
      password: 'x',
    });
    const wrong = await new ApiClient(baseUrl).post('/auth/login', {
      email: ADMIN.email,
      password: 'wrong',
    });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
  });

  it('reports health with database and storage checks', async () => {
    const health = await new ApiClient(baseUrl).get('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.database, 'ok');
    assert.equal(health.body.storage, 'ok');
    assert.equal(health.body.speechService, 'unavailable');
    assert.equal((await new ApiClient(baseUrl).get('/health/live')).status, 200);
  });
});

describe('idempotency', () => {
  it('a retried citizen reply is processed once', async () => {
    const session = (await admin.post('/sessions', { citizenId: ids.citizen, language: 'en' })).body
      .data.id;
    const reply = {
      text: 'Garbage is lying near the school gate',
      clientMessageId: 'retry-test-0001',
    };
    const first = await admin.post(`/sessions/${session}/turn`, reply);
    const second = await admin.post(`/sessions/${session}/turn`, reply);
    assert.equal(second.body.replayed, true);
    assert.equal(second.body.data.messages.length, first.body.data.messages.length);
    await admin.post(`/sessions/${session}/cancel`);
  });

  it('a retried staff complaint with the same key creates one complaint', async () => {
    const body = {
      citizenId: ids.citizen,
      category: 'Roads',
      description: 'Large pothole in front of the bus stop',
      locality: 'Fancy Bazaar',
      confirmed: true,
    };
    const headers = { 'Idempotency-Key': 'idempotency-test-0001' };
    const first = await admin.request('POST', '/complaints', body, { headers });
    const second = await admin.request('POST', '/complaints', body, { headers });
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.idempotentReplay, true);
    assert.equal(second.body.data.ticketId, first.body.data.ticketId);
    const changed = await admin.request(
      'POST',
      '/complaints',
      { ...body, category: 'Drainage' },
      { headers },
    );
    assert.equal(changed.status, 409);
  });
});
