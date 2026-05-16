export type SessionKind = 'call' | 'chat';

/** v4 C2: voice-only vs camera call (only when kind === 'call'). */
export type CallModality = 'audio' | 'video';

export type SessionsSettlement = {
	escrow_cents: string,
	settled_cents: string,
	refund_cents: string,
	per_minute_rate_minor: string | null,
};

export type AgoraRtcCredentials = {
	app_id: string,
	channel_name: string,
	uid: number,
	token: string,
	token_ttl_sec: number,
	expires_at: string,
	dummy?: true,
};

export type CallSessionSnapshot = {
	id: string,
	room_id: string,
	initiator_id: string,
	state: string,
	offer?: unknown,
	answer?: unknown,
	ice?: unknown[],
};

export type CreatorSummary = {
	id: string,
	user_id: string,
	username: string,
	name: string,
	avatar_url: string | null,
	categories: string[],
};

export type SessionFeedback = {
	id: string,
	request_id: string,
	user_id: string,
	rating: number,
	comment: string | null,
	created_at: string,
	updated_at: string,
};

// Command responses
export type SessionsRequestResponse = {
	request_id: string,
	status: 'pending',
	price_cents: string,
	kind: SessionKind,
	call_modality?: CallModality,
	per_minute_rate_minor?: string | null,
	duration_minutes?: number,
};

export type SessionsAcceptedPayload = {
	request_id: string,
	room_id: string,
	kind: SessionKind,
	call_session_id: string | null,
	session: CallSessionSnapshot | null,
	agora: AgoraRtcCredentials | null,
	/** New timed-session fields (may be present depending on backend build). */
	started_at?: string | null,
	ends_at?: string | null,
	duration_minutes?: number,
	price_cents?: string,
	call_modality?: CallModality,
	per_minute_rate_minor?: string | null,
};

export type SessionsRejectedPayload = {
	request_id: string,
	message: string,
	alternatives: CreatorSummary[],
};

export type SessionsCancelResponse = { ok: true };

export type SessionsCompleteResponse =
	| { ok: true, settlement?: SessionsSettlement } |
	{ ok: true, alreadyCompleted: true, settlement?: SessionsSettlement };

export type SessionsEndSessionResponse =
	| { ok: true, alreadyCompleted: true } |
	{
		ok: true,
		callEnded: {
			session_id: string,
			room_id: string,
		},
	};

export type SessionsFeedbackResponse = {
	feedback: SessionFeedback,
};

// Push events (no requestId)
export type SessionsRequestEvent = {
	request_id: string,
	fan_user_id: string,
	fan_display: string,
	kind: SessionKind,
	price_cents: string,
	created_at: string,
	call_modality?: CallModality,
	duration_minutes?: number,
	per_minute_rate_minor?: string | null,
};

export type SessionsFeedbackPromptEvent = {
	request_id: string,
};

export type SessionsFeedbackReceivedEvent = {
	request_id: string,
	from_user_id: string,
	rating: number,
};

export type SessionsTimerEvent = {
	request_id: string,
	room_id: string,
	started_at?: string,
	ends_at: string,
	remaining_sec: number,
};

export type SessionsEndedEvent = {
	request_id: string,
	room_id: string,
	reason?: 'timeout' | 'manual',
};

/**
 * `/state` response row — used to restore outgoing/incoming/active bookings after reconnect.
 * Matches the spec transcript (string ids, ISO timestamps).
 */
export type SessionsBookingRow = {
	id: string,
	fan_user_id: string,
	creator_user_id: string,
	kind: SessionKind,
	status: 'pending' | 'accepted' | 'completed' | 'cancelled',
	price_cents: string,
	duration_minutes: number,
	room_id: string | null,
	call_session_id: string | null,
	started_at: string | null,
	ends_at: string | null,
	completed_at: string | null,
	created_at: string,
	updated_at: string,
	call_modality?: CallModality,
	per_minute_rate_minor?: string | null,
};

export type SessionsStateResponse = {
	outgoing: SessionsBookingRow[],
	incoming: SessionsBookingRow[],
	active: SessionsBookingRow[],
};
