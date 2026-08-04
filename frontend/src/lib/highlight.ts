/**
 * Locate a verified quote inside the PDF's rendered text layer, so the reader can highlight
 * it rather than just turn to the right page.
 *
 * This is a *second*, independent search from the one the backend already ran. The backend
 * verifies the quote against the text extracted for the LLM (PyMuPDF); this searches the text
 * pdf.js renders into the page's text layer, which segments into differently-shaped spans and
 * can wrap or space characters slightly differently. The two don't always agree, so failure
 * here is expected sometimes and must degrade honestly — never highlight the wrong passage to
 * avoid an empty result.
 */

const TYPOGRAPHIC_PUNCTUATION: Record<string, string> = {
	"‘": "'",
	"’": "'",
	"‚": "'",
	"“": '"',
	"”": '"',
	"„": '"',
	"‐": "-",
	"‑": "-",
	"‒": "-",
	"–": "-",
	"—": "-",
	"―": "-",
	"−": "-",
	" ": " ",
	"…": "...",
};

/**
 * Folds text for comparison, keeping a map back to the original string's indices.
 *
 * Whitespace is dropped entirely rather than normalised. pdf.js splits a line into spans at
 * font changes, so `(the "Reviewed Rent").` arrives as three spans — and any scheme that
 * preserves or inserts whitespace at those boundaries invents spaces the document doesn't
 * have. Ignoring whitespace on both sides makes the match immune to however pdf.js chose to
 * fragment the line. For quotes of this length the risk of a false positive from run-together
 * words is negligible, and the backend has already verified the quote exists.
 */
function fold(text: string): { folded: string; origin: number[] } {
	const out: string[] = [];
	const origin: number[] = [];

	for (let i = 0; i < text.length; i++) {
		const char = text.charAt(i);
		const raw = TYPOGRAPHIC_PUNCTUATION[char] ?? char;

		if (/\s/.test(raw)) continue;

		out.push(raw.toLowerCase());
		origin.push(i);
	}

	return { folded: out.join(""), origin };
}

export interface TextLayerMatch {
	spans: HTMLElement[];
}

/**
 * Search a rendered pdf.js text layer for `quote`. Returns the spans that together contain
 * the match, in document order, or `null` if no match was found.
 */
export function findQuoteInTextLayer(
	layer: HTMLElement,
	quote: string,
): TextLayerMatch | null {
	const spans = Array.from(layer.querySelectorAll<HTMLElement>("span"));
	if (spans.length === 0) return null;

	// pdf.js often encodes the gap between words as glyph positioning rather than a literal
	// space character, so two adjacent spans can concatenate as "Leaseshall" with nothing
	// between them. A synthetic space at every span boundary fixes that; `fold()` collapses
	// it away wherever a real one already existed, so this can't introduce a false negative,
	// only occasionally over-split a hyphenated word — which just falls through to the
	// pinned-quote fallback rather than mis-highlighting.
	let concatenated = "";
	const ranges: { span: HTMLElement; start: number; end: number }[] = [];
	for (const span of spans) {
		const text = span.textContent ?? "";
		if (concatenated.length > 0) concatenated += " ";
		const start = concatenated.length;
		concatenated += text;
		ranges.push({ span, start, end: concatenated.length });
	}

	const { folded: haystack, origin } = fold(concatenated);
	const { folded: needle } = fold(quote);
	if (!needle) return null;

	const position = haystack.indexOf(needle);
	if (position === -1) return null;

	const startOrig = origin[position];
	const endOriginChar = origin[position + needle.length - 1];
	if (startOrig === undefined || endOriginChar === undefined) return null;
	const endOrig = endOriginChar + 1;

	const matched = ranges
		.filter((r) => r.start < endOrig && r.end > startOrig)
		.map((r) => r.span);

	return matched.length > 0 ? { spans: matched } : null;
}

const HIGHLIGHT_CLASS = "citation-highlight-mark";

export function applyHighlight(spans: HTMLElement[]): void {
	for (const span of spans) {
		span.classList.add(HIGHLIGHT_CLASS);
	}
}

export function clearHighlights(layer: ParentNode): void {
	for (const span of layer.querySelectorAll(`.${HIGHLIGHT_CLASS}`)) {
		span.classList.remove(HIGHLIGHT_CLASS);
	}
}
