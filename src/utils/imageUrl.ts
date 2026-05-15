/** True if the string is worth passing to <img src> (avoids broken-image icon for "", bad paths, "null", etc.). */
export function isRenderableImageUrl(raw: string | null | undefined): boolean {
	if (raw == null) return false;
	const u = String(raw).trim();
	if (!u || u === 'null' || u === 'undefined') return false;
	if (u.startsWith('data:image/')) return true;
	if (u.startsWith('blob:')) return true;
	if (u.startsWith('http://') || u.startsWith('https://')) {
		try {
			const parsed = new URL(u);
			return Boolean(parsed.hostname);
		} catch {
			return false;
		}
	}
	// Same-origin absolute paths often used for uploaded media
	if (u.startsWith('/') && u.length > 1 && !u.startsWith('//')) return true;
	return false;
}
