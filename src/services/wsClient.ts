import { formatCommandLine, formatServiceLine, parseFrame, type WsFrame } from './wsProtocol';

type Listener = (frame: WsFrame) => void;

export interface WsClientOptions {
	/**
	 * Full WS URL, e.g. "wss://example.com/ws".
	 * If omitted, uses current origin + VITE_WS_PATH (default "/ws").
	 */
	url?: string;
	wsPath?: string;
	/**
	 * Optional token provider used on connect as ?token=<jwt>.
	 * If token changes later, call authenticate(jwt).
	 */
	getToken?: () => string | null | undefined;
}

type PendingReq = {
	resolve: (data: unknown) => void,
	reject: (err: Error) => void,
	service: string,
	command: string,
};

export class WsClient {
	private ws: WebSocket | null = null;
	private listeners: Listener[] = [];
	private pending: Record<string, PendingReq> = {};
	private requestCounter = 0;
	private reconnectTimer: number | null = null;
	private closedByUser = false;

	private options: WsClientOptions;

	constructor(options: WsClientOptions = {}) {
		this.options = options;
	}

	get isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	connect(): void {
		this.closedByUser = false;
		const url = this.buildUrl();
		this.ws = new WebSocket(url);

		this.ws.onopen = () => {
			// No-op: caller may choose to authenticate via command too.
		};

		this.ws.onmessage = evt => {
			console.log(`[<<] ${evt.data}`);
			const raw = typeof evt.data === 'string' ? evt.data : '';
			if (!raw) return;

			raw.split('\n').forEach(line => {
				const trimmed = line.trim();
				if (!trimmed) return;
				const frame = parseFrame(trimmed);
				if (!frame) return;

				if (frame.type === 'response') {
					const pending = this.pending[frame.requestId];
					if (pending) {
						delete this.pending[frame.requestId];
						pending.resolve(frame.data);
					}
				} else if (frame.type === 'error') {
					const pending = this.pending[frame.requestId];
					if (pending) {
						delete this.pending[frame.requestId];
						pending.reject(new Error(frame.message));
					}
				}

				this.listeners.forEach(fn => fn(frame));
			});
		};

		this.ws.onclose = () => {
			this.ws = null;

			// Reject all pending requests
			Object.keys(this.pending).forEach(id => {
				this.pending[id].reject(new Error('Socket closed'));
				delete this.pending[id];
			});

			if (this.closedByUser) return;
			this.scheduleReconnect();
		};

		this.ws.onerror = () => {
			// Let onclose drive reconnect. Avoid double-handling.
		};
	}

	disconnect(): void {
		this.closedByUser = true;
		if (this.reconnectTimer !== null) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}

	subscribe(listener: Listener): () => void {
		this.listeners = [...this.listeners, listener];
		return () => {
			this.listeners = this.listeners.filter(fn => fn !== listener);
		};
	}

	authenticate(jwt: string, requestId?: string): Promise<unknown> {
		return this.request('user', 'authenticate', [jwt], requestId);
	}

	/**
	 * Sends a service selection line + a single command line.
	 * This matches your backend behavior: requestId applies to next command only.
	 */
	request(service: string, command: string, args: string[] = [], requestId?: string): Promise<unknown> {
		if (!this.isConnected || !this.ws) {
			return Promise.reject(new Error('Socket not connected'));
		}

		const rid = requestId ?? this.nextRequestId();
		const serviceLine = formatServiceLine(service, rid);
		const cmdLine = formatCommandLine(command, args);

		this.send(`${serviceLine}\n${cmdLine}\n`);

		return new Promise((resolve, reject) => {
			this.pending[rid] = { resolve, reject, service, command };
		});
	}

	notify(service: string, command: string, args: string[] = []): void {
		if (!this.isConnected || !this.ws) return;
		const serviceLine = formatServiceLine(service);
		const cmdLine = formatCommandLine(command, args);
		this.send(`${serviceLine}\n${cmdLine}\n`);
	}

	send(message: string): void {
		if (!this.isConnected || !this.ws) return;
		console.log(`[>>] ${message}`);
		this.ws.send(message);
	}

	private nextRequestId(): string {
		this.requestCounter += 1;
		return `req${this.requestCounter}`;
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer !== null) return;
		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 1000);
	}

	private buildUrl(): string {
		if (this.options.url) {
			return this.options.url;
		}

		const wsPath = this.options.wsPath ?? import.meta.env.VITE_WS_PATH ?? '/ws';
		const token = this.options.getToken?.() ?? null;

		const loc = window.location;
		const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
		const base = `${proto}//${loc.host}${wsPath}`;

		if (!token) return base;
		const sep = base.includes('?') ? '&' : '?';
		return `${base}${sep}token=${encodeURIComponent(token)}`;
	}
}
