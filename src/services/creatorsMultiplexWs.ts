import { creatorsWsUrl } from './wsUrl';
import { parseCreatorsWsLine, type WsService } from './lineProtocolParse';

function genRequestId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}
	return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

type Pending = {
	resolve: (v: unknown) => void,
	reject: (e: Error) => void,
	timer: ReturnType<typeof setTimeout>,
};

export type ChatEventHandler = (event: string, payload: unknown) => void;

export interface CreatorsMultiplexWsOptions {
	onPostsEvent: (event: string, payload: unknown) => void;
	onConnectionChange?: (status: 'connecting' | 'open' | 'closed', err?: Error) => void;
	/** When a chat error line arrives but no matching pending request (e.g. fire-and-forget commands). */
	onChatOrphanError?: (message: string) => void;
	url?: string;
	commandTimeoutMs?: number;
}

/**
 * One WebSocket for posts, user, creator, and chat line services (same URL, `> <service> <requestId>`).
 */
export class CreatorsMultiplexWs {
	private ws: WebSocket | null = null;
	private buffer = '';
	private pending: Record<string, Pending> = {};
	private readonly options: CreatorsMultiplexWsOptions;
	private sendQueue: string[] = [];
	private chatListeners: ChatEventHandler[] = [];
	private chatOrphanErrorListeners: ((message: string) => void)[] = [];

	constructor(options: CreatorsMultiplexWsOptions) {
		this.options = options;
	}

	/** Subscribe to `|chat|<event>|<JSON>` push frames. Returns unsubscribe. */
	subscribeChatEvents(handler: ChatEventHandler): () => void {
		this.chatListeners.push(handler);
		return () => {
			const i = this.chatListeners.indexOf(handler);
			if (i !== -1) this.chatListeners.splice(i, 1);
		};
	}

	/** Subscribe to chat error lines with no matching pending request (e.g. fire-and-forget). */
	subscribeChatOrphanErrors(handler: (message: string) => void): () => void {
		this.chatOrphanErrorListeners.push(handler);
		return () => {
			const i = this.chatOrphanErrorListeners.indexOf(handler);
			if (i !== -1) this.chatOrphanErrorListeners.splice(i, 1);
		};
	}

