export type CallSessionState = 'pending' | 'active' | 'ended' | (string & {});

/**
 * Session snapshot returned by `/start` and embedded in `sessionstarted` events.
 * `offer`/`answer`/`ice` are stored as unknown JSON values by the backend.
 */
export interface CallSessionSnapshot {
	id: string; // numeric string (call_sessions.id)
	room_id: string; // UUID
	initiator_id: string; // user id
	state: CallSessionState;
	offer?: unknown;
	answer?: unknown;
	ice: unknown[];
}

export interface CallOkResponse {
	ok: true;
}

export interface CallSessionStartedEventPayload {
	room_id: string;
	session: CallSessionSnapshot;
}

export interface CallOfferEventPayload {
	session_id: string;
	room_id: string;
	offer: unknown;
}

export interface CallAnswerEventPayload {
	session_id: string;
	room_id: string;
	answer: unknown;
}

export interface CallIceEventPayload {
	session_id: string;
	room_id: string;
	candidate: unknown;
}

export interface CallEndedEventPayload {
	session_id: string;
	room_id?: string;
}
