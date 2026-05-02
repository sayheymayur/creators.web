/**
 * AuthProvider sits above WsProvider, so logout cannot use useWs().
 * WsProvider registers teardown here; AuthContext invokes it after HTTP + local session clear.
 */
type WsTeardownFn = () => Promise<void>;

let teardown: WsTeardownFn | null = null;

export function registerCreatorsWsTeardown(fn: WsTeardownFn | null): void {
	teardown = fn;
}

export function runCreatorsWsTeardown(): Promise<void> {
	if (!teardown) return Promise.resolve();
	return teardown().catch(() => {});
}
