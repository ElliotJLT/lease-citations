import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Citation, Message } from "../types";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { MessageBubble, StreamingBubble } from "./MessageBubble";

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	hasDocument: boolean;
	conversationId: string | null;
	title: string | null;
	/** The one citation currently selected app-wide — threaded down so the right inline marker,
	 *  in whichever message it appears, renders as selected. */
	selectedCitationId: string | null;
	onSend: (content: string) => void;
	onUpload: (file: File) => void;
	onCitationJump: (citation: Citation) => void;
}

/** The card the conversation lives in, so every state below shares one frame. */
/** The card the conversation lives in, so every state below shares one frame. The document
 *  name used to repeat here too — the reader panel already carries it beside the filename
 *  icon, so this header now only says which conversation you're in. */
function ChatCard({
	title,
	children,
}: {
	title: string | null;
	children: React.ReactNode;
}) {
	return (
		<main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
			<header className="flex h-12 flex-shrink-0 items-center border-b border-neutral-100 px-4">
				<p className="truncate text-sm font-semibold text-neutral-800">
					{title ?? "Document Q&A"}
				</p>
			</header>
			{children}
		</main>
	);
}

export function ChatWindow({
	messages,
	loading,
	error,
	streaming,
	streamingContent,
	hasDocument,
	conversationId,
	title,
	selectedCitationId,
	onSend,
	onUpload,
	onCitationJump,
}: ChatWindowProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive or during streaming
	const messagesLength = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and streamingContent are intentional triggers for auto-scroll
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messagesLength, streamingContent]);

	// No conversation selected
	if (!conversationId) {
		return (
			<ChatCard title={null}>
				<div className="flex flex-1 items-center justify-center">
					<p className="text-sm text-neutral-400">
						Select a conversation, or start a new one
					</p>
				</div>
			</ChatCard>
		);
	}

	// Loading messages
	if (loading) {
		return (
			<ChatCard title={title}>
				<div className="flex flex-1 items-center justify-center">
					<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
				</div>
			</ChatCard>
		);
	}

	// Empty conversation - show upload prompt
	if (messages.length === 0 && !streaming) {
		return (
			<ChatCard title={title}>
				{/* Same centred column as the populated view, so the input bar doesn't jump
				    width the moment the first message lands. */}
				<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
					<div className="flex flex-1 items-center justify-center">
						{hasDocument ? (
							<p className="text-sm text-neutral-500">
								Document uploaded. Ask a question to get started.
							</p>
						) : (
							<EmptyState onUpload={onUpload} />
						)}
					</div>
					<ChatInput
						onSend={onSend}
						onUpload={onUpload}
						disabled={streaming}
						hasDocument={hasDocument}
					/>
				</div>
			</ChatCard>
		);
	}

	return (
		<ChatCard title={title}>
			{error && (
				<div className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
					{error}
				</div>
			)}

			{/* The thread and the input share one centred, capped column, rather than a narrow
			    message list stranded inside a full-bleed card — at wide viewports that read as
			    a dead gutter down the middle instead of a page with margins. */}
			<div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
				<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
					<div className="space-y-1">
						{messages.map((message) => (
							<MessageBubble
								key={message.id}
								message={message}
								onCitationJump={onCitationJump}
								selectedCitationId={selectedCitationId}
							/>
						))}
						{streaming && <StreamingBubble content={streamingContent} />}
					</div>
				</div>

				<ChatInput
					onSend={onSend}
					onUpload={onUpload}
					disabled={streaming}
					hasDocument={hasDocument}
				/>
			</div>
		</ChatCard>
	);
}
