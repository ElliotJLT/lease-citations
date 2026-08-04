import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Citation } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationChipsProps {
	citations: Citation[];
	onJump: (citation: Citation) => void;
}

function quotePreview(quote: string, max = 140): string {
	return quote.length > max ? `${quote.slice(0, max).trimEnd()}…` : quote;
}

/**
 * Evidence for an answer's claims. Verified citations (a quote the server located in the
 * document) jump the reader to the passage; unverified ones (offered but not found) stay in
 * place — there's nowhere to send the lawyer — but still expand, so they can see and judge
 * what the model claimed. Dual-mode per chip: hover previews the quote, click on the label
 * commits to the document, the chevron is a separate target that expands it inline.
 */
export function CitationChips({ citations, onJump }: CitationChipsProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	if (citations.length === 0) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, delay: 0.1 }}
			className="mt-2 flex flex-col gap-1.5"
		>
			<div className="flex flex-wrap gap-1.5">
				{citations.map((citation) => {
					const isExpanded = expandedId === citation.id;
					return (
						<Tooltip key={citation.id}>
							<TooltipTrigger asChild>
								<div
									className={`inline-flex items-stretch overflow-hidden rounded-full border text-xs font-medium ${
										citation.verified
											? "border-brand/20 bg-brand-soft text-brand"
											: "border-dashed border-neutral-300 text-neutral-400"
									}`}
								>
									<button
										type="button"
										disabled={!citation.verified}
										onClick={() => onJump(citation)}
										className={`flex items-center gap-1 py-1 pr-1.5 pl-2.5 ${
											citation.verified
												? "cursor-pointer hover:bg-brand/10"
												: "cursor-default"
										}`}
									>
										{citation.verified ? (
											<ShieldCheck className="h-3 w-3 flex-shrink-0" />
										) : (
											<ShieldAlert className="h-3 w-3 flex-shrink-0" />
										)}
										<span>{citation.label}</span>
										{citation.verified && citation.page != null && (
											<span className="text-brand/60">· p.{citation.page}</span>
										)}
									</button>
									<button
										type="button"
										onClick={() =>
											setExpandedId(isExpanded ? null : citation.id)
										}
										aria-label={
											isExpanded ? "Collapse quote" : "Show quoted passage"
										}
										className={`flex items-center border-l pr-2 pl-1 ${
											citation.verified
												? "border-brand/20 hover:bg-brand/10"
												: "border-neutral-200 hover:bg-neutral-100"
										}`}
									>
										<ChevronRight
											className={`h-3 w-3 transition-transform duration-150 ${
												isExpanded ? "rotate-90" : ""
											}`}
										/>
									</button>
								</div>
							</TooltipTrigger>
							<TooltipContent side="top" className="max-w-xs">
								{citation.verified
									? `"${quotePreview(citation.quote)}"`
									: "Couldn't locate this quote in the document — treat it as unconfirmed."}
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>

			<AnimatePresence initial={false}>
				{citations.map((citation) =>
					expandedId === citation.id ? (
						<motion.div
							key={citation.id}
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.15 }}
							className={`overflow-hidden rounded-lg border px-3 py-2 font-serif text-sm italic ${
								citation.verified
									? "border-neutral-100 bg-neutral-50 text-neutral-700"
									: "border-dashed border-neutral-200 text-neutral-500"
							}`}
						>
							"{citation.quote}"
						</motion.div>
					) : null,
				)}
			</AnimatePresence>
		</motion.div>
	);
}
