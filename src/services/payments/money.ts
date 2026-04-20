const USD_TO_INR_RATE = 83.5;

export function usdToInr(usd: number): number {
	return parseFloat((usd * USD_TO_INR_RATE).toFixed(2));
}

export function formatINR(paise_or_rupees: number): string {
	return new Intl.NumberFormat('en-IN', {
		style: 'currency',
		currency: 'INR',
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(paise_or_rupees);
}
