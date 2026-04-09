import { creatorsApi, type UploadKind } from './creatorsApi';

export async function uploadMediaAsset(kind: UploadKind, file: File): Promise<{ assetId: string, fileUrl: string }> {
	return creatorsApi.media.createUpload({
		fileName: file.name,
		mimeType: file.type || 'application/octet-stream',
		sizeBytes: file.size,
		kind,
	}).then(upload => {
		const headers = new Headers(upload.headers ?? {});
		if (file.type) headers.set('Content-Type', file.type);

		return globalThis.fetch(upload.uploadUrl, {
			method: 'PUT',
			body: file,
			headers,
		}).then(putRes => {
			if (!putRes.ok) {
				throw new Error(`Upload failed (HTTP ${putRes.status})`);
			}

			return creatorsApi.media.complete({ assetId: upload.assetId }).then(() => ({
				assetId: upload.assetId,
				fileUrl: upload.fileUrl,
			}));
		});
	});
}
