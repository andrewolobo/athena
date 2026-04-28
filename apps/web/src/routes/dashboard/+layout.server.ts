import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { apiFetch } from '$lib/api';
import type { AuthUser } from '$lib/types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
const token = cookies.get('athena_session');
if (!token) {
redirect(303, '/login');
}

const user = await apiFetch<AuthUser>('/auth/me', token);
locals.user = user;

return { user };
};
