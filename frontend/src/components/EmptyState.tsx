import { DocumentUpload } from "./DocumentUpload";
import { BrandMark } from "./BrandMark";

interface EmptyStateProps {
	onUpload: (file: File) => void;
	uploading?: boolean;
}

export function EmptyState({ onUpload, uploading }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center px-4">
			{/* Same mark, same treatment as the assistant's own avatar — the app has one
			    identity, not a generic placeholder icon standing in for a second one. */}
			<div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand">
				<BrandMark className="h-8 w-auto text-accent" />
			</div>
			<h2 className="mb-2 text-lg font-semibold text-neutral-800">
				Upload a document to get started
			</h2>
			<p className="mb-8 max-w-sm text-center text-sm text-neutral-500">
				Every claim is checked against the document, sentence by sentence —
				including the ones it couldn't confirm.
			</p>
			<DocumentUpload onUpload={onUpload} uploading={uploading} />
		</div>
	);
}
