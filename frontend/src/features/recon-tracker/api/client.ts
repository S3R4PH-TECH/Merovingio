/**
 * Thin HTTP client for the backend gateway.
 *
 * 18 of the gateway's 25 user-facing endpoints require a JWT. This is the one
 * place that knows how to attach it, so no screen has to remember.
 */

export const GATEWAY_BASE_URL = 'http://localhost:18000';

const TOKEN_KEY = 'rt-token';

export class ApiError extends Error {
  // Declared as a field rather than a constructor parameter property: this
  // project builds with `erasableSyntaxOnly`, which rejects that shorthand.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** The caller is not authenticated — the shell reacts by showing the login screen. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Authenticated, but not allowed. A different message entirely for the user. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Hardened profiles can throw on storage access; an unauthenticated
    // session is a valid state, not a crash.
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Losing persistence costs a re-login on reload; it does not break the session.
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skips the Authorization header — only /auth/login needs this. */
  anonymous?: boolean;
  baseUrl?: string;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
    if (Array.isArray(body?.detail)) {
      // FastAPI validation errors arrive as a list of {loc, msg}. Showing the
      // raw array to a user is useless; the first message is the actionable bit.
      const first = body.detail[0];
      if (typeof first?.msg === 'string') return first.msg;
    }
  } catch {
    // Not JSON, or an empty body. Fall through to the generic message.
  }
  return `Request failed with status ${response.status}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, baseUrl = GATEWAY_BASE_URL } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network-level failure never produces a status code, so it would otherwise
    // surface as an unhandled rejection deep inside a screen.
    throw new ApiError('Cannot reach the gateway. Is the stack running?', 0);
  }

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text === '' ? undefined : JSON.parse(text)) as T;
}

/** Blob download for endpoints that return a file rather than JSON. */
export async function apiDownload(path: string, baseUrl = GATEWAY_BASE_URL): Promise<Blob> {
  const token = readToken();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }
  return response.blob();
}

/** Raw text for the tool-output endpoint, which serves text/plain. */
export async function apiText(path: string, baseUrl = GATEWAY_BASE_URL): Promise<string> {
  const token = readToken();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new ApiError(await readErrorDetail(response), response.status);
  }
  return response.text();
}
