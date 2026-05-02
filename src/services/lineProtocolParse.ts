/**
 * Shared line-based WebSocket framing for creators API services (posts, user, creator, chat).
 * Success: |<svc>|<command>|<requestId>|<JSON>
 * Error: |<svc>|error|<requestId>|<message>
 * Push: |<svc>|<event>|<JSON> (no requestId) — posts and chat
 */
export type WsService = 'posts' | 'user' | 'creator' | 'chat';

export type ParsedCreatorsWsLine =
	| { kind: 'success', service: WsService, command: string, requestId: string, json: unknown } |
	{ kind: 'error', service: WsService, requestId: string, message: string } |
	{ kind: 'event', service: 'posts' | 'chat', event: string, json: unknown };

export function parseCreatorsWsLine(line: string): ParsedCreatorsWsLine | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith('|')) return null;
	const parts = trimmed.split('|');
	if (parts.length < 4) return null;

	const svc = parts[1];
	if (svc !== 'posts' && svc !== 'user' && svc !== 'creator' && svc !== 'chat') return null;
	const service: WsService = svc;

	if (parts[2] === 'error') {
		if (parts.length < 5) return null;
		const requestId = parts[3];
		const message = parts.slice(4).join('|');
		if (!requestId?.trim()) return null;
		return { kind: 'error', service, requestId, message };
	}

	if (parts.length === 4) {
		if (service !== 'posts' && service !== 'chat') return null;
		const event = parts[2];
		const jsonStr = parts[3];
		try {
			const json = JSON.parse(jsonStr) as unknown;
			return { kind: 'event', service, event, json };
		} catch {
			return null;
		}
	}

	// Success response can vary slightly across backend implementations.
	// We locate JSON payload first, then try to recover requestId from nearby tokens.
	if (parts.length >= 5) {
		const jsonStartIdx = parts.findIndex((p, idx) =>
			idx >= 3 && ((p ?? '').trim().startsWith('{') || (p ?? '').trim().startsWith('['))
		);
		if (jsonStartIdx === -1) return null;

		// JSON might be spread across multiple `|`-split tokens if strings contain pipes.
		// Try growing window until JSON.parse succeeds.
		let json: unknown = null;
		let jsonEndIdx = -1;
		for (let end = jsonStartIdx; end < parts.length; end++) {
			const cand = parts.slice(jsonStartIdx, end + 1).join('|');
			try {
				json = JSON.parse(cand) as unknown;
				jsonEndIdx = end;
				break;
			} catch {
				// keep trying longer candidates
			}
		}
		if (jsonEndIdx === -1) return null;

		const command = parts[2];

		// Prefer the token just before JSON start as requestId.
		let requestId: string | undefined = parts[jsonStartIdx - 1];
		const before = requestId?.trim();
		const beforeLooksJson = before?.startsWith('{') || before?.startsWith('[');
		const beforeIsKnownWord = before === 'success' || before === 'error';
		if (!before || beforeLooksJson || beforeIsKnownWord) {
			// Otherwise, try the token just after JSON end.
			const after = parts[jsonEndIdx + 1]?.trim();
			const afterLooksJson = after?.startsWith('{') || after?.startsWith('[');
			const afterIsKnownWord = after === 'success' || after === 'error';
			requestId = (!afterLooksJson && after && !afterIsKnownWord) ? after : undefined;
		}

		// Fallback to the standard position if still missing.
		if (!requestId || !String(requestId).trim()) {
			const fallback = parts[3]?.trim();
			requestId = fallback && fallback !== 'success' ? fallback : undefined;
		}

		if (!requestId || !String(requestId).trim()) return null;
		return { kind: 'success', service, command, requestId: String(requestId), json };
	}

	return null;
}
