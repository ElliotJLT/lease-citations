import type { Citation, TrailItem } from "../types";

/**
 * Inline citation markers, and the two forms they appear in.
 *
 * The persisted, final form of a message uses `[[c:<16-hex-char-id>]]` — the id form, matched
 * against `message.citations` to resolve the actual `Citation` object. While a message is
 * still streaming, the backend hasn't rewritten the model's raw markers yet, so the deltas
 * contain the model's own numeric form instead: `[[1]]`, `[[2]]`. Streaming only ever strips
 * markers (never renders them as chips — there's nothing to resolve them against yet), so one
 * strip pass has to recognise both shapes.
 */

/** Final, persisted form: `[[c:<id>]]`. Used to resolve markers against `message.citations`. */
export const MARKER_REGEX = /\[\[c:([0-9a-f]+)\]\]/g;

// Matches a complete marker in either the numeric streaming form (`[[1]]`) or the id form
// (`[[c:a1b2c3d4e5f60718]]`), so a single global replace strips both while a message streams.
const COMPLETE_MARKER_REGEX = /\[\[(?:c:)?[0-9a-f]+\]\]/g;

// Matches a dangling, not-yet-complete marker fragment anchored to the end of the buffer —
// `[`, `[[`, `[[c`, `[[c:`, `[[c:a1b2`, `[[3`, and so on — so nothing half-parsed ever flashes
// on screen for a single render between chunks.
const TRAILING_PARTIAL_MARKER_REGEX = /\[\[?(?:c:)?[0-9a-f]*$/;

/**
 * Strip citation markers from streaming text: complete markers outright (either shape), and
 * any incomplete fragment trailing the buffer. Text does not reflow when the message hydrates
 * into its final form, because both the streaming and hydrated render paths go through the
 * same `AnswerBody` — this just removes what the hydrated pass would otherwise render as chips.
 */
export function stripStreamingMarkers(text: string): string {
	return text
		.replace(COMPLETE_MARKER_REGEX, "")
		.replace(TRAILING_PARTIAL_MARKER_REGEX, "");
}

/** Compare clause labels ignoring case and the "Clause "/"Definition: " prefixes, so a trail
 *  item naming a provision the model already cited standalone isn't shown again as "related". */
export function labelKey(label: string): string {
	return label
		.toLowerCase()
		.replace(/^(clause|schedule|paragraph|definition:)\s*/, "")
		.trim();
}

export function preview(text: string, max = 180): string {
	return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Turn a trail item (definition or cross-reference) into a synthetic citation so clicking it
 *  can reuse the same jump path as a real citation — the document's own wording as the target,
 *  not a checked source in its own right. */
export function trailItemToCitation(
	source: Citation,
	item: TrailItem,
): Citation {
	return {
		id: `${source.id}-${item.kind}-${item.label}`,
		label: item.label,
		quote: item.text,
		page: item.page,
		verified: true,
		number: source.number,
		trail: [],
	};
}
