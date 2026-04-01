import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { LiveStream, LiveChatMessage, VirtualGift } from '../types';

export const VIRTUAL_GIFTS: VirtualGift[] = [
	{ id: 'gift-1', name: 'Rose', emoji: '🌹', value: 0.99 },
	{ id: 'gift-2', name: 'Fire', emoji: '🔥', value: 1.99 },
	{ id: 'gift-3', name: 'Star', emoji: '⭐', value: 4.99 },
	{ id: 'gift-4', name: 'Diamond', emoji: '💎', value: 9.99 },
	{ id: 'gift-5', name: 'Crown', emoji: '👑', value: 19.99 },
	{ id: 'gift-6', name: 'Rocket', emoji: '🚀', value: 49.99 },
];

const MOCK_LIVE_STREAMS: LiveStream[] = [
	{
		id: 'live-1',
		creatorId: 'creator-1',
		creatorName: 'Luna Rose',
		creatorAvatar: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
		title: 'Morning workout session (live)',
		viewerCount: 342,
		peakViewers: 420,
		startedAt: new Date(Date.now() - 1800000).toISOString(),
		status: 'live',
		giftsReceived: 28,
		totalGiftValue: 124.50,
		chatMessages: [
			{ id: 'lc-1', userId: 'fan-1', userName: 'Jamie Hart', userAvatar: 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', text: 'Love this stream!', createdAt: new Date(Date.now() - 120000).toISOString() },
			{ id: 'lc-2', userId: 'fan-2', userName: 'Alice Johnson', userAvatar: 'https://images.pexels.com/photos/1382731/pexels-photo-1382731.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', text: 'You look amazing Luna!', createdAt: new Date(Date.now() - 90000).toISOString() },
			{ id: 'lc-3', userId: 'fan-1', userName: 'Jamie Hart', userAvatar: 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', text: '', isGift: true, giftName: 'Diamond', giftValue: 9.99, createdAt: new Date(Date.now() - 60000).toISOString() },
			{ id: 'lc-4', userId: 'fan-3', userName: 'Bob Martinez', userAvatar: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', text: 'How many reps per set?', createdAt: new Date(Date.now() - 30000).toISOString() },
		],
	},
	{
		id: 'live-3',
		creatorId: 'creator-5',
		creatorName: 'Alex Kim',
		creatorAvatar: 'https://images.pexels.com/photos/2269872/pexels-photo-2269872.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop',
		title: 'Late night studio session',
		viewerCount: 891,
		peakViewers: 1200,
		startedAt: new Date(Date.now() - 3600000).toISOString(),
		status: 'live',
		giftsReceived: 76,
		totalGiftValue: 589.20,
		chatMessages: [
			{ id: 'lc-5', userId: 'fan-1', userName: 'Jamie Hart', userAvatar: 'https://images.pexels.com/photos/1040880/pexels-photo-1040880.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', text: 'This beat is fire!!', createdAt: new Date(Date.now() - 200000).toISOString() },
			{ id: 'lc-6', userId: 'fan-2', userName: 'Alice Johnson', userAvatar: 'https://images.pexels.com/photos/1382731/pexels-photo-1382731.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop', text: 'drop the album already!!', createdAt: new Date(Date.now() - 150000).toISOString() },
		],
	},
];

interface LiveStreamState {
	streams: LiveStream[];
	myLiveStream: LiveStream | null;
}

type LiveStreamAction =
	| { type: 'GO_LIVE', payload: LiveStream } |
	{ type: 'END_LIVE', payload: string } |
	{ type: 'ADD_CHAT', payload: { streamId: string, message: LiveChatMessage } } |
	{ type: 'INCREMENT_VIEWERS', payload: { streamId: string, delta: number } } |
	{ type: 'SET_MY_STREAM', payload: LiveStream | null };

function liveReducer(state: LiveStreamState, action: LiveStreamAction): LiveStreamState {
	switch (action.type) {
		case 'GO_LIVE':
			return {
				...state,
				streams: [action.payload, ...state.streams],
				myLiveStream: action.payload,
			};
		case 'END_LIVE':
			return {
				...state,
				streams: state.streams.map(s =>
					s.id === action.payload ? { ...s, status: 'ended', endedAt: new Date().toISOString() } : s
				),
				myLiveStream: state.myLiveStream?.id === action.payload ? null : state.myLiveStream,
			};
		case 'ADD_CHAT':
			return {
				...state,
				streams: state.streams.map(s =>
					s.id === action.payload.streamId ?
						{ ...s, chatMessages: [...s.chatMessages, action.payload.message] } :
						s
				),
				myLiveStream: state.myLiveStream?.id === action.payload.streamId ?
					{ ...state.myLiveStream, chatMessages: [...state.myLiveStream.chatMessages, action.payload.message] } :
					state.myLiveStream,
			};
		case 'INCREMENT_VIEWERS':
			return {
				...state,
				streams: state.streams.map(s =>
					s.id === action.payload.streamId ?
						{ ...s, viewerCount: Math.max(0, s.viewerCount + action.payload.delta) } :
						s
				),
			};
		case 'SET_MY_STREAM':
			return { ...state, myLiveStream: action.payload };
		default:
			return state;
	}
}

interface LiveStreamContextValue {
	state: LiveStreamState;
	goLive: (creatorId: string, creatorName: string, creatorAvatar: string, title: string) => LiveStream;
	endLive: (streamId: string) => void;
	sendChatMessage: (streamId: string, userId: string, userName: string, userAvatar: string, text: string) => void;
	sendGift: (streamId: string, userId: string, userName: string, userAvatar: string, gift: VirtualGift) => void;
	getLiveStreams: () => LiveStream[];
	getStream: (streamId: string) => LiveStream | undefined;
}

const LiveStreamContext = createContext<LiveStreamContextValue | null>(null);

export function LiveStreamProvider({ children }: { children: React.ReactNode }) {
	const [state, dispatch] = useReducer(liveReducer, {
		streams: MOCK_LIVE_STREAMS,
		myLiveStream: null,
	});

	const goLive = useCallback((
		creatorId: string,
		creatorName: string,
		creatorAvatar: string,
		title: string
	): LiveStream => {
		const stream: LiveStream = {
			id: `live-${Date.now()}`,
			creatorId,
			creatorName,
			creatorAvatar,
			title,
			viewerCount: 0,
			peakViewers: 0,
			startedAt: new Date().toISOString(),
			status: 'live',
			giftsReceived: 0,
			totalGiftValue: 0,
			chatMessages: [],
		};
		dispatch({ type: 'GO_LIVE', payload: stream });
		return stream;
	}, []);

	const endLive = useCallback((streamId: string) => {
		dispatch({ type: 'END_LIVE', payload: streamId });
	}, []);

	const sendChatMessage = useCallback((
		streamId: string,
		userId: string,
		userName: string,
		userAvatar: string,
		text: string
	) => {
		const msg: LiveChatMessage = {
			id: `lc-${Date.now()}`,
			userId,
			userName,
			userAvatar,
			text,
			createdAt: new Date().toISOString(),
		};
		dispatch({ type: 'ADD_CHAT', payload: { streamId, message: msg } });
	}, []);

	const sendGift = useCallback((
		streamId: string,
		userId: string,
		userName: string,
		userAvatar: string,
		gift: VirtualGift
	) => {
		const msg: LiveChatMessage = {
			id: `lc-gift-${Date.now()}`,
			userId,
			userName,
			userAvatar,
			text: '',
			isGift: true,
			giftName: gift.name,
			giftValue: gift.value,
			createdAt: new Date().toISOString(),
		};
		dispatch({ type: 'ADD_CHAT', payload: { streamId, message: msg } });
	}, []);

	const getLiveStreams = useCallback(() => {
		return state.streams.filter(s => s.status === 'live');
	}, [state.streams]);

	const getStream = useCallback((streamId: string) => {
		return state.streams.find(s => s.id === streamId);
	}, [state.streams]);

	return (
		<LiveStreamContext.Provider value={{
			state, goLive, endLive, sendChatMessage, sendGift, getLiveStreams, getStream,
		}}
		>
			{children}
		</LiveStreamContext.Provider>
	);
}

export function useLiveStream() {
	const ctx = useContext(LiveStreamContext);
	if (!ctx) throw new Error('useLiveStream must be used within LiveStreamProvider');
	return ctx;
}
