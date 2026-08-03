/**
 * Orbital's logo mark: a skewed square with a smaller one cut out of it.
 *
 * Drawn as geometry rather than shipped as an asset so it inherits `currentColor` and stays
 * crisp at avatar size. Traced from the mark on orbital.tech.
 */
export function OrbitalMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			fillRule="evenodd"
			clipRule="evenodd"
			className={className}
			role="img"
			aria-label="Orbital"
		>
			<title>Orbital</title>
			<path d="M14 2 L22 9 L10 22 L2 15 Z M12.64 8.8 L15.2 11.04 L11.36 15.2 L8.8 12.96 Z" />
		</svg>
	);
}
