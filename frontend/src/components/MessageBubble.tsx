import { motion } from "framer-motion";
import { AlertCircle, Check, HelpCircle } from "lucide-react";
import { useState } from "react";
import { preview } from "../lib/citations";
import type { Citation, Claim, Message } from "../types";
import { AnswerBody } from "./AnswerBody";
import { BrandMark } from "./BrandMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface MessageBubbleProps {
	message: Message;
	onCitationJump: (citation: Citation) => void;
	/** The one citation currently selected app-wide (drives which inline marker, if any, shows
	 *  as selected — and unfolds its "Read alongside" strip). */
	selectedCitationId: string | null;
}

/**
 * The quiet line under an answer: what the system established about its evidence, and nothing
 * more. No re-rendering of the propositions themselves — those already carry their own inline
 * markers — just a count, and an opt-in disclosure for the full audit list.
 */
function SourcesFooter({
	citations,
	claims,
	selectedCitationId,
	onSelect,
}: {
	citations: Citation[];
	claims: Claim[];
	selectedCitationId: string | null;
	onSelect: (citation: Citation) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	// `citations` is already one row per unique document passage — the verifier dedupes by
	// span upstream — so a passage supporting three propositions still appears once here,
	// annotated rather than repeated.
	const usageById = new Map<string, number>();
	for (const claim of claims) {
		for (const id of new Set(claim.citation_ids)) {
			usageById.set(id, (usageById.get(id) ?? 0) + 1);
		}
	}
	const matched = citations.filter((c) => c.verified);
	const unresolved = citations.filter((c) => !c.verified);

	// "Matched" is dropped from the mixed case on purpose: it's derivable from the other two
	// numbers, and a lawyer scanning for the alarm shouldn't have to parse three figures to
	// find the one that matters. The total still names what's being counted ("N sources"), so
	// "3 not located" reads as an alarm against a stated total, not a bare number.
	const summary =
		unresolved.length === 0
			? `${matched.length} source${matched.length === 1 ? "" : "s"} matched`
			: `${citations.length} source${citations.length === 1 ? "" : "s"} · ${unresolved.length} not located`;

	return (
		<div className="mt-2 text-[11px] text-neutral-400">
			<span>{summary}</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="What does matched mean?"
						className="ml-1 inline-flex translate-y-[2px] cursor-help text-neutral-300 hover:text-neutral-500"
					>
						<HelpCircle className="h-3 w-3" />
					</button>
				</TooltipTrigger>
				<TooltipContent
					side="top"
					className="max-w-[280px] space-y-1 text-left"
				>
					<p>
						<span className="font-medium">Matched</span> — this wording was
						found in the document, at the page shown.
					</p>
					<p className="text-neutral-300">
						It does not mean the claim it supports is correct: that's for you to
						judge. "Not located" means the model offered a source that couldn't
						be found in this document.
					</p>
				</TooltipContent>
			</Tooltip>
			<span className="mx-1.5">·</span>
			<button
				type="button"
				data-citation-ui
				onClick={() => setExpanded((open) => !open)}
				className="underline decoration-neutral-300 decoration-dotted underline-offset-2 hover:text-neutral-600 hover:decoration-neutral-400"
			>
				{expanded ? "Hide sources" : "View all sources"}
			</button>

			{expanded && (
				<ul className="mt-1.5 flex flex-col gap-1.5 border-neutral-200 border-l pl-2.5">
					{citations.map((citation) => (
						<li key={citation.id} className="flex items-start gap-1.5">
							{citation.verified ? (
								<Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-brand" />
							) : (
								<AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-neutral-400" />
							)}
							<p className="text-neutral-500">
								{citation.verified ? (
									<button
										type="button"
										data-citation-ui
										onClick={() => onSelect(citation)}
										className={`font-medium underline-offset-2 hover:underline ${
											selectedCitationId === citation.id
												? "text-brand"
												: "text-neutral-600"
										}`}
									>
										{citation.label}
										{citation.page != null && ` · p.${citation.page}`}
									</button>
								) : (
									<span className="font-medium text-neutral-500">
										{citation.label}
									</span>
								)}
								{" — "}
								{citation.verified ? (
									<span className="font-serif text-neutral-500 italic">
										"{preview(citation.quote, 120)}"
									</span>
								) : (
									<span>not located</span>
								)}
								{(usageById.get(citation.id) ?? 0) > 1 && (
									<span className="text-neutral-400">
										{" "}
										· Used in {usageById.get(citation.id)} statements
									</span>
								)}
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function MessageBubble({
	message,
	onCitationJump,
	selectedCitationId,
}: MessageBubbleProps) {
	if (message.role === "system") {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex justify-center py-2"
			>
				<p className="text-xs text-neutral-400">{message.content}</p>
			</motion.div>
		);
	}

	if (message.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex justify-end py-1.5"
			>
				<div className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-neutral-800">
						{message.content}
					</p>
				</div>
			</motion.div>
		);
	}

	// Assistant message
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 py-1.5"
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand">
				<BrandMark className="h-5 w-auto text-accent" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				<AnswerBody
					content={message.content}
					citations={message.citations}
					selectedCitationId={selectedCitationId}
					onSelectCitation={onCitationJump}
				/>
				{message.citations.length > 0 ? (
					<SourcesFooter
						citations={message.citations}
						claims={message.claims}
						selectedCitationId={selectedCitationId}
						onSelect={onCitationJump}
					/>
				) : (
					/* Precise about what was established: nothing was offered and nothing
						   matched. Not that the document is silent — that isn't checkable. */
					<p className="mt-2 text-xs text-neutral-400">
						<span className="font-medium text-neutral-500">
							No supporting provision identified.
						</span>{" "}
						No passage in this document was matched to this answer.
					</p>
				)}
			</div>
		</motion.div>
	);
}

interface StreamingBubbleProps {
	content: string;
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
	return (
		<div className="flex gap-3 py-1.5">
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand">
				<BrandMark className="h-5 w-auto text-accent" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				{content ? (
					<AnswerBody
						content={content}
						citations={[]}
						streaming
						selectedCitationId={null}
						onSelectCitation={() => {}}
					/>
				) : (
					<div className="flex items-center gap-1 py-2">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
				<span className="inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
			</div>
		</div>
	);
}
