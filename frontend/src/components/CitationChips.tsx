import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Citation, TrailItem } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationChipsProps {
	citations: Citation[];
	onJump: (citation: Citation) => void;
}

/** Compare clause labels ignoring case and the "Clause "/"Definition: " prefixes. */
function labelKey(label: string): string {
	return label
		.toLowerCase()
		.replace(/^(clause|schedule|paragraph|definition:)\s*/, "")
		.trim();
}

function preview(text: string, max = 180): string {
	return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * Evidence for an answer, and only what the system can actually establish about it.
 *
 * Three states, deliberately unequal in weight:
 *  - **Matched** — this wording was located in the document, at this page. Peers, in the order
 *    the model offered them; none is promoted to "primary", because citation order is not a
 *    claim about which passage matters most.
 *  - **Read alongside** — definitions and cross-references the matched passage explicitly
 *    names, resolved from the document. Deduplicated against the matched list, so a clause the
 *    model already cited doesn't appear twice.
 *  - **Not located** — offered by the model, not found. Given its own block rather than a
 *    greyed-out peer, because it's the state a lawyer most needs to notice.
 *
 * The wording throughout is "matched" and "located", never "verified": what's established is
 * that a passage exists at a place, not that the answer built on it is correct.
 */
export function CitationChips({ citations, onJump }: CitationChipsProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const matched = citations.filter((c) => c.verified);
	const unresolved = citations.filter((c) => !c.verified);
	if (matched.length === 0 && unresolved.length === 0) return null;

	const matchedKeys = new Set(matched.map((c) => labelKey(c.label)));

	/** Send the reader to a related provision, using the document's own wording as the target. */
	const jumpToTrailItem = (source: Citation, item: TrailItem) =>
		onJump({
			id: `${source.id}-${item.kind}-${item.label}`,
			label: item.label,
			quote: item.text,
			page: item.page,
			verified: true,
			trail: [],
		});

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, delay: 0.1 }}
			className="mt-2.5 flex flex-col gap-2"
		>
			<p className="text-[11px] text-neutral-400">
				{matched.length} {matched.length === 1 ? "passage" : "passages"} matched
				in this document
				{unresolved.length > 0 && ` · ${unresolved.length} not located`}
			</p>

			{matched.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{matched.map((citation) => {
						const isExpanded = expandedId === citation.id;
						return (
							<Tooltip key={citation.id}>
								<TooltipTrigger asChild>
									<div className="inline-flex items-stretch overflow-hidden rounded-full border border-brand/20 bg-brand-soft font-medium text-brand text-xs">
										<button
											type="button"
											onClick={() => onJump(citation)}
											className="flex cursor-pointer items-center gap-1 py-1 pr-1.5 pl-2.5 hover:bg-brand/10"
										>
											<Check className="h-3 w-3 flex-shrink-0" />
											<span>{citation.label}</span>
											{citation.page != null && (
												<span className="text-brand/60">
													· p.{citation.page}
												</span>
											)}
										</button>
										<button
											type="button"
											onClick={() =>
												setExpandedId(isExpanded ? null : citation.id)
											}
											aria-label={
												isExpanded
													? "Hide passage"
													: "Show passage and related provisions"
											}
											className="flex items-center border-brand/20 border-l pr-2 pl-1 hover:bg-brand/10"
										>
											<ChevronRight
												className={`h-3 w-3 transition-transform duration-150 ${
													isExpanded ? "rotate-90" : ""
												}`}
											/>
										</button>
									</div>
								</TooltipTrigger>
								<TooltipContent side="top" className="max-w-sm">
									Matched at page {citation.page} — click to open it in the
									document
								</TooltipContent>
							</Tooltip>
						);
					})}
				</div>
			)}

			<AnimatePresence initial={false}>
				{matched.map((citation) => {
					if (expandedId !== citation.id) return null;
					// A related provision the model already cited itself is not "related" —
					// it's a peer, and already a chip above.
					const related = citation.trail.filter(
						(item) => !matchedKeys.has(labelKey(item.label)),
					);
					return (
						<motion.div
							key={citation.id}
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.15 }}
							className="overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50"
						>
							<p className="px-3 py-2 font-serif text-[13px] text-neutral-600 italic leading-relaxed">
								"{preview(citation.quote)}"
							</p>

							{related.length > 0 && (
								<div className="border-neutral-200/70 border-t px-3 py-2">
									<p className="mb-1.5 font-medium text-[10px] text-neutral-400 uppercase tracking-wide">
										Read alongside
									</p>
									<div className="flex flex-wrap gap-1.5">
										{related.map((item) => (
											<Tooltip key={`${item.kind}-${item.label}`}>
												<TooltipTrigger asChild>
													<button
														type="button"
														onClick={() => jumpToTrailItem(citation, item)}
														className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:border-brand/30 hover:text-brand"
													>
														<span className="font-medium">{item.label}</span>
														<span className="text-neutral-400">
															{item.kind === "definition"
																? "defined term"
																: "cross-reference"}
															{item.page != null && ` · p.${item.page}`}
														</span>
													</button>
												</TooltipTrigger>
												<TooltipContent side="top" className="max-w-sm">
													{preview(item.text, 200)}
												</TooltipContent>
											</Tooltip>
										))}
									</div>
								</div>
							)}
						</motion.div>
					);
				})}
			</AnimatePresence>

			{unresolved.length > 0 && (
				<div className="rounded-lg border border-neutral-300 border-dashed px-3 py-2">
					<p className="mb-1 flex items-center gap-1.5 font-medium text-[11px] text-neutral-500 uppercase tracking-wide">
						<AlertCircle className="h-3 w-3" />
						Not located
					</p>
					{unresolved.map((citation) => (
						<p key={citation.id} className="text-neutral-500 text-xs">
							The answer referenced{" "}
							<span className="font-medium text-neutral-700">
								{citation.label}
							</span>
							, but no matching passage was found in this document. Check the
							source before relying on it.
						</p>
					))}
				</div>
			)}
		</motion.div>
	);
}
