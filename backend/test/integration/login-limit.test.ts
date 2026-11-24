// Runs in its own process because it exhausts the in-memory login limiter.
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import type { Server } from 'node:http';
import { ApiClient, startServer } from './client.js';

let server: Server;
let baseUrl: string;
before(async () => ({ server, baseUrl } = await startServer()));
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

it('limits repeated sign-in attempts from one client', async () => {
  const client = new ApiClient(baseUrl);
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 12; attempt += 1)
    statuses.push(
      (await client.post('/auth/login', { email: 'nobody@test.local', password: 'x' })).status,
    );
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
  assert.equal(statuses[11], 429);
});
