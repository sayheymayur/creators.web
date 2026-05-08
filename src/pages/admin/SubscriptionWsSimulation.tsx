import { useEffect, useMemo, useRef, useState } from 'react';
import { Layout } from '../../components/layout/Layout';
import { WsClient } from '../../services/wsClient';

type LogLine = { ts: string, who: 'fan' | 'creator', dir: 'in' | 'out', text: string };

function nowTs(): string {
	const d = new Date();
	return d.toISOString().slice(11, 19);
}

function parseCommandLine(line: string): { command: string, args: string[] } {
	const trimmed = line.trim();
	const parts = trimmed.split(' ').filter(Boolean);
	const cmdRaw = parts[0] ?? '';
	const command = cmdRaw.startsWith('/') ? cmdRaw.slice(1) : cmdRaw;
	return { command, args: parts.slice(1) };
}

function DevClientPanel(props: {
	title: string,
	client: WsClient,
	who: 'fan' | 'creator',
	onLog: (l: LogLine) => void,
}) {
	const { title, client, who, onLog } = props;
	const [jwt, setJwt] = useState('');
	const [service, setService] = useState('user');
	const [commandLine, setCommandLine] = useState('/authenticate');
	const [connecting, setConnecting] = useState(false);

	useEffect(() => {
		return client.onAny(frame => {
			if (frame.type === 'event') {
				onLog({ ts: nowTs(), who, dir: 'in', text: `|${frame.service}|${frame.event}|${JSON.stringify(frame.data)}` });
				return;
			}
			if (frame.type === 'response') {
				onLog({ ts: nowTs(), who, dir: 'in', text: `|${frame.service}|${frame.command}|${frame.requestId}|${JSON.stringify(frame.data)}` });
				return;
			}
			onLog({ ts: nowTs(), who, dir: 'in', text: `|${frame.service}|error|${frame.requestId}|${frame.message}` });
		});
	}, [client, who, onLog]);

	const connected = client.isConnected;

	function connect() {
		setConnecting(true);
		try {
			client.connect();
		} finally {
			window.setTimeout(() => setConnecting(false), 350);
		}
	}

	function authenticate() {
		const t = jwt.trim();
		if (!t) return;
		onLog({ ts: nowTs(), who, dir: 'out', text: `> user\n/authenticate <jwt>` });
		void client.authenticate(t).catch(e => {
			onLog({ ts: nowTs(), who, dir: 'in', text: `[error] ${e instanceof Error ? e.message : String(e)}` });
		});
	}

	function send() {
		const svc = service.trim();
		const line = commandLine.trim();
		if (!svc || !line) return;
		const { command, args } = parseCommandLine(line);
		onLog({ ts: nowTs(), who, dir: 'out', text: `> ${svc}\n/${command} ${args.join(' ')}`.trim() });
		void client.request(svc, command, args).catch(e => {
			onLog({ ts: nowTs(), who, dir: 'in', text: `[error] ${e instanceof Error ? e.message : String(e)}` });
		});
	}

	return (
		<div className="bg-surface border border-border/20 rounded-2xl p-4 space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-semibold text-foreground">{title}</p>
					<p className="text-xs text-muted">{connected ? 'Connected' : 'Disconnected'}</p>
				</div>
				<button
					type="button"
					onClick={connect}
					disabled={connecting}
					className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-foreground/10 hover:bg-foreground/15 text-foreground disabled:opacity-50"
				>
					Connect
				</button>
			</div>

			<div className="space-y-2">
				<label className="block text-xs text-muted">JWT</label>
				<input
					value={jwt}
					onChange={e => setJwt(e.target.value)}
					placeholder="paste jwt…"
					className="w-full bg-input border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
				/>
				<button
					type="button"
					onClick={authenticate}
					disabled={!connected || !jwt.trim()}
					className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 disabled:opacity-50"
				>
					/authenticate
				</button>
			</div>

			<div className="grid grid-cols-3 gap-2">
				<div className="col-span-1">
					<label className="block text-xs text-muted mb-1">Service</label>
					<input
						value={service}
						onChange={e => setService(e.target.value)}
						className="w-full bg-input border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
					/>
				</div>
				<div className="col-span-2">
					<label className="block text-xs text-muted mb-1">Command</label>
					<input
						value={commandLine}
						onChange={e => setCommandLine(e.target.value)}
						placeholder="/get 123"
						className="w-full bg-input border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
					/>
				</div>
			</div>
			<button
				type="button"
				onClick={send}
				disabled={!connected}
				className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-foreground/10 hover:bg-foreground/15 text-foreground disabled:opacity-50"
			>
				Send request
			</button>
		</div>
	);
}

