import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Phone, Maximize2 } from '../icons';
import { useCallSession } from '../../context/CallSessionContext';

const STORAGE_KEY = 'cw.miniCall.pos.v1';
const NAVBAR_PX = 56;
const TAP_PX = 5;
const GAP = 16;
const DEFAULT_TOP = NAVBAR_PX + GAP;
const DEFAULT_RIGHT = 12;

const VIDEO_W = 176;
const VIDEO_H = Math.round((VIDEO_W * 4) / 3);
const AUDIO_W = 220;
const AUDIO_H = 84;

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

function loadStoredPosition(): { left: number, top: number } | null {
	try {
		const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
		if (!raw) return null;
		const p = JSON.parse(raw) as unknown;
		if (!p || typeof p !== 'object') return null;
		const left = Number((p as { left: number }).left);
		const top = Number((p as { top: number }).top);
		if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
		return { left, top };
	} catch {
		return null;
	}
}

function savePosition(pos: { left: number, top: number }) {
	try {
		globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(pos));
	} catch {
		// ignore
	}
}

export function MinimizedCallWindow() {
	const navigate = useNavigate();
	const cs = useCallSession();

	const isVideo = cs.isVideo;
	const w = isVideo ? VIDEO_W : AUDIO_W;
	const h = isVideo ? VIDEO_H : AUDIO_H;

	const defaultLeft = typeof window !== 'undefined' ?
		window.innerWidth - w - DEFAULT_RIGHT :
		200;
	const defaultTop = DEFAULT_TOP;

	const [pos, setPos] = useState<{ left: number, top: number }>(() =>
		loadStoredPosition() ?? { left: defaultLeft, top: defaultTop }
	);

	const drag = useRef<{
		active: boolean,
		pointerId: number,
		startX: number,
		startY: number,
		originLeft: number,
		originTop: number,
		moved: number,
	} | null>(null);

	const clampPos = useCallback((p: { left: number, top: number }) => {
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const maxLeft = Math.max(8, vw - w - 8);
		const maxTop = Math.max(NAVBAR_PX + 8, vh - h - 8);
		return {
			left: clamp(p.left, 8, maxLeft),
			top: clamp(p.top, NAVBAR_PX + 8, maxTop),
		};
	}, [w, h]);

	useEffect(() => {
		const onResize = () => {
			setPos(p => clampPos(p));
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [clampPos]);

	useEffect(() => {
		setPos(p => clampPos(p));
	}, [w, h, clampPos]);

	/** PiP only after explicit Minimize on `/call`; otherwise use ActiveCallBanner on other routes. */
	const show = cs.isActive && cs.isMinimized;

	if (!show) return null;

	const timerLabel =
		(cs.isBookedCall && typeof cs.bookedRemainingSec === 'number') || cs.isTimedSession ?
			`${cs.timerDisplay} left` :
			cs.timerDisplay;

	const goFullScreen = () => {
		cs.maximize();
		void navigate('/call');
	};

	const onPointerDown = (e: React.PointerEvent) => {
		if (e.button !== 0) return;
		drag.current = {
			active: true,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			originLeft: pos.left,
			originTop: pos.top,
			moved: 0,
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d?.active || e.pointerId !== d.pointerId) return;
		const dx = e.clientX - d.startX;
		const dy = e.clientY - d.startY;
		d.moved = Math.max(d.moved, Math.abs(dx), Math.abs(dy));
		setPos(clampPos({
			left: d.originLeft + dx,
			top: d.originTop + dy,
		}));
	};

	const onPointerUp = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d?.active || e.pointerId !== d.pointerId) return;
		const moved = d.moved;
		drag.current = null;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}
		setPos(p => {
			const c = clampPos(p);
			savePosition(c);
			return c;
		});
		if (moved < TAP_PX) {
			goFullScreen();
		}
	};

	const onPointerCancel = (e: React.PointerEvent) => {
		const d = drag.current;
		if (!d?.active || e.pointerId !== d.pointerId) return;
		drag.current = null;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}
	};

	return (
		<div
			className="fixed z-[235] touch-none select-none"
			style={{ left: pos.left, top: pos.top, width: w, height: h }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
		>
			<div
				className={`relative w-full h-full overflow-hidden rounded-2xl border border-border/30 bg-surface shadow-2xl ${
					isVideo ? '' : 'flex items-center gap-2 px-2.5'
				}`}
			>
				{isVideo ? (
					<>
						<div
							ref={el => { cs.attachRemoteVideo(el); }}
							className="absolute inset-0 bg-black [&>video]:h-full [&>video]:w-full [&>video]:object-contain"
						/>
						{!cs.hasRemoteVideo && (
							<div className="absolute inset-0">
								<img
									src={cs.participantAvatar}
									alt=""
									className="h-full w-full object-cover"
								/>
								<div className="absolute inset-0 bg-black/35" />
							</div>
						)}
						{!cs.isCameraOff && (
							<div className="absolute bottom-10 right-1.5 z-10 h-14 w-11 overflow-hidden rounded-lg border border-white/20 bg-black/40">
								<div
									ref={el => { cs.attachLocalVideo(el); }}
									className="h-full w-full bg-black [&>video]:h-full [&>video]:w-full [&>video]:object-contain"
								/>
							</div>
						)}
						<div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5 pt-2">
							<p className="truncate text-center text-[11px] font-bold text-white drop-shadow">{cs.participantName}</p>
							<p className="text-center font-mono text-[10px] text-white/80 tabular-nums">{timerLabel}</p>
						</div>
						<div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-6">
							<button
								type="button"
								onPointerDown={e => e.stopPropagation()}
								onClick={e => { e.stopPropagation(); cs.toggleMute(); }}
								className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
								aria-label={cs.isMuted ? 'Unmute' : 'Mute'}
							>
								{cs.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
							</button>
							<button
								type="button"
								onPointerDown={e => e.stopPropagation()}
								onClick={e => { e.stopPropagation(); cs.completeEndCall(); }}
								className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600"
								aria-label="End session"
							>
								<Phone className="h-5 w-5 rotate-[135deg]" />
							</button>
							<button
								type="button"
								onPointerDown={e => e.stopPropagation()}
								onClick={e => { e.stopPropagation(); goFullScreen(); }}
								className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
								aria-label="Maximize call"
							>
								<Maximize2 className="h-4 w-4" />
							</button>
						</div>
					</>
				) : (
					<>
						<img
							src={cs.participantAvatar}
							alt=""
							className="h-12 w-12 shrink-0 rounded-xl object-cover"
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate text-xs font-bold text-foreground">{cs.participantName}</p>
							<p className="font-mono text-[10px] text-muted tabular-nums">{timerLabel}</p>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onPointerDown={e => e.stopPropagation()}
								onClick={e => { e.stopPropagation(); cs.toggleMute(); }}
								className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/15"
								aria-label={cs.isMuted ? 'Unmute' : 'Mute'}
							>
								{cs.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
							</button>
							<button
								type="button"
								onPointerDown={e => e.stopPropagation()}
								onClick={e => { e.stopPropagation(); cs.completeEndCall(); }}
								className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
								aria-label="End session"
							>
								<Phone className="h-4 w-4 rotate-[135deg]" />
							</button>
							<button
								type="button"
								onPointerDown={e => e.stopPropagation()}
								onClick={e => { e.stopPropagation(); goFullScreen(); }}
								className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/15"
								aria-label="Maximize call"
							>
								<Maximize2 className="h-3.5 w-3.5" />
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
