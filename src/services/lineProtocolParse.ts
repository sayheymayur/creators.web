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
	const service = svc as WsService;

	if (parts[2] === 'error') {
		if (parts.length < 5) return null;
		const requestId = parts[3];
		const message = parts.slice(4).join('|');
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

	if (parts.length >= 5) {
		const command = parts[2];
		const requestId = parts[3];
		const jsonStr = parts.slice(4).join('|');
		try {
			const json = JSON.parse(jsonStr) as unknown;
			return { kind: 'success', service, command, requestId, json };
		} catch {
			return null;
		}
	}

	return null;
}
