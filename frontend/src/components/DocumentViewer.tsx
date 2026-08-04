import { motion } from "framer-motion";
import {
	ChevronLeft,
	ChevronRight,
	FileText,
	Info,
	Loader2,
	PanelRightClose,
	PanelRightOpen,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import { trailItemToCitation } from "../lib/citations";
import {
	applyHighlight,
	clearHighlights,
	findQuoteInTextLayer,
} from "../lib/highlight";
import type { Citation, Claim, Document, TrailItem } from "../types";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

// Orbital's evidence-surface palette: navy for matched structure and text, sky for the
// resting surface, orange for whatever the lawyer is currently acting on. Applied as literal values (not the
// app's existing `brand`/`accent` tokens) because this panel is being tuned independently —
// see DECISIONS.md before promoting these into the shared token set.
const NAVY = "#2D6984";
const SKY = "#E2F7FE";
const ORANGE = "#EE7743";

/** Deterministic relationship labels. `services/trail.py` only ever resolves these two kinds,
 *  by matching the document's own text, so these are the only descriptions this panel can
 *  honestly attach to a related provision. */
function trailKindLabel(item: TrailItem): string {
	return item.kind === "definition"
		? "Defined term"
		: "Explicit cross-reference";
}

/**
 * The evidence for the currently selected source, docked above the page navigation.
 *
 * It deliberately carries neither the claim text nor the quotation: the chat already shows what
 * the model asserted, and the PDF above already shows the wording, highlighted. What is left is
 * the part that exists nowhere else on screen. Where this source sits in the answer's evidence
 * (`Source 5 of 8`, with controls to walk the rest), whether more than one proposition leans on
 * it, and which provisions it must be read with.
 *
 * It stays anchored to the source the lawyer selected even while they browse its related
 * provisions. Selecting one jumps the PDF and marks that item active; the originating clause in
 * the header becomes the way back, rather than a second control competing for the same job.
 */
function CitationInspector({
	citation,
	usedInCount,
	position,
	total,
	activeTrailItem,
	onSelectTrailItem,
	onReturn,
	onClose,
	onStep,
}: {
	citation: Citation;
	usedInCount: number;
	position: number | null;
	total: number;
	activeTrailItem: TrailItem | null;
	onSelectTrailItem: (item: TrailItem) => void;
	onReturn: () => void;
	onClose: () => void;
	onStep: (delta: number) => void;
}) {
	const isTrailItemActive = (item: TrailItem) =>
		activeTrailItem?.kind === item.kind &&
		activeTrailItem?.label === item.label;

	return (
		<div className="flex flex-shrink-0 flex-col px-5 py-3.5">
			{/* Clause, page and status in one row. With a related provision selected this same
			    row becomes the breadcrumb, its first segment the way back. */}
			<div className="flex items-center justify-between gap-2 border-[#2D6984]/12 border-b pb-2.5">
				<div className="flex min-w-0 items-center gap-1 text-[13px]">
					{activeTrailItem ? (
						<>
							<button
								type="button"
								onClick={onReturn}
								className="truncate font-medium hover:underline"
								style={{ color: NAVY }}
							>
								{citation.label}
							</button>
							<span className="flex-shrink-0 text-neutral-400">›</span>
							<span className="truncate font-medium text-neutral-800">
								{activeTrailItem.label}
							</span>
							<span className="flex-shrink-0 text-neutral-400">
								· {trailKindLabel(activeTrailItem).toLowerCase()}
								{activeTrailItem.page != null && ` · p.${activeTrailItem.page}`}
							</span>
						</>
					) : (
						<>
							<span className="truncate font-medium text-neutral-800">
								{citation.label}
								{citation.page != null && (
									<span className="font-normal text-neutral-400">
										{" "}
										· p.{citation.page}
									</span>
								)}
							</span>
							{/* Names what was checked. Bare "Matched" invites the reading that the
							    claim was matched; what the system compared was wording against the
							    document's text. */}
							<span
								className="ml-1.5 flex-shrink-0 text-[11px]"
								style={{ color: citation.verified ? NAVY : "#a3a3a3" }}
							>
								{citation.verified ? "Wording matched" : "Wording not located"}
							</span>
							{usedInCount > 1 && (
								<span className="ml-1.5 flex-shrink-0 text-[11px] text-neutral-400">
									· Used in {usedInCount} statements
								</span>
							)}
						</>
					)}
				</div>
				{/* Evidence navigation belongs with the other controls, not stranded on a row
				    of its own beneath the content it steps through. */}
				<div className="flex flex-shrink-0 items-center gap-2">
					{position != null && total > 1 && (
						<span className="flex items-center gap-0.5 text-[11px] text-neutral-500">
							<span className="tabular-nums">
								Source {position} of {total}
							</span>
							<button
								type="button"
								onClick={() => onStep(-1)}
								disabled={position <= 1}
								aria-label="Previous source"
								className="rounded p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:hover:text-neutral-400"
							>
								<ChevronLeft className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={() => onStep(1)}
								disabled={position >= total}
								aria-label="Next source"
								className="rounded p-0.5 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:hover:text-neutral-400"
							>
								<ChevronRight className="h-3.5 w-3.5" />
							</button>
						</span>
					)}
					<button
						type="button"
						onClick={onClose}
						aria-label="Close inspector"
						className="text-neutral-400 hover:text-neutral-600"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* A source the model offered that could not be found. Says exactly that, and
			    nothing about whether the proposition itself is right or wrong. */}
			{!citation.verified && (
				<p className="pt-2.5 text-[11px] text-neutral-500 leading-relaxed">
					This source was offered for the selected proposition, but the quoted
					wording could not be matched in the current document.
				</p>
			)}

			{citation.trail.length > 0 && (
				<div className="grid grid-cols-[max-content_1fr] items-start gap-x-3 gap-y-2.5 pt-2.5">
					{/* Says who chose these. The trail is the one part of this panel the model
					    had no hand in: `services/trail.py` resolves the defined terms and clause
					    references the cited passage literally names, and lists one only if the
					    document itself defines or contains it. */}
					<div className="pt-px">
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="flex cursor-help items-center gap-1">
									<span
										className="rounded-sm px-1 py-0.5 font-semibold text-[10px] uppercase leading-none tracking-wide"
										style={{ backgroundColor: SKY, color: NAVY }}
									>
										Read with
									</span>
									<Info
										className="h-3 w-3 flex-shrink-0"
										style={{ color: `${NAVY}99` }}
									/>
								</span>
							</TooltipTrigger>
							<TooltipContent
								side="top"
								className="max-w-[300px] space-y-1 text-left"
							>
								<p className="font-medium">
									Everything this clause depends on, found for you.
								</p>
								<p className="text-white/75">
									The cited passage names each of these; each one was located in
									this document, at the page shown.
								</p>
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex flex-wrap items-center gap-1.5">
						{citation.trail.map((item) => {
							const active = isTrailItemActive(item);
							return (
								<button
									key={`${item.kind}-${item.label}`}
									type="button"
									onClick={() => onSelectTrailItem(item)}
									title={trailKindLabel(item)}
									className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] leading-none transition-colors"
									style={
										active
											? {
													borderColor: ORANGE,
													backgroundColor: ORANGE,
													color: "white",
												}
											: {
													borderColor: `${NAVY}4d`,
													backgroundColor: "white",
												}
									}
								>
									<span className="font-medium">{item.label}</span>
									{item.page != null && (
										<span
											className={active ? "text-white/75" : "text-neutral-400"}
										>
											· p.{item.page}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 760;
// The reader is where verification actually happens — reading a clause next to its
// highlight needs real column width, not a sidebar's worth. Opens wide by default and is
// still fully resizable down to MIN_WIDTH for anyone who wants the chat to dominate instead.
const DEFAULT_WIDTH = 560;
const RAIL_WIDTH = 52;

interface DocumentViewerProps {
	document: Document | null;
	collapsed: boolean;
	onToggleCollapse: () => void;
	/** The citation to jump to. `focusToken` changes on every click, even re-clicking the
	    same citation, so the effect re-runs even when nothing else about the target differs. */
	activeCitation: Citation | null;
	focusToken: number;
	/** Re-used to drive a "Read alongside" jump the same way a chat citation click does —
	 *  page change, highlight, and inspector re-open are all one code path. */
	onCitationJump: (citation: Citation) => void;
	/** All claims across the conversation, so the inspector can say how many propositions
	 *  lean on the passage currently open. */
	claims: Claim[];
	/** Every citation id mapped to its own answer's ordered, per-passage-unique citation list.
	 *  Lets the inspector place a source ("5 of 8") and step through the rest without knowing
	 *  anything about messages. */
	citationSiblings: Record<string, Citation[]>;
}

export function DocumentViewer({
	document,
	collapsed,
	onToggleCollapse,
	activeCitation,
	focusToken,
	onCitationJump,
	claims,
	citationSiblings,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const pageWrapperRef = useRef<HTMLDivElement>(null);
	// The page + quote we're trying to highlight once the text layer for that page renders.
	// A ref, not state: it's read from a pdf.js callback, not rendered itself. Carries the
	// `focusToken` it was set for, so a call that finally runs after a newer click has already
	// superseded it can recognise that and bail — see `runHighlightSearch`.
	const pendingTargetRef = useRef<{
		quote: string;
		page: number;
		token: number;
	} | null>(null);
	// Always the most recent `focusToken`, kept outside the closure `runHighlightSearch` is
	// frozen with. `onRenderTextLayerSuccess` (page changed) and the same-page rAF path can
	// both end up scheduled for one click and still be in flight when a second click lands —
	// without this, whichever one happens to finish last wins, even if it's the older one,
	// and the reader shows a highlight for a citation the lawyer already clicked past.
	const latestFocusTokenRef = useRef(focusToken);

	// Inspector state. `anchorCitation` is what the header/Supports/Read-alongside show, and
	// only changes on a *fresh* selection (a chat marker or footer click) — never on a "Read
	// alongside" click inside the inspector, which instead sets `activeTrailItem` and leaves
	// the anchor alone, so the inspector never swaps out from under the lawyer mid-browse.
	// `pendingTrailItemRef` is how the effect below tells the two kinds of jump apart: it's
	// only ever set by `handleTrailClick`, immediately before the same `onCitationJump` a
	// fresh chat click also calls.
	const [anchorCitation, setAnchorCitation] = useState<Citation | null>(null);
	const [activeTrailItem, setActiveTrailItem] = useState<TrailItem | null>(
		null,
	);
	const [inspectorDismissed, setInspectorDismissed] = useState(false);
	const pendingTrailItemRef = useRef<TrailItem | null>(null);

	// A new document (including switching conversations) invalidates any in-flight target.
	// biome-ignore lint/correctness/useExhaustiveDependencies: document?.id is the deliberate trigger; the body intentionally doesn't read `document` itself.
	useEffect(() => {
		setCurrentPage(1);
		setPdfLoading(true);
		setPdfError(null);
		setNumPages(0);
		setInspectorDismissed(false);
		setAnchorCitation(null);
		setActiveTrailItem(null);
		pendingTargetRef.current = null;
	}, [document?.id]);

	const runHighlightSearch = useCallback(() => {
		const target = pendingTargetRef.current;
		const wrapper = pageWrapperRef.current;
		if (!target || !wrapper) return;

		// A newer click has landed since this call was scheduled — it owns the highlight now
		// (either it already ran, or its own call is still queued behind this one). Applying
		// a stale target here would paint the wrong passage under a tooltip that's already
		// showing the new citation.
		if (target.token !== latestFocusTokenRef.current) return;

		const layer = wrapper.querySelector<HTMLElement>(".textLayer");
		if (!layer) return;

		clearHighlights(wrapper);
		const match = findQuoteInTextLayer(layer, target.quote);

		if (match) {
			applyHighlight(match.spans);
			match.spans[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
		}
		// A failed match currently fails silently: the reader still lands on the right page,
		// but nothing is highlighted. The honest "couldn't highlight it" banner that used to
		// sit here cost more vertical space than it earned, and the real fix is to make the
		// text-layer search agree with the backend's match rather than to narrate the gap.

		pendingTargetRef.current = null;
	}, []);

	// focusToken changes on every click, including re-clicking the same citation, which
	// activeCitation's identity alone would not catch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: focusToken is the deliberate trigger; activeCitation is read through it, not watched directly.
	useEffect(() => {
		latestFocusTokenRef.current = focusToken;
		if (!activeCitation) return;

		setInspectorDismissed(false);

		// A trail click sets the pending ref just before this jump fires: mark that item
		// active and leave the anchor untouched. Anything else is a fresh selection — it
		// becomes the new anchor, and there's no active trail item yet.
		const trailItem = pendingTrailItemRef.current;
		pendingTrailItemRef.current = null;
		if (trailItem) {
			setActiveTrailItem(trailItem);
		} else {
			setAnchorCitation(activeCitation);
			setActiveTrailItem(null);
		}

		// A source that couldn't be located has no page to open and no wording to highlight.
		// It still opens the inspector, which is the only place that can say so against the
		// proposition it was offered for.
		if (activeCitation.page == null) return;

		pendingTargetRef.current = {
			quote: activeCitation.quote,
			page: activeCitation.page,
			token: focusToken,
		};

		if (currentPage === activeCitation.page) {
			// Page isn't changing, so react-pdf won't re-render the text layer and
			// onRenderTextLayerSuccess won't fire again. Run it ourselves — but after this
			// render commits, or the highlight lands on spans the commit then replaces.
			requestAnimationFrame(runHighlightSearch);
		} else {
			setCurrentPage(activeCitation.page);
		}
	}, [focusToken]);

	const goToPage = useCallback((page: number) => {
		pendingTargetRef.current = null;
		setCurrentPage(page);
	}, []);

	/** A "Read alongside" click inside the inspector: jump to the referenced passage, marking
	 *  the pending ref so the effect above knows to keep `anchorCitation` as it is. */
	const handleTrailClick = useCallback(
		(item: TrailItem) => {
			if (!anchorCitation) return;
			pendingTrailItemRef.current = item;
			onCitationJump(trailItemToCitation(anchorCitation, item));
		},
		[anchorCitation, onCitationJump],
	);

	/** Re-jump to the anchor's own passage — an ordinary (non-trail) jump, so the effect
	 *  clears `activeTrailItem` on its own. */
	const handleReturn = useCallback(() => {
		if (anchorCitation) onCitationJump(anchorCitation);
	}, [anchorCitation, onCitationJump]);

	// How many propositions lean on the anchored passage. Sources are already deduplicated by
	// document span upstream, so a count above one means the model genuinely offered the same
	// wording for more than one statement.
	const usedInCount = useMemo(() => {
		if (!anchorCitation) return 0;
		return claims.filter((c) => c.citation_ids.includes(anchorCitation.id))
			.length;
	}, [claims, anchorCitation]);

	// Where the anchored passage sits in its own answer's evidence, so a lawyer can walk the
	// whole set in order. `siblings` is that answer's citation list, already unique per passage.
	const siblings = useMemo(
		() => (anchorCitation ? (citationSiblings[anchorCitation.id] ?? []) : []),
		[citationSiblings, anchorCitation],
	);
	const position = useMemo(() => {
		if (!anchorCitation) return null;
		const index = siblings.findIndex((c) => c.id === anchorCitation.id);
		return index === -1 ? null : index + 1;
	}, [siblings, anchorCitation]);

	/** Step to the previous/next source of the same answer. An ordinary jump, so a not-located
	 *  neighbour still opens the inspector and simply doesn't move the page. */
	const handleStep = useCallback(
		(delta: number) => {
			if (position == null) return;
			const next = siblings[position - 1 + delta];
			if (next) onCitationJump(next);
		},
		[position, siblings, onCitationJump],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);

			const startX = e.clientX;
			const startWidth = width;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = startX - moveEvent.clientX;
				const newWidth = Math.min(
					MAX_WIDTH,
					Math.max(MIN_WIDTH, startWidth + delta),
				);
				setWidth(newWidth);
			};

			const handleMouseUp = () => {
				setDragging(false);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[width],
	);

	const pdfPageWidth = width - 48; // account for px-4 padding on each side

	if (collapsed) {
		return (
			<motion.div
				animate={{ width: RAIL_WIDTH }}
				transition={{ duration: 0.2, ease: "easeOut" }}
				className="flex h-full flex-shrink-0 flex-col items-center overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
			>
				<div className="flex h-12 w-full flex-shrink-0 items-center justify-center border-b border-neutral-100">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={onToggleCollapse}>
								<PanelRightOpen className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="left">
							{document ? `Show ${document.filename}` : "Show document"}
						</TooltipContent>
					</Tooltip>
				</div>
				{document && <FileText className="mt-3 h-4 w-4 text-neutral-300" />}
			</motion.div>
		);
	}

	if (!document) {
		return (
			<motion.div
				animate={{ width }}
				transition={{ duration: 0.2, ease: "easeOut" }}
				className="flex h-full flex-shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
			>
				<div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-neutral-100 px-2 pl-4">
					<span className="text-sm font-semibold text-neutral-800">
						Document
					</span>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={onToggleCollapse}>
								<PanelRightClose className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="left">Hide panel</TooltipContent>
					</Tooltip>
				</div>
				<div className="flex flex-1 flex-col items-center justify-center">
					<FileText className="mb-3 h-10 w-10 text-neutral-300" />
					<p className="text-sm text-neutral-400">No document uploaded</p>
				</div>
			</motion.div>
		);
	}

	const pdfUrl = getDocumentUrl(document.id);

	return (
		<motion.div
			ref={containerRef}
			animate={{ width }}
			transition={
				dragging ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }
			}
			className="relative flex h-full flex-shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
		>
			{/* Resize handle */}
			<div
				className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-neutral-300 ${
					dragging ? "bg-neutral-400" : ""
				}`}
				onMouseDown={handleMouseDown}
			/>

			{/* Header */}
			<div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-neutral-100 pr-2 pl-4">
				<p className="min-w-0 flex-1 truncate font-medium text-neutral-800 text-sm">
					{document.filename}
				</p>
				{/* Paging sits with the other controls rather than stacked under the filename,
				    where it was crowding the name it belongs to. Grey and thin on purpose: it's
				    navigation you reach for, never the thing the panel is about. */}
				{numPages > 0 && (
					<div className="flex flex-shrink-0 items-center gap-0.5 text-neutral-400">
						<button
							type="button"
							disabled={currentPage <= 1}
							aria-label="Previous page"
							onClick={() => goToPage(Math.max(1, currentPage - 1))}
							className="rounded p-0.5 hover:text-neutral-600 disabled:opacity-30 disabled:hover:text-neutral-400"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</button>
						<span className="text-[11px] tabular-nums">
							Page {currentPage} of {numPages}
						</span>
						<button
							type="button"
							disabled={currentPage >= numPages}
							aria-label="Next page"
							onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
							className="rounded p-0.5 hover:text-neutral-600 disabled:opacity-30 disabled:hover:text-neutral-400"
						>
							<ChevronRight className="h-3.5 w-3.5" />
						</button>
					</div>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="flex-shrink-0"
							onClick={onToggleCollapse}
						>
							<PanelRightClose className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="left">Hide document</TooltipContent>
				</Tooltip>
			</div>

			{/* PDF content */}
			<div className="flex-1 overflow-y-auto p-4">
				{pdfError && (
					<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{pdfError}
					</div>
				)}

				<PDFDocument
					file={pdfUrl}
					onLoadSuccess={({ numPages: pages }) => {
						setNumPages(pages);
						setPdfLoading(false);
						setPdfError(null);
					}}
					onLoadError={(error) => {
						setPdfError(`Failed to load PDF: ${error.message}`);
						setPdfLoading(false);
					}}
					loading={
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
						</div>
					}
				>
					{!pdfLoading && !pdfError && (
						<div ref={pageWrapperRef}>
							<Page
								pageNumber={currentPage}
								width={pdfPageWidth}
								onRenderTextLayerSuccess={runHighlightSearch}
								loading={
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
									</div>
								}
							/>
						</div>
					)}
				</PDFDocument>
			</div>

			{/* Inspector and page navigation share one surface — a single sky background and
			    a subtle internal divider, rather than two separately-bordered blocks — so the
			    bottom of the reader reads as one unit that resizes the page above it. */}
			{anchorCitation && !inspectorDismissed && (
				<div className="flex flex-shrink-0 flex-col border-[#2D6984]/20 border-t bg-[#E2F7FE]">
					<CitationInspector
						citation={anchorCitation}
						usedInCount={usedInCount}
						position={position}
						total={siblings.length}
						activeTrailItem={activeTrailItem}
						onSelectTrailItem={handleTrailClick}
						onReturn={handleReturn}
						onClose={() => setInspectorDismissed(true)}
						onStep={handleStep}
					/>
				</div>
			)}
		</motion.div>
	);
}
