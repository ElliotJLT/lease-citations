from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.responses import StreamingResponse

from takehome.db.models import Citation, Message
from takehome.db.session import get_session
from takehome.services.citations import verify_all
from takehome.services.conversation import get_conversation, update_conversation
from takehome.services.document import get_document_for_conversation
from takehome.services.llm import TextDelta, chat_with_document, generate_title
from takehome.services.trail import build_trail

logger = structlog.get_logger()

router = APIRouter(tags=["messages"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class TrailItemOut(BaseModel):
    kind: str
    label: str
    text: str
    page: int | None


class CitationOut(BaseModel):
    id: str
    label: str
    quote: str
    page: int | None
    verified: bool
    trail: list[TrailItemOut] = []

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: datetime
    citations: list[CitationOut] = []

    model_config = {"from_attributes": True}


class MessageCreate(BaseModel):
    content: str


def _serialise(citation: Citation, document_text: str | None) -> dict[str, object]:
    # The trail is derived from the document on read rather than stored: it's a pure function
    # of the quote and the text, so persisting it would only create something to go stale.
    trail = build_trail(citation.quote, document_text) if citation.verified else []
    return {
        "id": citation.id,
        "label": citation.label,
        "quote": citation.quote,
        "page": citation.page,
        "verified": citation.verified,
        "trail": [
            {"kind": i.kind, "label": i.label, "text": i.text, "page": i.page} for i in trail
        ],
    }


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.get(
    "/api/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def list_messages(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[MessageOut]:
    """List all messages in a conversation, ordered by creation time."""
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .options(selectinload(Message.citations))
        .order_by(Message.created_at.asc())
    )
    result = await session.execute(stmt)
    messages = list(result.scalars().all())

    document = await get_document_for_conversation(session, conversation_id)
    document_text = document.extracted_text if document else None

    return [
        MessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            role=m.role,
            content=m.content,
            created_at=m.created_at,
            citations=[
                CitationOut.model_validate(_serialise(c, document_text))
                for c in m.citations
            ],
        )
        for m in messages
    ]


@router.post("/api/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """Send a user message and stream back the AI response via SSE.

    The answer streams as it is generated; the evidence supporting it arrives once at the
    end, after every quote has been checked against the document.
    """
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
    )
    session.add(user_message)
    await session.commit()
    await session.refresh(user_message)

    logger.info("User message saved", conversation_id=conversation_id, message_id=user_message.id)

    document = await get_document_for_conversation(session, conversation_id)
    document_text: str | None = document.extracted_text if document else None
    document_id: str | None = document.id if document else None

    stmt = (
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .where(Message.id != user_message.id)
        .order_by(Message.created_at.asc())
    )
    result = await session.execute(stmt)
    history_messages = list(result.scalars().all())

    conversation_history: list[dict[str, str]] = [
        {"role": m.role, "content": m.content} for m in history_messages
    ]

    is_first_message = sum(1 for m in history_messages if m.role == "user") == 0

    async def event_stream() -> AsyncIterator[str]:
        full_response = ""
        offered: list[tuple[str, str]] = []

        try:
            async for event in chat_with_document(
                user_message=body.content,
                document_text=document_text,
                conversation_history=conversation_history,
            ):
                if isinstance(event, TextDelta):
                    full_response += event.text
                    yield f"data: {json.dumps({'type': 'content', 'content': event.text})}\n\n"
                else:
                    offered = event.items

        except Exception:
            logger.exception("Error during LLM streaming", conversation_id=conversation_id)
            error_msg = "I'm sorry, an error occurred while generating a response. Please try again."
            full_response = error_msg
            offered = []
            yield f"data: {json.dumps({'type': 'content', 'content': error_msg})}\n\n"

        checked = verify_all(offered, document_text)
        logger.info(
            "Citations verified",
            conversation_id=conversation_id,
            offered=len(offered),
            verified=sum(1 for c in checked if c.verified),
            unverified=sum(1 for c in checked if not c.verified),
        )

        # A fresh session: the request-scoped one may have been closed by now.
        from takehome.db.session import async_session as session_factory

        async with session_factory() as save_session:
            assistant_message = Message(
                conversation_id=conversation_id,
                role="assistant",
                content=full_response.strip(),
            )
            save_session.add(assistant_message)
            await save_session.flush()

            rows = [
                Citation(
                    message_id=assistant_message.id,
                    document_id=document_id,
                    label=c.label,
                    quote=c.quote,
                    page=c.page,
                    verified=c.verified,
                    position=index,
                )
                for index, c in enumerate(checked)
            ]
            save_session.add_all(rows)
            await save_session.commit()

            for row in rows:
                await save_session.refresh(row)
            await save_session.refresh(assistant_message)

            payload = [_serialise(row, document_text) for row in rows]

            if is_first_message:
                try:
                    title = await generate_title(body.content)
                    await update_conversation(save_session, conversation_id, title)
                    logger.info(
                        "Auto-generated conversation title",
                        conversation_id=conversation_id,
                        title=title,
                    )
                except Exception:
                    logger.exception("Failed to generate title", conversation_id=conversation_id)

            message_data = json.dumps(
                {
                    "type": "message",
                    "message": {
                        "id": assistant_message.id,
                        "conversation_id": assistant_message.conversation_id,
                        "role": assistant_message.role,
                        "content": assistant_message.content,
                        "created_at": assistant_message.created_at.isoformat(),
                        "citations": payload,
                    },
                }
            )
            yield f"data: {message_data}\n\n"

            done_data = json.dumps(
                {
                    "type": "done",
                    "message_id": assistant_message.id,
                    "citations": payload,
                }
            )
            yield f"data: {done_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
