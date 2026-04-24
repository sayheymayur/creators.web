export type HashtagToken = { type: 'text', value: string } |
	{ type: 'hashtag', value: string, tag: string };

// Instagram-like: hashtags are contiguous letters/numbers/underscore.
// Use a Unicode-friendly regex where supported.
const HASHTAG_RE_UNICODE = /#[\p{L}\p{N}_]+/gu;
const HASHTAG_RE_ASCII = /#[A-Za-z0-9_]+/g;

function getHashtagRegex(): RegExp {
	try {
		// Some JS engines may not support Unicode property escapes.
		// If unsupported, constructing the regex will throw.
		void HASHTAG_RE_UNICODE.exec('');
		return HASHTAG_RE_UNICODE;
	} catch {
		return HASHTAG_RE_ASCII;
	}
}

export function tokenizeHashtags(input: string): HashtagToken[] {
	const text = input ?? '';
	if (!text) return [{ type: 'text', value: '' }];

	const re = getHashtagRegex();
	re.lastIndex = 0;

	const out: HashtagToken[] = [];
	let last = 0;
	let m: RegExpExecArray | null;

	while ((m = re.exec(text)) !== null) {
		const idx = m.index ?? 0;
		const full = m[0] ?? '';
		if (idx > last) out.push({ type: 'text', value: text.slice(last, idx) });
		if (full) {
			const tag = full.slice(1);
			out.push({ type: 'hashtag', value: full, tag });
		}
		last = idx + full.length;
	}

	if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
	if (out.length === 0) out.push({ type: 'text', value: text });
	return out;
}

export function normalizeHashtagTag(tag: string): string {
	return (tag ?? '').trim().replace(/^#/, '');
}

export function textHasHashtag(text: string, tag: string): boolean {
	const t = normalizeHashtagTag(tag);
	if (!t) return false;
	const tokens = tokenizeHashtags(text);
	return tokens.some(tok => tok.type === 'hashtag' && tok.tag.toLowerCase() === t.toLowerCase());
}
