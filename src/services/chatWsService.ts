import type { CreatorsMultiplexWs } from './creatorsMultiplexWs';
import { assertUuid } from '../utils/isUuid';
import type {
	ChatJoinLeaveResponse,
	ChatSendMsgAckResponse,
	GetMessagesResponse,
} from './chatWsTypes';

const MSG_MIN = 1;
const MSG_MAX = 16_384;

function assertMessageBody(body: string): string {
	if (body.trim().length < MSG_MIN || body.length > MSG_MAX) {
		throw new Error(`Message must be ${MSG_MIN}–${MSG_MAX} characters`);
	}
	return body;
}

export function chatJoinRoom(client: CreatorsMultiplexWs, roomUuid: string): Promise<ChatJoinLeaveResponse> {
	const id = assertUuid(roomUuid);
	return client.send('chat', `/joinroom ${id}`).then(json => json as ChatJoinLeaveResponse);
}

export function chatLeaveRoom(client: CreatorsMultiplexWs, roomUuid: string): Promise<ChatJoinLeaveResponse> {
	const id = assertUuid(roomUuid);
	return client.send('chat', `/leaveroom ${id}`).then(json => json as ChatJoinLeaveResponse);
}

export function chatGetMessages(
	client: CreatorsMultiplexWs,
	roomUuid: string,
	limit?: number,
	beforeCursor?: string
): Promise<GetMessagesResponse> {
	const id = assertUuid(roomUuid);
	let cmd = `/getmessages ${id}`;
	const lim =
		limit !== undefined ?
			limit :
			beforeCursor !== undefined && beforeCursor !== '' ?
				30 :
				undefined;
	if (lim !== undefined) {
		if (!Number.isInteger(lim) || lim < 1 || lim > 100) {
			throw new Error('limit must be an integer 1–100');
		}
		cmd += ` ${lim}`;
	}
	if (beforeCursor !== undefined && beforeCursor !== '') {
		if (lim === undefined) cmd += ` 30`;
		cmd += ` ${beforeCursor}`;
	}
	return client.send('chat', cmd).then(json => json as GetMessagesResponse);
}

/**
 * @param withAck If true, uses `> chat <requestId>` and resolves with server ack. If false, fire-and-forget (only `newmessage` broadcast).
 */
export function chatSendMsg(
	client: CreatorsMultiplexWs,
	roomUuid: string,
	messageText: string,
	withAck: boolean
): Promise<ChatSendMsgAckResponse | undefined> {
	const id = assertUuid(roomUuid);
	const body = assertMessageBody(messageText);
	const cmd = `/sendmsg ${id} ${body}`;
	if (withAck) {
		return client.send('chat', cmd).then(json => json as ChatSendMsgAckResponse);
	}
	client.sendChatFireAndForget(cmd);
	return Promise.resolve(undefined);
}

/** No success frame — errors may still arrive as `|chat|error|...` (orphan listener). */
export function chatTyping(client: CreatorsMultiplexWs, roomUuid: string, active: boolean): void {
	const id = assertUuid(roomUuid);
	const cmd = active ? `/typing ${id}` : `/typing ${id} 0`;
	client.sendChatFireAndForget(cmd);
}
