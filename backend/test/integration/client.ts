import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { app } from '../../src/app.js';

/** Starts the real Express app on a random port. */
export async function startServer(): Promise<{ baseUrl: string; server: Server }> {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}/api/v1`, server };
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/** A browser-like client: keeps cookies and sends the CSRF header on writes. */
export class ApiClient {
  private cookies = new Map<string, string>();
  constructor(private readonly baseUrl: string) {}

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private remember(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const [name, ...rest] = pair!.split('=');
      const value = rest.join('=');
      if (!value || /expires=Thu, 01 Jan 1970/i.test(header)) this.cookies.delete(name!.trim());
      else this.cookies.set(name!.trim(), value);
    }
  }

  async request<T = any>(
    method: string,
    path: string,
    body?: unknown,
    options: { csrf?: boolean; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...options.headers };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    if (method !== 'GET' && options.csrf !== false) {
      const csrf = await fetch(`${this.baseUrl}/auth/csrf`, {
        headers: { Cookie: this.cookieHeader() },
      });
      this.remember(csrf);
      headers['X-CSRF-Token'] = ((await csrf.json()) as { csrfToken: string }).csrfToken;
      headers.Cookie = this.cookieHeader();
    }
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (typeof body === 'string') {
      payload = body;
      headers['Content-Type'] = 'application/json';
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: payload });
    this.remember(response);
    const type = response.headers.get('content-type') ?? '';
    const parsed = type.includes('json')
      ? await response.json()
      : response.status === 204
        ? null
        : Buffer.from(await response.arrayBuffer());
    return { status: response.status, body: parsed as T, headers: response.headers };
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = any>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body ?? {});
  }
  patch<T = any>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }

  async login(email: string, password: string): Promise<this> {
    const response = await this.post('/auth/login', { email, password });
    if (response.status !== 200) throw new Error(`Login failed for ${email}: ${response.status}`);
    return this;
  }
}
