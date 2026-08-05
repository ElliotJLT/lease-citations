import { Fragment, type ReactNode, useMemo } from "react";
import { MARKER_REGEX, stripStreamingMarkers } from "../lib/citations";
import type { Citation } from "../types";
import { CitationMarker } from "./CitationMarker";

interface AnswerBodyProps {
	content: string;
	citations: Citation[];
	/** True while this message is still receiving deltas. Markers arrive in the model's raw,
	 *  unresolved form during streaming (see lib/citations.ts) and are stripped rather than
	 *  rendered — there's nothing yet to resolve them against. */
	streaming?: boolean;
	selectedCitationId: string | null;
	onSelectCitation: (citation: Citation) => void;
}

type Block =
	| { type: "paragraph"; lines: string[] }
	| { type: "list"; items: string[] };

/**
 * Splits the model's reply into the small subset of structure the prompt actually produces:
 * blank-line-separated paragraphs and `- ` bullet lists. Lines are grouped by a simple
 * state machine rather than a two-pass block split, so a list that follows a paragraph without
 * an intervening blank line (a lead-in sentence directly above bullets) still splits correctly.
 */
function parseBlocks(text: string): Block[] {
	const blocks: Block[] = [];
	let paragraph: string[] = [];
	let list: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length > 0) {
			blocks.push({ type: "paragraph", lines: paragraph });
			paragraph = [];
		}
	};
	const flushList = () => {
		if (list.length > 0) {
			blocks.push({ type: "list", items: list });
			list = [];
		}
	};

	for (const rawLine of text.split("\n")) {
		const trimmed = rawLine.trim();
		if (trimmed === "") {
			flushParagraph();
			flushList();
			continue;
		}
		const bullet = /^-\s+(.*)$/.exec(trimmed);
		if (bullet) {
			flushParagraph();
			list.push(bullet[1] ?? "");
		} else {
			flushList();
			paragraph.push(rawLine.trim());
		}
	}
	flushParagraph();
	flushList();
	return blocks;
}

// `**bold**` or `*italic*` — the only emphasis the prompt produces. Not full markdown: no
// nested emphasis, no links, no headings, no tables.
const EMPHASIS_REGEX = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let i = 0;
	EMPHASIS_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null = EMPHASIS_REGEX.exec(text);
	while (match !== null) {
		if (match.index > lastIndex) {
			nodes.push(
				<Fragment key={`${keyPrefix}-t${i}`}>
					{text.slice(lastIndex, match.index)}
				</Fragment>,
			);
		}
		if (match[1] !== undefined) {
			nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[1]}</strong>);
		} else if (match[2] !== undefined) {
			nodes.push(
				<em key={`${keyPrefix}-i${i}`} className="italic">
					{match[2]}
				</em>,
			);
		}
		lastIndex = EMPHASIS_REGEX.lastIndex;
		i++;
		match = EMPHASIS_REGEX.exec(text);
	}
	if (lastIndex < text.length) {
		nodes.push(
			<Fragment key={`${keyPrefix}-t${i}`}>{text.slice(lastIndex)}</Fragment>,
		);
	}
	return nodes;
}

/** Splits a line on citation markers, rendering emphasis-formatted text runs and inline
 *  `CitationMarker`s in place, in order. A marker whose id has no matching citation (should
 *  not happen — the backend drops unresolvable markers before persisting — but never trust
 *  that from the render path) is dropped silently rather than leaking a raw `[[c:...]]` token
 *  or crashing. */
function renderLine(
	line: string,
	citationsById: Map<string, Citation>,
	selectedCitationId: string | null,
	onSelectCitation: (citation: Citation) => void,
	keyPrefix: string,
): ReactNode[] {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let i = 0;
	MARKER_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null = MARKER_REGEX.exec(line);
	while (match !== null) {
		if (match.index > lastIndex) {
			nodes.push(
				...renderEmphasis(
					line.slice(lastIndex, match.index),
					`${keyPrefix}-e${i}`,
				),
			);
		}
		const citation = match[1] ? citationsById.get(match[1]) : undefined;
		if (citation) {
			nodes.push(
				<CitationMarker
					key={`${keyPrefix}-c${i}`}
					citation={citation}
					selected={selectedCitationId === citation.id}
					onSelect={onSelectCitation}
				/>,
			);
		}
		// Unresolved id: drop the marker, render nothing for it — never leak the raw token.
		lastIndex = MARKER_REGEX.lastIndex;
		i++;
		match = MARKER_REGEX.exec(line);
	}
	if (lastIndex < line.length) {
		nodes.push(...renderEmphasis(line.slice(lastIndex), `${keyPrefix}-e${i}`));
	}
	return nodes;
}

/**
 * Renders assistant prose with citation markers placed inline, as real interactive React
 * elements — not markdown text. A markdown renderer can't host interactive components inline,
 * and splitting markdown text around markers breaks list parsing, so this is a small dedicated
 * renderer for the exact subset the prompt produces, used for both the streaming and hydrated
 * render paths so text never reflows when a message finishes.
 */
export function AnswerBody({
	content,
	citations,
	streaming = false,
	selectedCitationId,
	onSelectCitation,
}: AnswerBodyProps) {
	const displayContent = streaming ? stripStreamingMarkers(content) : content;

	const citationsById = useMemo(
		() => new Map(citations.map((c) => [c.id, c])),
		[citations],
	);
	const blocks = useMemo(() => parseBlocks(displayContent), [displayContent]);

	// Block/line/item position is a legitimate key here, not a lint-suppression shortcut:
	// `blocks` is recomputed fresh from `content` on every render, `content` only ever grows
	// (streaming) or is final (hydrated), and a block already emitted never changes its own
	// text or reorders relative to its neighbours — so index-derived keys are as stable as the
	// prose itself.
	return (
		<div className="prose">
			{blocks.map((block, blockIndex) => {
				if (block.type === "list") {
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only blocks, see comment above.
						<ul key={`b${blockIndex}`}>
							{block.items.map((item, itemIndex) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: append-only blocks, see comment above.
								<li key={`b${blockIndex}i${itemIndex}`}>
									{renderLine(
										item,
										citationsById,
										selectedCitationId,
										onSelectCitation,
										`b${blockIndex}i${itemIndex}`,
									)}
								</li>
							))}
						</ul>
					);
				}
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only blocks, see comment above.
					<p key={`b${blockIndex}`}>
						{block.lines.map((line, lineIndex) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: append-only blocks, see comment above.
							<Fragment key={`b${blockIndex}l${lineIndex}`}>
								{lineIndex > 0 && <br />}
								{renderLine(
									line,
									citationsById,
									selectedCitationId,
									onSelectCitation,
									`b${blockIndex}l${lineIndex}`,
								)}
							</Fragment>
						))}
					</p>
				);
			})}
		</div>
	);
}
