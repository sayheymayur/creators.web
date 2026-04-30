export function canUseMediaDevices(): boolean {
	return !!(globalThis.navigator?.mediaDevices?.getUserMedia);
}

export function isDeviceInUseError(err: unknown): boolean {
	const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
	if (name === 'NotReadableError') return true;
	const msg = err instanceof Error ? err.message : String(err ?? '');
	return /device.*in use|in use/i.test(msg);
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
	if (isDeviceInUseError(err)) {
		return new Error('Camera/microphone is already in use in another tab/app. You can still join, but won’t be able to publish from this tab.');
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

