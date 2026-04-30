export function canUseMediaDevices(): boolean {
	return !!(globalThis.navigator?.mediaDevices?.getUserMedia);
}

function stopTracks(stream: MediaStream) {
	stream.getTracks().forEach(t => {
		try { t.stop(); } catch { /* noop */ }
	});
}

function toUserFacingError(err: unknown, wantsVideo: boolean): Error {
	const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
	const isDenied =
		name === 'NotAllowedError' ||
		name === 'PermissionDeniedError';
	if (isDenied) {
		return new Error(wantsVideo ? 'Camera/microphone permission is required to join this call.' : 'Microphone permission is required to join this call.');
	}
	const isNotFound = name === 'NotFoundError' || name === 'DevicesNotFoundError';
	if (isNotFound) {
		return new Error(wantsVideo ? 'No camera/microphone found on this device.' : 'No microphone found on this device.');
	}
	return err instanceof Error ? err : new Error('Unable to access camera/microphone.');
}

export async function ensureMediaPermissions(opts: { audio: boolean, video: boolean }): Promise<void> {
	const audio = !!opts.audio;
	const video = !!opts.video;
	if (!audio && !video) return;
	if (!canUseMediaDevices()) {
		throw new Error('Media permissions are not supported in this browser.');
	}

	let stream: MediaStream | null = null;
	try {
		stream = await globalThis.navigator.mediaDevices.getUserMedia({
			audio,
			video,
		});
	} catch (e) {
		throw toUserFacingError(e, video);
	} finally {
		if (stream) stopTracks(stream);
	}
}

