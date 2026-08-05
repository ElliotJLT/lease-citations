import { AlertCircle } from "lucide-react";
import { preview } from "../lib/citations";
import { cn } from "../lib/utils";
import type { Citation } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationMarkerProps {
	citation: Citation;
	/** Whether this is the one citation currently selected app-wide (at most one, ever —
	 *  selection is a single piece of state shared with the document reader). */
	selected: boolean;
	onSelect: (citation: Citation) => void;
}

const MARKER_BASE =
	"mx-0.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-[3px] border px-[3px] align-super text-[10px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1";

/**
 * The compact inline marker a citation collapses to inside the prose — a superscript-ish chip
 * sitting immediately after the proposition it supports, not a detached chip in a ledger below
 * the answer.
 *
 * Two structural states, never distinguished by colour alone (design rule): a matched marker is
 * a solid teal square carrying its display number, a real `<button>` that jumps the reader; a
 * not-located marker is a colourless dashed square carrying an alert glyph, inert — it shows a
 * tooltip and nothing else, because there is nowhere for it to jump to.
 *
 * Just the marker and its hover preview live here. The "Read alongside" trail for a selected
 * citation is rendered by `AnswerBody` as a block-level sibling of the paragraph or list item
 * this marker sits in — never mounted inside the marker itself, so selecting it never reflows
 * the prose around it.
 */
export function CitationMarker({
	citation,
	selected,
	onSelect,
}: CitationMarkerProps) {
	if (!citation.verified) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					{/* Selectable, like any other source: there's no page to jump to, but the
					    inspector is the only surface that can say *why* against the proposition
					    this was offered for, so it has to be reachable by mouse and keyboard. */}
					<button
						type="button"
						onClick={() => onSelect(citation)}
						aria-label={`Source ${citation.number}: ${citation.label} — not located in this document`}
						className={cn(
							MARKER_BASE,
							"cursor-pointer border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600 focus-visible:ring-neutral-300",
						)}
					>
						<span className="flex items-center gap-0.5">
							{citation.number}
							<AlertCircle className="h-2 w-2" />
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					className="max-w-[320px] space-y-1 text-left"
				>
					<p className="font-medium">{citation.label} · not located</p>
					<p className="text-white/75">
						The quoted wording could not be matched in this document. Whether
						the proposition is correct remains for you to assess.
					</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={() => onSelect(citation)}
					aria-label={`Source ${citation.number}: ${citation.label}${
						citation.page != null ? `, page ${citation.page}` : ""
					} — open in document`}
					className={cn(
						MARKER_BASE,
						selected
							? "border-[#EE7743] bg-[#EE7743] text-white focus-visible:ring-[#EE7743]/50"
							: "border-[#2D6984]/30 text-[#2D6984]/70 hover:border-[#EE7743] hover:bg-[#EE7743] hover:text-white focus-visible:border-[#EE7743] focus-visible:bg-[#EE7743] focus-visible:text-white focus-visible:ring-[#EE7743]/50",
					)}
				>
					{citation.number}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="max-w-[320px] space-y-1.5 text-left"
			>
				<p className="font-medium">
					{citation.label}
					{citation.page != null && ` · page ${citation.page}`}
				</p>
				<p className="text-white/75">Wording matched in this document.</p>
				<p className="font-serif text-white/90 italic leading-relaxed">
					"{preview(citation.quote, 200)}"
				</p>
				<p className="text-[11px] text-white/60">
					Click to open it in the document.
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
