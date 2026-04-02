import { useRef, useEffect, useCallback } from 'react';

/**
 * Enables click-and-drag horizontal scrolling on desktop browsers.
 * Returns a ref to attach to the scrollable container.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
	const ref = useRef<T | null>(null);
	const state = useRef({ isDown: false, startX: 0, scrollLeft: 0, moved: false });

	const onMouseDown = useCallback((e: MouseEvent) => {
		const el = ref.current;
		if (!el) return;
		state.current.isDown = true;
		state.current.moved = false;
		state.current.startX = e.pageX - el.offsetLeft;
		state.current.scrollLeft = el.scrollLeft;
		el.style.cursor = 'grabbing';
	}, []);

	const onMouseMove = useCallback((e: MouseEvent) => {
		if (!state.current.isDown) return;
		const el = ref.current;
		if (!el) return;
		e.preventDefault();
		const x = e.pageX - el.offsetLeft;
		const walk = x - state.current.startX;
		if (Math.abs(walk) > 3) state.current.moved = true;
		el.scrollLeft = state.current.scrollLeft - walk;
	}, []);

	const onMouseUp = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		state.current.isDown = false;
		el.style.cursor = 'grab';
	}, []);

	const onMouseLeave = useCallback(() => {
		const el = ref.current;
		if (!el) return;
		if (state.current.isDown) {
			state.current.isDown = false;
			el.style.cursor = 'grab';
		}
	}, []);

	const preventClickAfterDrag = useCallback((e: MouseEvent) => {
		if (state.current.moved) {
			e.preventDefault();
			e.stopPropagation();
			state.current.moved = false;
		}
	}, []);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.style.cursor = 'grab';
		el.addEventListener('mousedown', onMouseDown);
		el.addEventListener('mousemove', onMouseMove);
		el.addEventListener('mouseup', onMouseUp);
		el.addEventListener('mouseleave', onMouseLeave);
		el.addEventListener('click', preventClickAfterDrag, true);
		return () => {
			el.removeEventListener('mousedown', onMouseDown);
			el.removeEventListener('mousemove', onMouseMove);
			el.removeEventListener('mouseup', onMouseUp);
			el.removeEventListener('mouseleave', onMouseLeave);
			el.removeEventListener('click', preventClickAfterDrag, true);
		};
	}, [onMouseDown, onMouseMove, onMouseUp, onMouseLeave, preventClickAfterDrag]);

	return ref;
}
