import type { AgoraRtcCredentials } from './sessionsWsTypes';

/**
 * Backend live spec (`public_lives` table).
 *
 * Frames:
 * - Response: |live|<command>|<requestId>|<JSON>
 * - Event:    |live|<event>|<JSON>
 *
 * Commands:
 * - /golive <visibility> [title]
 * - /joinlive <liveId>
 * - /endlive
 * - /listlive
 *
 * Events:
 * - live|started   (fanout to everyone OR targeted by visibility)
 * - live|ended
 *
 * Chat for the live uses the existing `chat` service over the same `room_id`.
 */

export type LiveVisibility = 'everyone' | 'followers' | 'subscribers';

export type LiveStatus = 'live' | 'ended';

export interface LivePublic {
	live_id: string;
	creator_user_id: string;
	room_id: string;
	visibility: LiveVisibility;
	title: string;
	status: LiveStatus;
	started_at: string;
	ended_at?: string | null;
}

export interface LiveWithAgora extends LivePublic {
	agora: AgoraRtcCredentials;
}

export interface LiveEndLiveResponse {
	ok: true;
	live: LivePublic;
}

export interface LiveListLiveResponse {
	lives: LivePublic[];
}

export type LiveStartedEvent = LivePublic;

export interface LiveEndedEvent {
	live_id: string;
	room_id: string;
	ended_at?: string;
}
