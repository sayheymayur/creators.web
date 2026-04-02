/** Resolves after `ms` milliseconds (no `await` — project bans AwaitExpression). */
export function delayMs(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}
