export type UserRole = 'fan' | 'creator' | 'admin';
export type CallType = 'audio' | 'video';
export type SessionType = 'chat' | 'audio' | 'video';
export type SessionStatus = 'pending' | 'active' | 'ended' | 'cancelled';
export type LiveStreamStatus = 'offline' | 'live' | 'ended';

export interface SessionDurationOption {
	minutes: number;
	label: string;
}

export interface TimedSession {
	id: string;
	type: SessionType;
	creatorId: string;
	creatorName: string;
	creatorAvatar: string;
	fanId: string;
	fanName: string;
	durationMinutes: number;
	ratePerMinute: number;
	totalCost: number;
	startedAt: string;
	endedAt?: string;
	actualDurationSeconds?: number;
	refundAmount?: number;
	status: SessionStatus;
	earnings: number;
}

export interface LiveStream {
	id: string;
	creatorId: string;
	creatorName: string;
	creatorAvatar: string;
	title: string;
	viewerCount: number;
	peakViewers: number;
	startedAt: string;
	endedAt?: string;
	status: LiveStreamStatus;
	giftsReceived: number;
	totalGiftValue: number;
	chatMessages: LiveChatMessage[];
}

export interface LiveChatMessage {
	id: string;
	userId: string;
	userName: string;
	userAvatar: string;
	text: string;
	isGift?: boolean;
	giftName?: string;
	giftValue?: number;
	createdAt: string;
}

export interface VirtualGift {
	id: string;
	name: string;
	emoji: string;
	value: number;
}
export type CallStatus = 'idle' | 'ringing' | 'connecting' | 'active' | 'ended' | 'missed' | 'declined';
export type CallDirection = 'incoming' | 'outgoing';

export interface CallRecord {
	id: string;
	type: CallType;
	direction: CallDirection;
	status: CallStatus;
	participantId: string;
	participantName: string;
	participantAvatar: string;
	startedAt: string;
	endedAt?: string;
	durationSeconds?: number;
}

export interface ActiveCall {
	id: string;
	type: CallType;
	direction: CallDirection;
	status: CallStatus;
	participantId: string;
	participantName: string;
	participantAvatar: string;
	startedAt: string;
	isMuted: boolean;
	isCameraOff: boolean;
	isSpeakerOn: boolean;
}
export type KYCStatus = 'pending' | 'approved' | 'rejected' | 'not_submitted';
export type PostType = 'image' | 'video' | 'text';
export type TransactionType = 'subscription' | 'tip' | 'ppv' | 'deposit' | 'withdrawal' | 'session' | 'gift' | 'refund';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export interface User {
	id: string;
	email: string;
	name: string;
	username: string;
	avatar: string;
	// Optional creator-profile fields. These may be returned for creators depending on backend shape,
	// and are updated via POST /me/profile in the frontend.
	bio?: string;
	banner?: string;
	category?: string;
	role: UserRole;
	createdAt: string;
	isAgeVerified: boolean;
	status: AccountStatus;
	walletBalance: number;
}

export interface Creator extends User {
	bio: string;
	banner: string;
	subscriptionPrice: number;
	totalEarnings: number;
	monthlyEarnings: number;
	tipsReceived: number;
	subscriberCount: number;
	kycStatus: KYCStatus;
	isKYCVerified: boolean;
	category: string;
	isOnline: boolean;
	postCount: number;
	likeCount: number;
	monthlyStats: MonthlyStats[];
	perMinuteRate: number;
	liveStreamEnabled: boolean;
}

export interface MonthlyStats {
	month: string;
	earnings: number;
	subscribers: number;
	tips: number;
}

export interface Post {
	id: string;
	creatorId: string;
	creatorName: string;
	creatorAvatar: string;
	creatorUsername: string;
	type: PostType;
	text: string;
	mediaUrl?: string;
	thumbnailUrl?: string;
	isLocked: boolean;
	isPPV: boolean;
	ppvPrice?: number;
	likes: number;
	likedBy: string[];
	comments: Comment[];
	/** Server `comment_count` on PostDTO; used before comments are loaded. */
	commentCount: number;
	createdAt: string;
	isPinned: boolean;
	unlockedBy: string[];
}

export interface Comment {
	id: string;
	userId: string;
	userName: string;
	userAvatar: string;
	text: string;
	createdAt: string;
	likes: number;
}

export interface Message {
	id: string;
	conversationId: string;
	senderId: string;
	senderName: string;
	senderAvatar: string;
	content: string;
	mediaUrl?: string;
	isPaid: boolean;
	price?: number;
	isUnlocked: boolean;
	createdAt: string;
	isSeen: boolean;
}

export interface Conversation {
	id: string;
	participantIds: string[];
	participantNames: string[];
	participantAvatars: string[];
	lastMessage: string;
	lastMessageTime: string;
	unreadCount: number;
	isOnline: boolean;
}

export interface Transaction {
	id: string;
	userId: string;
	type: TransactionType;
	amount: number;
	createdAt: string;
	description: string;
	recipientId?: string;
	recipientName?: string;
	status: 'completed' | 'pending' | 'failed';
}

export interface Subscription {
	id: string;
	userId: string;
	creatorId: string;
	creatorName: string;
	creatorAvatar: string;
	startDate: string;
	endDate: string;
	isActive: boolean;
	price: number;
	autoRenew: boolean;
}

export interface Report {
	id: string;
	reporterId: string;
	reporterName: string;
	targetId: string;
	targetType: 'post' | 'user' | 'message';
	reason: string;
	description: string;
	status: ReportStatus;
	createdAt: string;
}

export interface Notification {
	id: string;
	userId: string;
	type: 'like' | 'comment' | 'subscription' | 'tip' | 'message' | 'system';
	title: string;
	body: string;
	isRead: boolean;
	createdAt: string;
	link?: string;
	fromAvatar?: string;
}

export interface KYCApplication {
	id: string;
	creatorId: string;
	creatorName: string;
	creatorEmail: string;
	creatorAvatar: string;
	submittedAt: string;
	status: KYCStatus;
	idFrontUrl: string;
	idBackUrl: string;
	selfieUrl: string;
	rejectionReason?: string;
}
