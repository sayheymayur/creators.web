export function isPostsMockMode(): boolean {
	// Posts must always use the real WebSocket protocol (no mock mode).
	return false;
}
