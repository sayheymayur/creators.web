import { creatorsApi, type UploadKind } from './creatorsApi';

/**
 * Backend spec:
 * - POST /media/uploads => { assetId, uploadUrl, fileUrl, headers? }
 * - Upload with PUT uploadUrl and include headers exactly if provided.
 * - POST /media/complete with assetId
 */
export function uploadPostMediaFile(file: File, kind: UploadKind): Promise<string> {
	return creatorsApi.media.createUpload({
		fileName: file.name,
		mimeType: file.type || 'application/octet-stream',
		sizeBytes: file.size,
		kind,
	}).then(created => {
		const headers = new Headers(created.headers ?? {});
		// Only set Content-Type if backend didn't provide it.
		if (file.type && !headers.has('Content-Type') && !headers.has('content-type')) {
			headers.set('Content-Type', file.type);
		}

		// Some upload servers fail on fetch() uploads because the browser may use
		// Transfer-Encoding: chunked. XHR typically sends Content-Length.
		const putViaXhr = (): Promise<void> =>
			new Promise((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.open('PUT', created.uploadUrl);

				headers.forEach((value, key) => {
					try { xhr.setRequestHeader(key, value); } catch {}
				});

				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) resolve();
					else reject(new Error(`Upload failed (HTTP ${xhr.status})`));
				};
				xhr.onerror = () => reject(new Error('Upload failed (network error)'));
				xhr.ontimeout = () => reject(new Error('Upload failed (timeout)'));
				xhr.send(file);
			});

		return putViaXhr().then(() =>
			creatorsApi.media.complete({ assetId: created.assetId }).then(() => created.assetId)
		);
	});
}
