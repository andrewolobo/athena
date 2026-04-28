import type { PageServerLoad } from './$types';
import { apiFetch } from '$lib/api';
import type { Indicator } from '$lib/types';

export const load: PageServerLoad = async ({ cookies }) => {
const token = cookies.get('athena_session')!;
const indicators = await apiFetch<Indicator[]>('/indicators', token);
return { indicators };
};
