import { useCallback, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocument } from "./hooks/use-document";
import { useMessages } from "./hooks/use-messages";

export default function App() {
	// Panels hand width to each other as the work moves from asking to verifying: fold the
	// conversation list away while reading an answer, fold the reader away while composing.
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [readerCollapsed, setReaderCollapsed] = useState(false);

	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		refresh: refreshConversations,
	} = useConversations();

	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		send,
	} = useMessages(selectedId);

	const {
		document,
		upload,
		refresh: refreshDocument,
	} = useDocument(selectedId);

	const handleSend = useCallback(
		async (content: string) => {
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	const handleUpload = useCallback(
		async (file: File) => {
			const doc = await upload(file);
			if (doc) {
				refreshDocument();
				refreshConversations();
			}
		},
		[upload, refreshDocument, refreshConversations],
	);

	const handleCreate = useCallback(async () => {
		await create();
	}, [create]);

	return (
		<TooltipProvider delayDuration={200}>
			{/* Three cards on a ground, rather than panels butted together: each region reads as
			    its own surface, and folding one away leaves the others intact. The ground is
			    Orbital's own pale ice; reading surfaces stay white. */}
			<div className="flex h-screen gap-4 bg-ground p-4">
				<ChatSidebar
					conversations={conversations}
					selectedId={selectedId}
					loading={conversationsLoading}
					collapsed={sidebarCollapsed}
					onSelect={select}
					onCreate={handleCreate}
					onDelete={remove}
					onToggleCollapse={() => setSidebarCollapsed((open) => !open)}
				/>

				<ChatWindow
					messages={messages}
					loading={messagesLoading}
					error={messagesError}
					streaming={streaming}
					streamingContent={streamingContent}
					hasDocument={!!document}
					conversationId={selectedId}
					title={conversations.find((c) => c.id === selectedId)?.title ?? null}
					documentName={document?.filename ?? null}
					onSend={handleSend}
					onUpload={handleUpload}
				/>

				<DocumentViewer
					document={document}
					collapsed={readerCollapsed}
					onToggleCollapse={() => setReaderCollapsed((open) => !open)}
				/>
			</div>
		</TooltipProvider>
	);
}
