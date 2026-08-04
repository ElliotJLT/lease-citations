import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Citation, Claim, TrailItem } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationChipsProps {
	citations: Citation[];
	claims: Claim[];
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

// Quotes are prompted at 10-40 words and the verifier stores the matched span at the same
// length, so this cap renders almost all of them in full and only guards the long tail. The
// reader is the source-reading surface — this panel confirms the right passage, it doesn't
// replace opening the document.
const EXPANDED_QUOTE_MAX = 450;

/**
 * Evidence for an answer, and only what the system can actually establish about it.
 *
 * Grouped by the proposition each source was offered for, because that is the grain at which
 * a lawyer can judge the model's binding. "5 matched" across a whole answer tells them nothing
 * about which sentence they can rely on.
 *
 * Three states, deliberately unequal in weight:
 *  - **Matched source** — this wording was found in the document, at this page. It does not
 *    mean the proposition is correct, or that this passage supports it; the tick is never the
 *    only carrier of that meaning, which is why the section and the per-claim line say it in
 *    words. Peers, in the order offered; none is promoted to "primary".
 *  - **Read alongside** — definitions and cross-references the matched passage explicitly
 *    names, resolved from the document. Deduplicated against the matched list, so a clause the
 *    model already cited doesn't appear twice.
 *  - **Not located** — offered by the model, not found. Given its own block rather than a
 *    greyed-out peer, because it's the state a lawyer most needs to notice.
 *
 * The wording throughout is "matched" and "located", never "verified": what's established is
 * that a passage exists at a place, not that the answer built on it is correct.
 *
 * A deduplicated citation can sit under more than one claim (one passage can support several
 * propositions), so expansion state is keyed per chip *instance* (`${group.key}:${citation.id}`)
 * rather than per citation — clicking one instance's chevron never opens the other.
 */
export function CitationChips({
	citations,
	claims,
	onJump,
}: CitationChipsProps) {
	const [expandedKey, setExpandedKey] = useState<string | null>(null);

	const matched = citations.filter((c) => c.verified);
	const unresolved = citations.filter((c) => !c.verified);
	if (matched.length === 0 && unresolved.length === 0) return null;

	const matchedKeys = new Set(matched.map((c) => labelKey(c.label)));

	const byId = new Map(citations.map((c) => [c.id, c]));
	// Claims the model bound to at least one passage that survived verification. Where it
	// supplied no bindings — older contract, or it ignored the instruction — fall back to a
	// single ungrouped set rather than inventing a structure.
	const claimGroups = claims
		.map((claim) => ({
			key: claim.id,
			claim,
			citations: claim.citation_ids
				.map((id) => byId.get(id))
				.filter((c): c is Citation => c !== undefined),
		}))
		.filter((g) => g.citations.length > 0);

	const groupedIds = new Set(
		claimGroups.flatMap((g) => g.citations.map((c) => c.id)),
	);
	const ungrouped = citations.filter((c) => !groupedIds.has(c.id));
	const groups = [
		...claimGroups,
		...(ungrouped.length > 0
			? [{ key: "__ungrouped", claim: null, citations: ungrouped }]
			: []),
	];

	// Unresolved sources no claim referenced — otherwise they're shown against the
	// proposition they undermine, which is where they mean something.
	const ungroupedUnresolved = ungrouped.filter((c) => !c.verified);

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
			<div className="flex flex-col gap-0.5">
				<p className="font-medium text-[11px] text-neutral-500 uppercase tracking-wide">
					Sources offered for this answer
				</p>
				<p className="text-[11px] text-neutral-400">
					{unresolved.length === 0
						? `${matched.length} sources · all matched in this document`
						: `${matched.length + unresolved.length} sources · ${matched.length} matched in this document · ${unresolved.length} not located`}
				</p>
			</div>

			{/* Grouped by the proposition each passage was offered for, where the model
			    supplied that binding. It's the model's own mapping, not a checked one —
			    but at this grain a lawyer can judge it, which they can't for a whole answer. */}
			{groups.map((group) => {
				const groupMatched = group.citations.filter((c) => c.verified);
				const groupMissing = group.citations.filter((c) => !c.verified);
				const expandedCitation = groupMatched.find(
					(c) => expandedKey === `${group.key}:${c.id}`,
				);
				const related = expandedCitation
					? expandedCitation.trail.filter(
							(item) => !matchedKeys.has(labelKey(item.label)),
						)
					: [];

				return (
					<div key={group.key} className="flex flex-col gap-1">
						{group.claim && (
							<p className="text-[13px] text-neutral-600 leading-snug">
								{group.claim.text}
							</p>
						)}
						{/* The status line only earns its place when something needs flagging — a
						    claim whose sources all matched needs no line at all; repeating "N
						    matched" under every one of several claims reads as a system log. */}
						{group.claim && groupMissing.length > 0 && (
							<p className="pl-3 text-[11px] text-neutral-500">
								<AlertCircle className="mr-1 inline h-3 w-3 align-[-2px]" />
								Evidence incomplete · {groupMissing.length} source
								{groupMissing.length === 1 ? "" : "s"} not located
								{groupMatched.length > 0 && ` · ${groupMatched.length} matched`}
							</p>
						)}
						<div
							className={`flex flex-wrap gap-1.5 ${group.claim ? "pl-3" : ""}`}
						>
							{groupMissing.map((citation) => (
								<span
									key={citation.id}
									className="inline-flex items-center gap-1 rounded-full border border-neutral-300 border-dashed px-2.5 py-1 text-[11px] text-neutral-400"
								>
									<AlertCircle className="h-3 w-3 flex-shrink-0" />
									{citation.label} · not located
								</span>
							))}
							{groupMatched.map((citation) => {
								const instanceKey = `${group.key}:${citation.id}`;
								const isExpanded = expandedKey === instanceKey;
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
														setExpandedKey(isExpanded ? null : instanceKey)
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
											Matched source — this wording was found in the document at
											page {citation.page}. Whether it supports the claim is for
											you to judge. Click to open it.
										</TooltipContent>
									</Tooltip>
								);
							})}
						</div>

						{/* The inspect panel is the core loop's result — it renders directly under
						    the row that triggered it, not in a separate list at the bottom of the
						    block, so the chevron and its answer stay adjacent. */}
						<AnimatePresence initial={false}>
							{expandedCitation && (
								<motion.div
									key={expandedCitation.id}
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={{ duration: 0.15 }}
									className={`overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 ${
										group.claim ? "ml-3" : ""
									}`}
								>
									<p className="px-3 py-2 font-serif text-[13px] text-neutral-600 italic leading-relaxed">
										"{preview(expandedCitation.quote, EXPANDED_QUOTE_MAX)}"
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
																onClick={() =>
																	jumpToTrailItem(expandedCitation, item)
																}
																className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:border-brand/30 hover:text-brand"
															>
																<span className="font-medium">
																	{item.label}
																</span>
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
							)}
						</AnimatePresence>
					</div>
				);
			})}

			{ungroupedUnresolved.length > 0 && (
				<div className="rounded-lg border border-neutral-300 border-dashed px-3 py-2">
					<p className="mb-1 flex items-center gap-1.5 font-medium text-[11px] text-neutral-500 uppercase tracking-wide">
						<AlertCircle className="h-3 w-3" />
						Not located
					</p>
					{ungroupedUnresolved.map((citation) => (
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