export function SubscriptionWsSimulation() {
	const [creatorUserId, setCreatorUserId] = useState('');
	const [logs, setLogs] = useState<LogLine[]>([]);
	const listRef = useRef<HTMLDivElement | null>(null);

	const fanClient = useMemo(() => new WsClient({ getToken: () => null }), []);
	const creatorClient = useMemo(() => new WsClient({ getToken: () => null }), []);

	useEffect(() => {
		listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
	}, [logs.length]);

	const append = (l: LogLine) => setLogs(prev => [...prev, l].slice(-500));

	function runFanSanity() {
		const id = creatorUserId.trim();
		if (!id) return;
		append({ ts: nowTs(), who: 'fan', dir: 'out', text: `> creator\n/get ${id}` });
		void fanClient.request('creator', 'get', [id]).catch(() => {});
		append({ ts: nowTs(), who: 'fan', dir: 'out', text: `> subscription\n/get ${id}` });
		void fanClient.request('subscription', 'get', [id]).catch(() => {});
	}

	function runWalletSubscribe() {
		const id = creatorUserId.trim();
		if (!id) return;
		append({ ts: nowTs(), who: 'fan', dir: 'out', text: `> subscription\n/subscribe ${id} true` });
		void fanClient.request('subscription', 'subscribe', [id, 'true']).catch(() => {});
	}

	function runCheckoutSubscribe() {
		const id = creatorUserId.trim();
		if (!id) return;
		append({ ts: nowTs(), who: 'fan', dir: 'out', text: `> payment\n/createorder 49900 INR purpose=subscription creatorUserId=${id}` });
		void fanClient.request('payment', 'createorder', ['49900', 'INR', 'purpose=subscription', `creatorUserId=${id}`])
			.then(resp => {
				const r = resp as { orderId?: string };
				const orderId = String(r.orderId ?? '').trim();
				if (!orderId) return;
				append({ ts: nowTs(), who: 'fan', dir: 'out', text: `> payment\n/confirm ${orderId} pay_dummy sig_dummy` });
				return fanClient.request('payment', 'confirm', [orderId, 'pay_dummy', 'sig_dummy']);
			})
			.catch(() => {});
	}

	function runCreatorList() {
		append({ ts: nowTs(), who: 'creator', dir: 'out', text: '> subscription\n/listsubscribers 30' });
		void creatorClient.request('subscription', 'listsubscribers', ['30']).catch(() => {});
	}

	return (
		<Layout>
			<div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
				<div>
					<h1 className="text-xl font-bold text-foreground">Subscription WS simulation</h1>
					<p className="text-sm text-muted">
						This is an in-app runnable playground for the backend’s line-oriented WebSocket protocol (fan + creator sockets).
					</p>
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl p-4">
					<label className="block text-xs text-muted mb-1">CREATOR_USER_ID</label>
					<input
						value={creatorUserId}
						onChange={e => setCreatorUserId(e.target.value)}
						placeholder="numeric string id"
						className="w-full bg-input border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/40"
					/>
					<div className="flex flex-wrap gap-2 mt-3">
						<button
							type="button"
							onClick={runFanSanity}
							className="text-xs font-semibold px-3 py-2 rounded-xl bg-foreground/10 hover:bg-foreground/15"
						>
							Fan sanity: creator/get + subscription/get
						</button>
						<button
							type="button"
							onClick={runWalletSubscribe}
							className="text-xs font-semibold px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300"
						>
							Wallet subscribe
						</button>
						<button
							type="button"
							onClick={runCheckoutSubscribe}
							className="text-xs font-semibold px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-200"
						>
							Dummy checkout subscribe
						</button>
						<button
							type="button"
							onClick={runCreatorList}
							className="text-xs font-semibold px-3 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-200"
						>
							Creator: listsubscribers
						</button>
						<button
							type="button"
							onClick={() => setLogs([])}
							className="text-xs font-semibold px-3 py-2 rounded-xl bg-foreground/5 hover:bg-foreground/10 text-muted"
						>
							Clear log
						</button>
					</div>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<DevClientPanel title="Fan socket" client={fanClient} who="fan" onLog={append} />
					<DevClientPanel title="Creator socket" client={creatorClient} who="creator" onLog={append} />
				</div>

				<div className="bg-surface border border-border/20 rounded-2xl p-4">
					<div className="flex items-center justify-between mb-2">
						<p className="text-sm font-semibold text-foreground">Frames</p>
						<p className="text-xs text-muted">{logs.length} lines</p>
					</div>
					<div ref={listRef} className="h-[360px] overflow-auto rounded-xl bg-background/40 border border-border/10 p-3">
						{logs.length === 0 ? (
							<p className="text-xs text-muted">No frames yet.</p>
						) : (
							<div className="space-y-1">
								{logs.map((l, i) => (
									<div key={i} className="text-[11px] font-mono whitespace-pre-wrap break-words">
										<span className="text-muted">{l.ts}</span>{' '}
										<span className={l.who === 'fan' ? 'text-rose-300' : 'text-blue-200'}>{l.who}</span>{' '}
										<span className="text-muted">{l.dir === 'out' ? '>>' : '<<'}</span>{' '}
										<span className="text-foreground/80">{l.text}</span>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</Layout>
	);
}
