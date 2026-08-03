import { AnimatePresence, motion } from "framer-motion";
import {
	MessageSquarePlus,
	PanelLeftClose,
	PanelLeftOpen,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { relativeTime } from "../lib/utils";
import type { Conversation } from "../types";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const EXPANDED_WIDTH = 250;
const RAIL_WIDTH = 52;

interface ChatSidebarProps {
	conversations: Conversation[];
	selectedId: string | null;
	loading: boolean;
	collapsed: boolean;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
	onToggleCollapse: () => void;
}

export function ChatSidebar({
	conversations,
	selectedId,
	loading,
	collapsed,
	onSelect,
	onCreate,
	onDelete,
	onToggleCollapse,
}: ChatSidebarProps) {
	const [hoveredId, setHoveredId] = useState<string | null>(null);

	return (
		<motion.div
			animate={{ width: collapsed ? RAIL_WIDTH : EXPANDED_WIDTH }}
			transition={{ duration: 0.2, ease: "easeOut" }}
			className="flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-neutral-200 bg-white"
		>
			<div
				className={`flex items-center border-b border-neutral-100 p-3 ${
					collapsed ? "justify-center" : "justify-between"
				}`}
			>
				{!collapsed && (
					<span className="whitespace-nowrap text-sm font-semibold text-neutral-700">
						Chats
					</span>
				)}
				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={onCreate}>
								<MessageSquarePlus className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">New chat</TooltipContent>
					</Tooltip>
					{!collapsed && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon" onClick={onToggleCollapse}>
									<PanelLeftClose className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Hide conversations</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>

			{collapsed ? (
				<div className="flex flex-1 flex-col items-center pt-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onClick={onToggleCollapse}>
								<PanelLeftOpen className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="right">
							{conversations.length === 1
								? "1 conversation"
								: `${conversations.length} conversations`}
						</TooltipContent>
					</Tooltip>
				</div>
			) : (
				<ScrollArea className="flex-1">
					<div className="w-[250px] p-2">
						{loading && conversations.length === 0 && (
							<div className="space-y-2 p-2">
								{[1, 2, 3].map((i) => (
									<div key={i} className="animate-pulse space-y-1">
										<div className="h-4 w-3/4 rounded bg-neutral-100" />
										<div className="h-3 w-1/2 rounded bg-neutral-50" />
									</div>
								))}
							</div>
						)}

						{!loading && conversations.length === 0 && (
							<p className="px-2 py-8 text-center text-xs text-neutral-400">
								No conversations yet
							</p>
						)}

						<AnimatePresence initial={false}>
							{conversations.map((conversation) => (
								<motion.div
									key={conversation.id}
									initial={{ opacity: 0, height: 0 }}
									animate={{ opacity: 1, height: "auto" }}
									exit={{ opacity: 0, height: 0 }}
									transition={{ duration: 0.15 }}
								>
									<button
										type="button"
										className={`group flex w-full items-center rounded-lg px-3 py-2.5 text-left transition-colors ${
											selectedId === conversation.id
												? "bg-neutral-100"
												: "hover:bg-neutral-50"
										}`}
										onClick={() => onSelect(conversation.id)}
										onMouseEnter={() => setHoveredId(conversation.id)}
										onMouseLeave={() => setHoveredId(null)}
									>
										<div className="min-w-0 flex-1 overflow-hidden">
											<p className="truncate text-sm font-medium text-neutral-800">
												{conversation.title}
											</p>
											<p className="mt-0.5 text-xs text-neutral-400">
												{relativeTime(conversation.updated_at)}
											</p>
										</div>

										<div className="ml-2 w-6 flex-shrink-0">
											{hoveredId === conversation.id && (
												<button
													type="button"
													className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-red-500"
													onClick={(e) => {
														e.stopPropagation();
														onDelete(conversation.id);
													}}
													title="Delete conversation"
												>
													<Trash2 className="h-3.5 w-3.5" />
												</button>
											)}
										</div>
									</button>
								</motion.div>
							))}
						</AnimatePresence>
					</div>
				</ScrollArea>
			)}
		</motion.div>
	);
}
