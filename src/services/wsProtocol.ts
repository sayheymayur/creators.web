export type WsFrame =
	{ type: 'event', service: string, event: string, data: unknown } |
	{ type: 'response', service: string, command: string, requestId: string, data: unknown } |
	{ type: 'error', service: string, requestId: string, message: string };

export function parseFrame(raw: string): WsFrame | null {
	const trimmed = raw.trim();
	if (!trimmed.startsWith('|')) return null;
	const parts = trimmed.split('|');
	// Expected minimum: ["", service, kind, ...]
	if (parts.length < 4) return null;

	const service = (parts[1] ?? '').trim();
	const kind = (parts[2] ?? '').trim();
	if (!service || !kind) return null;

	// Error: |service|error|requestId|message(with optional pipes...)
	if (kind === 'error') {
		const requestId = String(parts[3] ?? '').trim();
		if (!requestId) return null;
		const message = parts.slice(4).join('|');
		return { type: 'error', service, requestId, message };
	}

	// Find the start of JSON payload (may contain pipes).
	const jsonStartIdx = parts.findIndex((p, idx) => {
		if (idx < 3) return false;
		const t = (p ?? '').trim();
		return t.startsWith('{') || t.startsWith('[');
	});
	if (jsonStartIdx === -1) return null;

	// Grow until JSON.parse succeeds.
	let data: unknown = null;
	let jsonEndIdx = -1;
	for (let end = jsonStartIdx; end < parts.length; end++) {
		const cand = parts.slice(jsonStartIdx, end + 1).join('|');
		try {
			data = JSON.parse(cand) as unknown;
			jsonEndIdx = end;
			break;
		} catch {
			// keep extending
		}
	}
	if (jsonEndIdx === -1) return null;

	// Event: |service|event|<json>
	// In events, JSON typically starts at index 3.
	if (jsonStartIdx === 3) {
		return { type: 'event', service, event: kind, data };
	}

	// Response: |service|command|requestId|<json>
	const requestId = String(parts[3] ?? '').trim();
	if (!requestId) return null;
	return { type: 'response', service, command: kind, requestId, data };
}

export function formatServiceLine(service: string, requestId?: string): string {
	const s = service.trim();
	// Protocol doc: `>service` or `>service req123` (no space after `>`).
	return requestId ? `>${s} ${requestId}` : `>${s}`;
}

export function formatCommandLine(command: string, args: string[] = []): string {
	const joined = args.length > 0 ? ` ${args.join(' ')}` : '';
	const trimmed = command.trim();
	// Many call sites pass commands with a leading `/` (e.g. `/list feed 30`).
	// Avoid turning it into `//list feed 30`.
	if (trimmed.startsWith('/')) return `${trimmed}${joined}`;
	return `/${trimmed}${joined}`;
}
