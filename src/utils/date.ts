export function formatDistanceToNow(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString('en-US', {
		month: 'short', day: 'numeric', year: 'numeric',
	});
}

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Math.abs(amount));
}
