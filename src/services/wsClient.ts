import { formatCommandLine, formatServiceLine, parseFrame, type WsFrame } from './wsProtocol';
import { creatorsWsUrl } from './wsUrl';

export interface WsClientOptions {
	url?: string;
	wsPath?: string;
	getToken?: () => string | null | undefined;
}

type PendingReq = {
	resolve: (data: unknown) => void,
	reject: (err: Error) => void,
	service: string,
	command: string,
};

type AnyListener = (frame: WsFrame) => void;
type EventListener = (data: unknown, frame: Extract<WsFrame, { type: 'event' }>) => void;

/**
 * Showdown-like connection manager:
 * - one socket
 * - queued sends while disconnected
 * - exponential backoff reconnect
 * - calls client.receive(msg) for incoming data
 */
class WsConnection {
	private socket: WebSocket | null = null;
	connected = false;
	private queue: string[] = [];
	private reconnectDelay = 500;
	private reconnectCap = 8000;
	private reconnectTimer: number | null = null;
	private shouldReconnect = true;

	private getUrl: () => string;
	private onMessage: (data: string) => void;
	private onStatus: () => void;

	constructor(getUrl: () => string, onMessage: (data: string) => void, onStatus: () => void) {
		this.getUrl = getUrl;
		this.onMessage = onMessage;
		this.onStatus = onStatus;
	}

	connect(): void {
		if (this.connected || this.socket) return;
		this.shouldReconnect = true;
		const url = this.getUrl();
		this.socket = new WebSocket(url);

		this.socket.onopen = () => {
			console.log(`[WS] Connected to ${url}`);
			this.connected = true;
			this.reconnectDelay = 500;
			const queued = this.queue;
			this.queue = [];
			queued.forEach(msg => this.socket?.send(msg));
			this.onStatus();
		};

		this.socket.onmessage = evt => {
			const raw = typeof evt.data === 'string' ? evt.data : '';
			if (!raw) return;
			this.onMessage(raw);
		};

		this.socket.onclose = () => {
			this.connected = false;
			this.socket = null;
			this.onStatus();
			this.retry();
		};

		this.socket.onerror = () => {
			this.connected = false;
			this.onStatus();
			this.retry();
		};
	}

	disconnect(): void {
		this.shouldReconnect = false;
		if (this.reconnectTimer !== null) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.queue = [];
		this.socket?.close();
		this.socket = null;
		this.connected = false;
		this.onStatus();
	}

	send(msg: string): void {
		if (!this.connected || !this.socket) {
			this.queue.push(msg);
			return;
		}
		let roomid = '';
		if (msg.startsWith('>')) roomid = msg.split('\n')[0].replace('>', '').trim();
		console.log('[>>] ' + (roomid ? '[' + roomid + '] ' : '') + '' + msg.split('\n')[1]);

		try {
			this.socket.send(msg);
		} catch (err) {
			console.error(`[>>] Error sending message: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private retry(): void {
		if (!this.shouldReconnect) return;
		if (this.reconnectTimer !== null) return;
		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null;
			if (!this.connected && this.shouldReconnect) {
				this.connect();
				this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.reconnectCap);
			}
		}, this.reconnectDelay);
	}
}

/**
 * Showdown-ish socket wrapper with a receive() entrypoint.
 * Your backend protocol is service-based (">service") and frame-based ("|service|...").
 */
export class WsClient {
	private anyListeners: AnyListener[] = [];
	private eventListeners: Record<string, EventListener[]> = {};
	private pending: Record<string, PendingReq> = {};
	private requestCounter = 0;
	private currentService: string | null = null;
	private lastAuthToken: string | null = null;
	private connection: WsConnection;
	private options: WsClientOptions;

	constructor(options: WsClientOptions = {}) {
		this.options = options;
		this.connection = new WsConnection(
			() => this.buildUrl(),
			data => this.receive(data),
			() => this.onStatusChanged()
		);
	}

	get isConnected(): boolean {
		return this.connection.connected;
	}

	connect(): void {
		this.connection.connect();
	}

	disconnect(): void {
		this.connection.disconnect();
		this.currentService = null;
		this.rejectAllPending('Socket closed');
	}

	onAny(listener: AnyListener): () => void {
		this.anyListeners = [...this.anyListeners, listener];
		return () => {
			this.anyListeners = this.anyListeners.filter(fn => fn !== listener);
		};
	}

	on(service: string, event: string, listener: EventListener): () => void {
		const key = `${service}:${event}`;
		this.eventListeners[key] = [...(this.eventListeners[key] ?? []), listener];
		return () => {
			this.eventListeners[key] = (this.eventListeners[key] ?? []).filter(fn => fn !== listener);
		};
	}

	receive(raw: string): void {
		console.log('[<<] ' + raw);

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
			} else if (frame.type === 'event') {
				const key = `${frame.service}:${frame.event}`;
				(this.eventListeners[key] ?? []).forEach(fn => fn(frame.data, frame));
			}

			this.anyListeners.forEach(fn => fn(frame));
		});
	}

	authenticate(jwt: string, requestId?: string): Promise<unknown> {
		return this.request('user', 'authenticate', [jwt], requestId);
	}

	refreshAuth(): void {
		const token = this.options.getToken?.() ?? null;
		if (this.lastAuthToken === token) return;
		this.lastAuthToken = token;
		if (!token) return;
		if (!this.isConnected) return;
		this.notify('user', 'authenticate', [token]);
	}

	request(service: string, command: string, args: string[] = [], requestId?: string): Promise<unknown> {
		if (!this.isConnected) return Promise.reject(new Error('Socket not connected'));
		const rid = requestId ?? this.nextRequestId();
		const serviceLine = formatServiceLine(service, rid);
		const cmdLine = formatCommandLine(command, args);
		this.currentService = service;
		this.connection.send(`${serviceLine}\n${cmdLine}\n`);
		return new Promise((resolve, reject) => {
			this.pending[rid] = { resolve, reject, service, command };
		});
	}

	notify(service: string, command: string, args: string[] = []): void {
		const cmdLine = formatCommandLine(command, args);
		const lines: string[] = [];
		if (this.currentService !== service) {
			lines.push(formatServiceLine(service));
			this.currentService = service;
		}
		lines.push(cmdLine);
		this.connection.send(`${lines.join('\n')}\n`);
	}

	send(message: string): void {
		this.connection.send(message);
	}

	private onStatusChanged(): void {
		if (!this.isConnected) {
			this.currentService = null;
			this.rejectAllPending('Socket closed');
			return;
		}
		this.refreshAuth();
	}

	private rejectAllPending(message: string): void {
		Object.keys(this.pending).forEach(id => {
			this.pending[id].reject(new Error(message));
			delete this.pending[id];
		});
	}

	private nextRequestId(): string {
		this.requestCounter += 1;
		return `req${this.requestCounter}`;
	}

	private buildUrl(): string {
		if (this.options.url) return this.options.url;
		const envUrl = (import.meta.env.VITE_WS_URL ?? '').trim();
		if (envUrl) return envUrl;
		// Same host/path/token as HTTP API (`VITE_CREATORS_API_URL`, `VITE_CREATORS_WS_URL`).
		return creatorsWsUrl();
	}
}
