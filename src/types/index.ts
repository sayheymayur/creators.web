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
	/** INR paise as decimal string (API `balance_cents` / `amount_cents` scale). */
	walletBalanceMinor: string;
	/**
	 * Optional creator dashboard object returned by `GET /me` for creators/admins with a creator profile
	 * (see missing_apis_v1 spec).
	 */
	creatorDashboard?: CreatorDashboard;
	/**
	 * Optional timed-session rate in minor units per minute (spec: `perMinuteRate` on POST /me/profile).
	 * Kept optional to avoid breaking existing UI-only creator models.
	 */
	perMinuteRate?: number | null;
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
	/**
	 * Local send status for chat UX (WhatsApp-style ticks).
	 * - `sending`: optimistic local message before ack
	 * - `sent`: backend acknowledged (or persisted/history)
	 * - `failed`: send attempt failed (user can retry/copy)
	 */
	sendStatus?: 'sending' | 'sent' | 'failed';
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
	title: string;
	body: string | null;
	data: Record<string, unknown>;
	created_at: string;
	read_at: string | null;
}

/**
 * Spec types (missing_apis_v1.pdf)
 */
export type NotificationSettingsKey = 'messages' | 'subscriptions' | 'tips' | 'likes' | 'system';

export type NotificationSettings = Record<NotificationSettingsKey, boolean>;

export interface NotificationSettingsResponse {
	settings: NotificationSettings;
}

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

export interface SubscriptionDTO {
	id: string;
	fan_user_id: string;
	creator_user_id: string;
	status: SubscriptionStatus;
	auto_renew: boolean;
	price_cents: number;
	currency: string;
	started_at: string;
	created_at: string;
	updated_at: string;
	ends_at: string | null;
	cancelled_at: string | null;
}

export interface SubscriberRow {
	fan: {
		id: string,
		name: string,
		username: string,
		avatar_url: string | null,
	};
	subscription: SubscriptionDTO;
}

export interface CreatorProfileWithFollowStats {
	id: string;
	user_id: string;
	username: string;
	name: string;
	avatar_url: string | null;
	categories: string[];
	bio: string | null;
	banner_url: string | null;
	socials: Record<string, unknown> | null;
	/** Integer string, minor units. */
	subscription_price_minor: string | null;
	created_at: string;
	follower_count: number;
	is_followed: boolean;
	profile_like_count: number;
	is_profile_liked: boolean;
}

export interface UserSummary {
	id: string;
	name: string;
	username: string;
	avatar_url: string | null;
}

export type CreatorKycStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

export interface CreatorDashboardSessionHistoryRow {
	requestId: string;
	type: 'chat' | 'call';
	status: string;
	fanUserId: string;
	fanName: string;
	durationMinutes: number | null;
	earningsCents: string;
	actualDurationSeconds: null;
	createdAt: string;
	completedAt: string | null;
}

export interface CreatorDashboard {
	kycStatus: CreatorKycStatus;
	followerCount: number;
	subscriberCount: number;
	totalEarningsCents: string;
	monthlyEarningsCents: string;
	tipsReceivedCents: string;
	earningsBySource: {
		subscriptionsCents: string,
		tipsCents: string,
		sessionsCents: string,
	};
	monthlyStats: { month: string, earningsCents: string }[];
	sessionHistory: CreatorDashboardSessionHistoryRow[];
	perMinuteRateCents: number | null;
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
