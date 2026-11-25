"""Database connection management with SQLAlchemy 2.x async engine."""

from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Optional, Tuple
from sqlalchemy import event
from sqlalchemy.engine.url import URL, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

from src.core.config import settings
from src.core.logging import logger

Base = declarative_base()


def prepare_async_database_url(raw_url: str) -> Tuple[URL, Dict[str, Any], bool]:
    """
    Normalize SQLite/PostgreSQL URLs for async SQLAlchemy drivers and extract connect_args.

    - Converts postgres:// and postgresql:// to postgresql+asyncpg://.
    - Strips unsupported asyncpg query params (sslmode, pgbouncer, channel_binding).
    - Maps sslmode in (require, verify-ca, verify-full) to connect_args["ssl"] = True.
    - Configures PgBouncer transaction-mode compatibility (statement_cache_size=0).
    """
    url = make_url(raw_url)
    backend = url.get_backend_name()
    if backend == "sqlite":
        if url.drivername == "sqlite":
            url = url.set(drivername="sqlite+aiosqlite")
        return url, {}, True

    if backend == "postgresql" or url.drivername in ("postgres", "postgresql"):
        if "+" not in url.drivername or url.drivername == "postgres":
            url = url.set(drivername="postgresql+asyncpg")

    query = dict(url.query)
    raw_sslmode = query.pop("sslmode", "")
    if isinstance(raw_sslmode, (list, tuple)):
        raw_sslmode = raw_sslmode[0] if raw_sslmode else ""
    sslmode = str(raw_sslmode or "").strip().lower()
    query.pop("pgbouncer", None)
    query.pop("channel_binding", None)
    url = url.set(query=query)

    connect_args: Dict[str, Any] = {
        "timeout": 10,
        "command_timeout": 30,
        "statement_cache_size": 0,
    }
    if sslmode in ("require", "verify-ca", "verify-full"):
        connect_args["ssl"] = True

    return url, connect_args, False


def build_async_engine_kwargs(raw_url: str, *, echo: Optional[bool] = None) -> Dict[str, Any]:
    """Build SQLAlchemy create_async_engine kwargs tailored to SQLite vs. PostgreSQL/PgBouncer."""
    _, connect_args, is_sqlite = prepare_async_database_url(raw_url)
    kwargs: Dict[str, Any] = {
        "echo": settings.DEBUG if echo is None else echo,
    }
    if not is_sqlite:
        kwargs.update({
            "pool_size": 5,
            "max_overflow": 5,
            "pool_timeout": 10,
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": connect_args,
        })
    return kwargs


def ensure_sqlite_dir(raw_url: str) -> None:
    """Ensure parent directory exists when using file-backed SQLite."""
    url = make_url(raw_url)
    if url.get_backend_name() == "sqlite" and url.database and url.database != ":memory:":
        db_dir = Path(url.database).parent
        if db_dir and not db_dir.exists():
            db_dir.mkdir(parents=True, exist_ok=True)


ensure_sqlite_dir(settings.DATABASE_URL)

db_url, _connect_args, _is_sqlite = prepare_async_database_url(settings.DATABASE_URL)
engine_kwargs = build_async_engine_kwargs(settings.DATABASE_URL)

engine: AsyncEngine = create_async_engine(
    db_url,
    **engine_kwargs,
)

# Apply SQLite-specific optimizations if SQLite is used
if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for obtaining an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
