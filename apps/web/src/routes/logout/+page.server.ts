import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { API_BASE } from '$lib/api';

export const actions: Actions = {
default: async ({ cookies, fetch: ssrFetch }) => {
const token = cookies.get('athena_session');
if (token) {
// Best-effort sign-out on the API side; ignore failures
await ssrFetch(`${API_BASE}/auth/logout`, {
method: 'POST',
headers: { Cookie: `athena_session=${token}` }
}).catch(() => {});
}
cookies.delete('athena_session', { path: '/' });
redirect(303, '/login');
}
};
