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
	/** Stable 1-based display index. The same citation can be marked more than once in the
	 *  message body; it keeps this same number every time. */
	number: number;
	/** What this passage must be read with: its defined terms and cross-referenced clauses. */
	trail: TrailItem[];
}

/** One proposition an answer asks the lawyer to rely on, and the passages the model
 *  offered for it. The binding is the model's assertion; that each passage exists is what
 *  the server checks. */
export interface Claim {
	id: string;
	text: string;
	citation_ids: string[];
}

export interface Message {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	created_at: string;
	citations: Citation[];
	claims: Claim[];
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
