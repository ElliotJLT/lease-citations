import { FileText, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Message } from "../types";
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
	documentName: string | null;
	onSend: (content: string) => void;
	onUpload: (file: File) => void;
}

/** The card the conversation lives in, so every state below shares one frame. */
function ChatCard({
	title,
	documentName,
	children,
}: {
	title: string | null;
	documentName: string | null;
	children: React.ReactNode;
}) {
	return (
		<main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
			<header className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-4">
				<p className="truncate text-sm font-semibold text-neutral-800">
					{title ?? "Document Q&A"}
				</p>
				{documentName && (
					<span className="flex min-w-0 flex-shrink-0 items-center gap-1.5 text-xs text-neutral-400">
						<FileText className="h-3.5 w-3.5" />
						<span className="max-w-[220px] truncate">{documentName}</span>
					</span>
				)}
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
	documentName,
	onSend,
	onUpload,
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
			<ChatCard title={null} documentName={null}>
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
			<ChatCard title={title} documentName={documentName}>
				<div className="flex flex-1 items-center justify-center">
					<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
				</div>
			</ChatCard>
		);
	}

	// Empty conversation - show upload prompt
	if (messages.length === 0 && !streaming) {
		return (
			<ChatCard title={title} documentName={documentName}>
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
			</ChatCard>
		);
	}

	return (
		<ChatCard title={title} documentName={documentName}>
			{error && (
				<div className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
					{error}
				</div>
			)}

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
				<div className="mx-auto max-w-2xl space-y-1">
					{messages.map((message) => (
						<MessageBubble key={message.id} message={message} />
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
		</ChatCard>
	);
}
