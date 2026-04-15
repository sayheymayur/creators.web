# WebSocket client (`WsClient`) and React integration

This app uses a **single shared WebSocket** managed by `WsClient` (`src/services/wsClient.ts`). The wire format is **Showdown-style**: pick a **service**, send **commands**, and receive **responses** or **server-pushed events**. Parsing lives in `src/services/wsProtocol.ts`.

## React setup

`WsProvider` wraps the app (inside `AuthProvider` in `src/App.tsx`). It:

- Constructs one `WsClient` with `getToken: () => getSessionToken()` so the socket URL can include a `token` query param when needed.
- Calls `client.connect()` on mount.
- Calls `client.refreshAuth()` when auth state changes so a logged-in JWT is sent on the socket (`notify('user', 'authenticate', [jwt])`) after connect/reconnect.
- In **development**, does **not** disconnect on StrictMode’s fake unmount (avoids tearing down the socket mid-handshake). In production, it disconnects on unmount.

Use the client from any descendant component:

```tsx
import { useWs } from '../context/WsContext';

export function Example() {
	const ws = useWs();

	useEffect(() => {
		const off = ws.on('chat', 'message', (data, frame) => {
			console.log('chat message event', data, frame.service, frame.event);
		});
		return off;
	}, [ws]);

	return null;
}
```

## Configuration

| Source | Effect |
|--------|--------|
| `VITE_WS_URL` | If set (e.g. `wss://creatorsapi.example.com/ws`), used as the full WebSocket URL. |
| `VITE_WS_PATH` | If no `VITE_WS_URL`, path defaults to `/ws` (or this env value) on **current host** (`ws:` / `wss:` from `window.location`). |
| `WsClient` options | `url`, `wsPath`, or `getToken` override defaults. `getToken` is also used to append `?token=…` when building URL from host+path. |

## Connection behavior

- **One socket** per `WsClient` instance (one per app via `WsProvider`).
- **Send queue**: while disconnected, string payloads are queued and flushed after `onopen`.
- **Reconnect**: on close/error, exponential backoff (500ms → cap 8000ms) until connected again.
- **`request` promises**: if the socket closes, all pending requests reject with `Error('Socket closed')`.

## Wire protocol (summary)

Outgoing messages are **lines**:

1. **Service line** — switch which backend module handles the following commands: `>service` or `>service req123` (with optional request id for request/response).
2. **Command line** — `/command` or `/command arg1 arg2` (args are space-separated strings; encode complex data yourself, e.g. JSON in one arg).

`WsClient` tracks `currentService` and only repeats `>service` when the service changes (optimization for multiple commands to the same service).

Incoming lines are **pipe-delimited frames** parsed by `parseFrame`:

| Shape | Meaning |
|-------|---------|
| `\|service\|event\|{json}` | **Event** — fan-out to `on(service, event, …)` and `onAny`. |
| `\|service\|command\|requestId\|{json}` | **Response** — resolves the `request()` promise for `requestId`. |
| `\|service\|error\|requestId\|message` | **Error** — rejects the `request()` promise. |

See `src/services/wsProtocol.ts` for exact parsing rules.

## `WsClient` API

### `connect()` / `disconnect()`

Start or stop the socket. Normally you only use what `WsProvider` does; call these if you build a standalone client (e.g. tests).

### `request(service, command, args?, requestId?)`

Sends a **request** that expects a **response** with the same `requestId`. Returns a `Promise<unknown>` (parsed JSON from the response frame). Rejects if not connected, on error frames, or on socket close.

```ts
const ws = useWs();

async function loadRoom(roomId: string) {
	try {
		const data = await ws.request('chat', 'join', [roomId]);
		console.log('joined', data);
	} catch (e) {
		console.error(e);
	}
}
```

### `notify(service, command, args?)`

Fire-and-forget: no `requestId`, no promise. Used after login for `refreshAuth()` (`user` + `authenticate`). Same service-line optimization as above.

### `authenticate(jwt, requestId?)`

Convenience for `request('user', 'authenticate', [jwt], requestId)`.

### `refreshAuth()`

Reads token from `getToken()`, skips if unchanged, and if connected sends `notify('user', 'authenticate', [token])`. Called by `WsProvider` when auth changes and after reconnect.

### `send(message: string)`

Low-level: sends a raw string (still goes through the send queue). Prefer `request` / `notify` unless you fully control the protocol.

### Subscribers: `on(service, event, listener)` and `onAny(listener)`

- **`on(service, event, listener)`** — `listener(data, frame)` for **event** frames only, matched by `service` + `event`. Returns an **unsubscribe** function.
- **`onAny(listener)`** — `listener(frame)` for every parsed frame (response, error, event). Returns **unsubscribe**.

Always unsubscribe in `useEffect` cleanup to avoid leaks:

```tsx
useEffect(() => {
	const unsub = ws.on('live', 'viewerCount', (data) => {
		console.log('viewers', data);
	});
	return unsub;
}, [ws]);
```

```tsx
useEffect(() => {
	return ws.onAny((frame) => {
		if (frame.type === 'event') {
			console.debug('event', frame.service, frame.event, frame.data);
		}
	});
}, [ws]);
```

## Development: `window.CW`

In dev, `WsProvider` attaches helpers for the browser console:

```js
// After the app loads (dev only)
window.CW.ws          // same WsClient instance
window.CW.parseFrame  // parse a single line for debugging
```

Example:

```js
window.CW.parseFrame('|chat|message|{"text":"hi"}')
```

## Minimal end-to-end example

```tsx
import { useEffect, useState } from 'react';
import { useWs } from '../context/WsContext';

export function LiveCounter() {
	const ws = useWs();
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
		const off = ws.on('live', 'stats', (data) => {
			if (data && typeof data === 'object' && 'viewers' in data) {
				setCount(Number((data as { viewers: number }).viewers));
			}
		});
		return off;
	}, [ws]);

	useEffect(() => {
		if (!ws.isConnected) return;
		void ws.request('live', 'subscribe', ['channel-1']).catch(console.error);
	}, [ws.isConnected, ws]);

	return <p>Viewers: {count ?? '—'}</p>;
}
```

(Exact `service` / `command` / event names depend on your backend.)

## Files

| File | Role |
|------|------|
| `src/services/wsClient.ts` | `WsClient`, connection queue, reconnect, listeners |
| `src/services/wsProtocol.ts` | `parseFrame`, `formatServiceLine`, `formatCommandLine`, `WsFrame` types |
| `src/context/WsContext.tsx` | `WsProvider`, `useWs`, dev `window.CW` |
