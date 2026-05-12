import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.firebird import ping as firebird_ping
from app.db.sqlite import init_db
from app.modules.monitor import checker, scan_state
from app.modules.monitor.scheduler import start_scheduler, stop_scheduler
from app.routers import clientes, pedidos, rank, reabastecimento, recomendacoes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

# Tolerância pra Firebird ainda não estar disponível no boot do PC (WSL2,
# Docker Desktop e servidor Nutify podem subir em ordens diferentes).
_STARTUP_SCAN_RETRY_DELAYS = (5, 15, 45)


async def _startup_scan_com_retry() -> None:
    for tentativa, espera in enumerate(_STARTUP_SCAN_RETRY_DELAYS, start=1):
        try:
            await scan_state.executar(checker.executar_verificacao, origem="auto")
            return
        except Exception as exc:
            logger.warning(
                "startup scan tentativa %d/%d falhou (%s); retry em %ds",
                tentativa,
                len(_STARTUP_SCAN_RETRY_DELAYS),
                exc,
                espera,
            )
            await asyncio.sleep(espera)
    logger.error(
        "startup scan: todas as %d tentativas falharam — scheduler retomará no intervalo normal",
        len(_STARTUP_SCAN_RETRY_DELAYS),
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    start_scheduler()
    asyncio.create_task(_startup_scan_com_retry())
    yield
    stop_scheduler()


app = FastAPI(title="Casa Granum API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(recomendacoes.router)
app.include_router(pedidos.router)
app.include_router(clientes.router)
app.include_router(rank.router)
app.include_router(reabastecimento.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/health/firebird")
async def health_firebird() -> dict:
    engine, remote = firebird_ping()
    return {"status": "ok", "engine": engine, "remote": remote}