	/** True when the underlying WebSocket is open (commands may be sent). */
	isOpen(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	private emitChatEvent(event: string, payload: unknown) {
		const list = [...this.chatListeners];
		for (const h of list) {
			try {
				h(event, payload);
			} catch {
				/* listener errors should not break the socket */
			}
		}
	}

	private emitChatOrphanError(message: string) {
		this.options.onChatOrphanError?.(message);
		const list = [...this.chatOrphanErrorListeners];
		for (const h of list) {
			try {
				h(message);
			} catch {
				/* ignore */
			}
		}
	}

	private appendTextChunk(chunk: string) {
		if (!chunk) return;
		this.buffer += chunk;
		for (;;) {
			const nl = this.buffer.indexOf('\n');
			if (nl === -1) break;
			const line = this.buffer.slice(0, nl);
			this.buffer = this.buffer.slice(nl + 1);
			this.handleLine(line);
		}
		const maybeFrame = parseCreatorsWsLine(this.buffer);
		if (maybeFrame) {
			this.handleLine(this.buffer);
			this.buffer = '';
		}
	}

	connect(url?: string): Promise<void> {
		const wsUrl = url ?? creatorsWsUrl();
		this.options.onConnectionChange?.('connecting');

		return new Promise((resolve, reject) => {
			let settled = false;
			try {
				this.ws = new WebSocket(wsUrl);
			} catch (e) {
				const err = e instanceof Error ? e : new Error(String(e));
				this.options.onConnectionChange?.('closed', err);
				reject(err);
				return;
			}

			this.ws.onopen = () => {
				if (!settled) {
					settled = true;
					this.options.onConnectionChange?.('open');
					this.flushQueue();
					resolve();
				}
			};

			this.ws.onerror = () => {
				const err = new Error('WebSocket error');
				if (!settled) {
					settled = true;
					this.options.onConnectionChange?.('closed', err);
					reject(err);
				}
			};

			this.ws.onclose = () => {
				this.ws = null;
				this.rejectAllPending(new Error('WebSocket closed'));
				this.options.onConnectionChange?.('closed');
			};

			this.ws.onmessage = ev => {
				const data = ev.data as unknown;
				if (typeof data === 'string') {
					this.appendTextChunk(data);
					return;
				}
				if (data instanceof Blob) {
					void data.text().then(t => this.appendTextChunk(t), () => {});
					return;
				}
				if (data instanceof ArrayBuffer) {
					try {
						const t = new TextDecoder('utf-8').decode(new Uint8Array(data));
						this.appendTextChunk(t);
					} catch {}
					return;
				}
				const maybeBuf =
					data && typeof data === 'object' && 'buffer' in data ?
						(data as { buffer?: ArrayBuffer }).buffer :
						undefined;
				if (maybeBuf instanceof ArrayBuffer) {
					try {
						const t = new TextDecoder('utf-8').decode(new Uint8Array(maybeBuf));
						this.appendTextChunk(t);
					} catch {}
				}
			};
		});
	}

	private rejectAllPending(err: Error) {
		for (const k of Object.keys(this.pending)) {
			const p = this.pending[k];
			if (p) {
				clearTimeout(p.timer);
				p.reject(err);
			}
		}
		this.pending = {};
	}

	private flushQueue() {
		while (this.sendQueue.length && this.ws?.readyState === WebSocket.OPEN) {
			const line = this.sendQueue.shift();
			if (line) this.ws.send(line);
		}
	}

	private rawSend(text: string) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(text);
		} else {
			this.sendQueue.push(text);
		}
	}

	private handleLine(line: string) {
		if (!line.trim()) return;
		const frame = parseCreatorsWsLine(line);
		if (!frame) return;

		if (frame.kind === 'error') {
			const p = this.pending[frame.requestId];
			if (p) {
				clearTimeout(p.timer);
				delete this.pending[frame.requestId];
				p.reject(new Error(frame.message));
			} else if (frame.service === 'chat') {
				this.emitChatOrphanError(frame.message);
			}
			return;
		}

		if (frame.kind === 'success') {
			const p = this.pending[frame.requestId];
			if (p) {
				clearTimeout(p.timer);
				delete this.pending[frame.requestId];
				p.resolve(frame.json);
			}
			return;
		}

		if (frame.service === 'chat') {
			this.emitChatEvent(frame.event, frame.json);
			return;
		}

		this.options.onPostsEvent(frame.event, frame.json);
	}

	send(service: WsService, commandLine: string): Promise<unknown> {
		const requestId = genRequestId();
		const timeoutMs = this.options.commandTimeoutMs ?? 60_000;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				delete this.pending[requestId];
				reject(new Error(`${service} command timeout: ${commandLine}`));
			}, timeoutMs);

			this.pending[requestId] = {
				resolve: v => {
					clearTimeout(timer);
					resolve(v);
				},
				reject: e => {
					clearTimeout(timer);
					reject(e);
				},
				timer,
			};

			const lines = `> ${service} ${requestId}\n${commandLine}\n`;
			this.rawSend(lines);
			this.flushQueue();
		});
	}

	/**
	 * `> chat` with no requestId — for commands that do not return success JSON (`/sendmsg` broadcast-only, `/typing`).
	 */
	sendChatFireAndForget(commandLine: string): void {
		const lines = `> chat\n${commandLine}\n`;
		this.rawSend(lines);
		this.flushQueue();
	}

	close() {
		this.rejectAllPending(new Error('WebSocket closed'));
		this.chatListeners = [];
		this.chatOrphanErrorListeners = [];
		this.ws?.close();
		this.ws = null;
		this.buffer = '';
		this.sendQueue = [];
	}
}

/** Set by ContentProvider when the multiplex socket is active (for optional cross-context calls). */
let multiplexSingleton: CreatorsMultiplexWs | null = null;

export function setCreatorsMultiplexSingleton(client: CreatorsMultiplexWs | null) {
	multiplexSingleton = client;
}

export function getCreatorsMultiplexSingleton(): CreatorsMultiplexWs | null {
	return multiplexSingleton;
}
