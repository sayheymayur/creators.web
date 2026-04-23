export interface ChatMessageDTO {
	id: string;
	room_id: string;
	user_id: string;
	body: string;
	created_at: string;
}

export interface ChatTypingEventPayload {
	room_id: string;
	user_id: string;
	active: boolean;
}

export interface ChatJoinLeaveResponse {
	ok: boolean;
	room_id: string;
}

export interface ChatSendMsgAckResponse {
	ok: boolean;
	message: ChatMessageDTO;
}

export interface GetMessagesResponse {
	recentCache: ChatMessageDTO[];
	page: ChatMessageDTO[];
	nextCursor: string | null;
}
