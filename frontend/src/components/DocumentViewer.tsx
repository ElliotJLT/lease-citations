import { motion } from "framer-motion";
import {
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
	PanelRightClose,
	PanelRightOpen,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import type { Document } from "../types";
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
}

export function DocumentViewer({
	document,
	collapsed,
	onToggleCollapse,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

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
				className="flex h-full flex-shrink-0 flex-col items-center overflow-hidden rounded-xl border border-neutral-200 bg-white"
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
				className="flex h-full flex-shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
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
			className="relative flex h-full flex-shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
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
						<Page
							pageNumber={currentPage}
							width={pdfPageWidth}
							loading={
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
								</div>
							}
						/>
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
						onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
						onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</motion.div>
	);
}
