from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Running database migrations...")
    alembic_cfg = Config("alembic.ini")
    # Run in a thread because alembic's env.py uses asyncio.run(),
    # which cannot nest inside the already-running event loop.
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
    logger.info("Migrations complete")
    yield


app = FastAPI(title="Lease citations", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from takehome.web.routers import conversations, documents, messages  # noqa: E402

app.include_router(conversations.router)
app.include_router(messages.router)
app.include_router(documents.router)
