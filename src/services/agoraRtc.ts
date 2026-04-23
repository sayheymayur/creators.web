import { AGORA_APP_ID, AGORA_TOKEN_ENDPOINT } from '../config/agora';

type AgoraTokenResponse = {
	token?: string,
};

export function stringToAgoraUid(input: string): number {
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = ((hash << 5) - hash) + input.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash) % 2147483647 || Math.floor(Math.random() * 1000000) + 1;
}

export function buildCallChannel(userAId: string, userBId: string): string {
	return ['call', userAId, userBId].sort().join('-').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function buildLiveChannel(streamId: string): string {
	return `live-${streamId}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function fetchAgoraRtcToken(
	channel: string,
	uid: number,
	role: 'host' | 'audience'
): Promise<string | null> {
	if (!AGORA_TOKEN_ENDPOINT) return Promise.resolve(null);

	return globalThis.fetch(AGORA_TOKEN_ENDPOINT, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			channel,
			uid,
			role,
		}),
		credentials: 'include',
	}).then(response => {
		if (!response.ok) return null;
		return response.json() as Promise<AgoraTokenResponse>;
	}).then(payload => payload?.token || null).catch(() => null);
}

export function getAgoraAppId(): string {
	return AGORA_APP_ID;
}
