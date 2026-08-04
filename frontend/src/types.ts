export interface Conversation {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	has_document: boolean;
}

/** A provision the cited passage depends on — resolved from the document, never inferred. */
export interface TrailItem {
	kind: "definition" | "cross-reference";
	label: string;
	text: string;
	page: number | null;
}

export interface Citation {
	id: string;
	label: string;
	quote: string;
	page: number | null;
	verified: boolean;
	/** What this passage must be read with: its defined terms and cross-referenced clauses. */
	trail: TrailItem[];
}

export interface Message {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	created_at: string;
	citations: Citation[];
}

export interface Document {
	id: string;
	conversation_id: string;
	filename: string;
	page_count: number;
	uploaded_at: string;
}

export interface ConversationDetail extends Conversation {
	document?: Document;
}
