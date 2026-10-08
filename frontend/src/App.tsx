import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocument } from "./hooks/use-document";
import { useMessages } from "./hooks/use-messages";
import type { Citation } from "./types";

export default function App() {
	// Panels hand width to each other as the work moves from asking to verifying: fold the
	// conversation list away while reading an answer, fold the reader away while composing.
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [readerCollapsed, setReaderCollapsed] = useState(false);

	// The citation currently sending the reader somewhere. focusToken increments on every
	// jump, including re-clicking the same citation, so the reader's effect re-fires even
	// when the citation object itself hasn't changed.
	const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
	const [focusToken, setFocusToken] = useState(0);

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

	// Flattened once here rather than re-derived per click: the inspector counts how many
	// propositions lean on the passage currently open.
	const claims = useMemo(() => messages.flatMap((m) => m.claims), [messages]);

	// Every citation id pointed at its own answer's citation list, so the inspector can say
	// "source 5 of 8" and step through them without needing to know about messages. The lists
	// are already unique per document passage (the verifier dedupes upstream), which is what
	// keeps a passage supporting three claims from being counted three times.
	const citationSiblings = useMemo(() => {
		const map: Record<string, Citation[]> = {};
		for (const message of messages) {
			for (const citation of message.citations) {
				map[citation.id] = message.citations;
			}
		}
		return map;
	}, [messages]);

	const {
		document,
		upload,
		refresh: refreshDocument,
	} = useDocument(selectedId);

	// Once a document is in play — just uploaded, or already attached to a conversation you
	// switch into — the reader is where the work happens, so the sidebar steps back to give
	// it the room. A one-time nudge on the id changing, not a standing rule: the user's own
	// toggle after this always wins, nothing here re-collapses it a second time.
	// biome-ignore lint/correctness/useExhaustiveDependencies: document?.id is the deliberate trigger; only its presence matters, not the object identity.
	useEffect(() => {
		if (document) setSidebarCollapsed(true);
	}, [document?.id]);

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

	const handleCitationJump = useCallback((citation: Citation) => {
		setActiveCitation(citation);
		setFocusToken((token) => token + 1);
		setReaderCollapsed(false);
	}, []);

	// A selected source is a claim about what the lawyer is looking at right now, so it has to
	// end when they look away. Clicking anywhere that isn't citation furniture, or pressing
	// Escape, drops the selection: the marker goes back to teal, the highlight lifts, the
	// inspector closes. The reader stays on the page it's on — the lawyer navigated there and
	// nothing about dismissing a source should take that back.
	const dismissCitation = useCallback(() => setActiveCitation(null), []);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (target?.closest("[data-citation-ui]")) return;
			dismissCitation();
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") dismissCitation();
		};
		window.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [dismissCitation]);

	return (
		<TooltipProvider delayDuration={200}>
			{/* Three cards on a ground, rather than panels butted together: each region reads as
			    its own surface, and folding one away leaves the others intact. The ground is
			    the pale ice ground; reading surfaces stay white. */}
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
					selectedCitationId={activeCitation?.id ?? null}
					onSend={handleSend}
					onUpload={handleUpload}
					onCitationJump={handleCitationJump}
				/>

				<DocumentViewer
					document={document}
					collapsed={readerCollapsed}
					onToggleCollapse={() => setReaderCollapsed((open) => !open)}
					activeCitation={activeCitation}
					focusToken={focusToken}
					onCitationJump={handleCitationJump}
					claims={claims}
					citationSiblings={citationSiblings}
				/>
			</div>
		</TooltipProvider>
	);
}
