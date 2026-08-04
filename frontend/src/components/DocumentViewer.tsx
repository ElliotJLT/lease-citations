import { motion } from "framer-motion";
import {
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	PanelRightClose,
	PanelRightOpen,
	Quote,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import {
	applyHighlight,
	clearHighlights,
	findQuoteInTextLayer,
} from "../lib/highlight";
import type { Citation, Document } from "../types";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 400;
const RAIL_WIDTH = 52;

interface DocumentViewerProps {
	document: Document | null;
	collapsed: boolean;
	onToggleCollapse: () => void;
	/** The citation to jump to. `focusToken` changes on every click, even re-clicking the
	    same citation, so the effect re-runs even when nothing else about the target differs. */
	activeCitation: Citation | null;
	focusToken: number;
}

export function DocumentViewer({
	document,
	collapsed,
	onToggleCollapse,
	activeCitation,
	focusToken,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	// Set when a citation's quote couldn't be located in the rendered page — the honest
	// fallback: the reader still jumps to the right page, and the claimed passage is shown
	// above it, rather than pretending a highlight landed somewhere it didn't.
	const [unhighlightedQuote, setUnhighlightedQuote] = useState<string | null>(
		null,
	);
	const containerRef = useRef<HTMLDivElement>(null);
	const pageWrapperRef = useRef<HTMLDivElement>(null);
	// The page + quote we're trying to highlight once the text layer for that page renders.
	// A ref, not state: it's read from a pdf.js callback, not rendered itself.
	const pendingTargetRef = useRef<{ quote: string; page: number } | null>(null);

	// A new document (including switching conversations) invalidates any in-flight target.
	// biome-ignore lint/correctness/useExhaustiveDependencies: document?.id is the deliberate trigger; the body intentionally doesn't read `document` itself.
	useEffect(() => {
		setCurrentPage(1);
		setPdfLoading(true);
		setPdfError(null);
		setNumPages(0);
		setUnhighlightedQuote(null);
		pendingTargetRef.current = null;
	}, [document?.id]);

	const runHighlightSearch = useCallback(() => {
		const target = pendingTargetRef.current;
		const wrapper = pageWrapperRef.current;
		if (!target || !wrapper) return;

		const layer = wrapper.querySelector<HTMLElement>(".textLayer");
		if (!layer) return;

		clearHighlights(wrapper);
		const match = findQuoteInTextLayer(layer, target.quote);

		if (match) {
			applyHighlight(match.spans);
			match.spans[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
			setUnhighlightedQuote(null);
		} else {
			// Rendered text layer and the extracted text the backend verified against don't
			// always segment identically. The page is still right; say so plainly rather than
			// silently doing nothing.
			setUnhighlightedQuote(target.quote);
		}

		pendingTargetRef.current = null;
	}, []);

	// focusToken changes on every click, including re-clicking the same citation, which
	// activeCitation's identity alone would not catch.
	// biome-ignore lint/correctness/useExhaustiveDependencies: focusToken is the deliberate trigger; activeCitation is read through it, not watched directly.
	useEffect(() => {
		if (!activeCitation || activeCitation.page == null) return;

		pendingTargetRef.current = {
			quote: activeCitation.quote,
			page: activeCitation.page,
		};
		setUnhighlightedQuote(null);

		if (currentPage === activeCitation.page) {
			// Page isn't changing, so react-pdf won't re-render the text layer and
			// onRenderTextLayerSuccess won't fire again — run the search directly.
			runHighlightSearch();
		} else {
			setCurrentPage(activeCitation.page);
		}
	}, [focusToken]);

	const goToPage = useCallback((page: number) => {
		pendingTargetRef.current = null;
		setUnhighlightedQuote(null);
		setCurrentPage(page);
	}, []);

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
			<div className="flex h-12 flex-shrink-0 items-center justify-between gap-2 border-b border-neutral-100 pr-2 pl-4">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-neutral-800">
						{document.filename}
					</p>
					<p className="text-xs text-neutral-400">
						{document.page_count} page{document.page_count !== 1 ? "s" : ""}
					</p>
				</div>
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

			{/* Honest fallback: right page, quote pinned, no highlight pretending to be precise */}
			{unhighlightedQuote && (
				<div className="flex items-start gap-2 border-b border-dashed border-neutral-200 bg-neutral-50 px-4 py-2.5">
					<Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
					<p className="text-xs text-neutral-500">
						On this page — couldn't automatically highlight it, so here's the
						exact wording:{" "}
						<span className="font-serif italic text-neutral-600">
							"{unhighlightedQuote}"
						</span>
					</p>
				</div>
			)}

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

			{/* Page navigation */}
			{numPages > 0 && (
				<div className="flex items-center justify-center gap-3 border-t border-neutral-100 px-4 py-2.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage <= 1}
						onClick={() => goToPage(Math.max(1, currentPage - 1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-neutral-500">
						Page {currentPage} of {numPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage >= numPages}
						onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</motion.div>
	);
}
