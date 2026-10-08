/**
 * The app's mark: a page with its corner folded and a tick on it, because the product's one
 * promise is that what it shows you has been checked against the page.
 *
 * Square viewBox, so size it on one axis (`h-4 w-auto`). `currentColor` lets it take the
 * surrounding text colour.
 */
export function BrandMark({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" className={className} role="img" aria-label="Lease citations">
			<title>Lease citations</title>
			<path
				d="M6 2.5h8.5L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z"
				fill="currentColor"
			/>
			<path d="M8.5 13.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
