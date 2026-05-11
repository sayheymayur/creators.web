export type WsFrame =
	{ type: 'event', service: string, event: string, data: unknown } |
	{ type: 'response', service: string, command: string, requestId: string, data: unknown } |
	{ type: 'error', service: string, requestId: string, message: string };

function unescapePipes(value: string): string {
	return value.replace(/\\\|/g, '|');
}

export function parseFrame(raw: string): WsFrame | null {
	if (!raw.startsWith('|')) return null;
	const parts = raw.split('|');

	// Event: |service|event|json  => split gives ["", service, event, json]
	if (parts.length === 4) {
		const [, service, event, json] = parts;
		try {
			return { type: 'event', service, event, data: JSON.parse(json) };
		} catch {
			return null;
		}
	}

	// Response: |service|command|requestId|json => ["", service, command, requestId, json]
	// Error:    |service|error|requestId|message
	if (parts.length === 5) {
		const [, service, kind, requestId, payload] = parts;
		if (kind === 'error') {
			return { type: 'error', service, requestId, message: unescapePipes(payload) };
		}
		try {
			return { type: 'response', service, command: kind, requestId, data: JSON.parse(payload) };
		} catch {
			return null;
		}
	}

	return null;
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
