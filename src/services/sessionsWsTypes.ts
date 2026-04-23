export type SessionKind = 'call' | 'chat';

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
};

export type SessionsAcceptedPayload = {
	request_id: string,
	room_id: string,
	kind: SessionKind,
	call_session_id: string | null,
	session: CallSessionSnapshot | null,
	agora: AgoraRtcCredentials | null,
};

export type SessionsRejectedPayload = {
	request_id: string,
	message: string,
	alternatives: CreatorSummary[],
};

export type SessionsCancelResponse = { ok: true };

export type SessionsCompleteResponse =
	| { ok: true } |
	{ ok: true, alreadyCompleted: true };

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
};

export type SessionsFeedbackPromptEvent = {
	request_id: string,
};

export type SessionsFeedbackReceivedEvent = {
	request_id: string,
	from_user_id: string,
	rating: number,
};
