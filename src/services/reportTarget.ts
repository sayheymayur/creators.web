import { creatorsApi, type CreateReportResponse, type ReportTargetType } from './creatorsApi';
import type { WsClient } from './wsClient';
import { userWsSubmitReport } from './userWsService';

export type { ReportTargetType };

export interface SubmitReportTransport {
	ws: WsClient;
	wsConnected: boolean;
	wsAuthReady: boolean;
}

function buildHttpBody(opts: {
	targetType: ReportTargetType,
	targetId: string,
	reason: string,
	details?: string,
}) {
	const reason = opts.reason.trim();
	const details = opts.details?.trim();
	return {
		targetType: opts.targetType,
		targetId: String(opts.targetId),
		reason: reason.slice(0, 64),
		details: details ? details.slice(0, 4000) : undefined,
	};
}

/** WS `/submitreport` only accepts numeric `targetId` tokens; UUID message ids must use HTTP. */
function canSubmitReportOverWs(opts: { targetId: string, details?: string }): boolean {
	if (opts.details?.trim()) return false;
	return /^\d+$/.test(String(opts.targetId).trim());
}

/**
 * Unified moderation queue: `user /submitreport` when details are empty and `targetId` is numeric;
 * otherwise `POST /reports`. Falls back to HTTP if the socket path fails (compat / resilience).
 */
export function submitReport(
	opts: {
		targetType: ReportTargetType,
		targetId: string,
		reason: string,
		details?: string,
	},
	transport?: SubmitReportTransport
): Promise<CreateReportResponse> {
	const reason = opts.reason.trim();
	if (!reason.length) {
		return Promise.reject(new Error('Reason is required'));
	}
	const body = buildHttpBody({ ...opts, reason });

	const http = (): Promise<CreateReportResponse> => creatorsApi.reports.create(body);

	if (!canSubmitReportOverWs(opts) || !transport?.wsConnected || !transport?.wsAuthReady) {
		return http();
	}

	return userWsSubmitReport(transport.ws, {
		targetType: body.targetType,
		targetId: body.targetId,
		reason: body.reason,
	}).then(
		res => res,
		() => http()
	);
}
