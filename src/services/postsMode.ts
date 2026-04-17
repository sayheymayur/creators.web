export function isPostsMockMode(): boolean {
	return import.meta.env.VITE_POSTS_MOCK === 'true';
}
