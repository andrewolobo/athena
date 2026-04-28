import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const API_BASE = env.API_BASE_URL ?? 'http://localhost:3000';
const COOKIE_NAME = 'athena_session';

export class ApiError extends Error {
constructor(
public readonly status: number,
message: string
) {
super(message);
}
}

/**
 * Server-side fetch wrapper. Forwards the session cookie to the API.
 * Throws ApiError on non-2xx. Throws redirect(303, '/login') on 401.
 */
export async function apiFetch<T>(
path: string,
cookie: string | undefined,
options: RequestInit = {}
): Promise<T> {
const headers: Record<string, string> = {
'Content-Type': 'application/json',
...(options.headers as Record<string, string>)
};
if (cookie) {
headers['Cookie'] = `${COOKIE_NAME}=${cookie}`;
}

const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

if (res.status === 401) {
redirect(303, '/login');
}

if (!res.ok) {
const body = await res.json().catch(() => ({ error: res.statusText }));
throw new ApiError(res.status, body.error ?? res.statusText);
}

return res.json() as Promise<T>;
}

/** POST multipart/form-data to the API (for XLSForm upload). */
export async function apiFetchMultipart<T>(
path: string,
cookie: string | undefined,
body: FormData
): Promise<T> {
const headers: Record<string, string> = {};
if (cookie) {
headers['Cookie'] = `${COOKIE_NAME}=${cookie}`;
}

const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body });

if (res.status === 401) {
redirect(303, '/login');
}

if (!res.ok) {
const parsed = await res.json().catch(() => ({ error: res.statusText }));
throw new ApiError(res.status, parsed.error ?? res.statusText);
}

return res.json() as Promise<T>;
}
