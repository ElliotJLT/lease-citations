/**
 * Orbital's logo mark.
 *
 * Path taken from the official lockup published on orbital.tech
 * (`Orbital_Lockup_Colour_Negative.svg`) rather than traced by eye — an approximated logo
 * reads as sloppier than no logo. The shape is a parallelogram with two *vertical* edges and
 * two sheared ones, roughly 47:82, which is what makes it lean; drawing it as a plain diamond
 * loses that.
 *
 * The viewBox keeps the mark's own proportions, so size it on one axis (`h-4 w-auto`) and let
 * the other follow. `currentColor` lets it take the surrounding text colour.
 */
export function OrbitalMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 47.3 82"
			fill="currentColor"
			className={className}
			role="img"
			aria-label="Orbital"
		>
			<title>Orbital</title>
			<path d="M0,27.3V82l47.3-27.3V0L0,27.3z M31.6,45.6l-15.8,9.1V36.4l15.8-9.1V45.6z" />
		</svg>
	);
}
