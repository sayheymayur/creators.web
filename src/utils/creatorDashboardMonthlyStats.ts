import type { CreatorDashboard, MonthlyStats } from '../types';

export type MonthlyEarningRupeeRow = { month: string; earnings: number };

export function parseMinorStringToRupees(minor: string | number | null | undefined): number {
	const raw = typeof minor === 'number' ? String(minor) : (minor ?? '').toString();
	const t = raw.trim();
	if (!/^\d+$/.test(t)) return 0;
	return Number(t) / 100;
}

/** Creator dashboard chart: only `GET /me` `monthlyStats` — never mock fallback. */
export function creatorDashboardMonthlyRupeeRows(
	dashboard: CreatorDashboard | undefined,
): MonthlyEarningRupeeRow[] {
	const raw = dashboard?.monthlyStats;
	if (!raw?.length) return [];
	return raw.map(s => ({
		month: s.month,
		earnings: parseMinorStringToRupees(s.earningsCents),
	}));
}

/**
 * Earnings page breakdown: prefer API rows; if dashboard exists but has no series, show empty
 * (avoid `mockCreators[0]` stats for a real creator). Mock only when `creatorDashboard` is absent.
 */
export function earningsPageMonthlyRupeeRows(
	dashboard: CreatorDashboard | undefined,
	mockFallback: MonthlyStats[],
): MonthlyEarningRupeeRow[] {
	const fromApi = creatorDashboardMonthlyRupeeRows(dashboard);
	if (fromApi.length) return fromApi;
	if (dashboard) return [];
	return mockFallback.map(s => ({ month: s.month, earnings: s.earnings }));
}
