import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.firebird import ping as firebird_ping
from app.db.sqlite import init_db
from app.modules.monitor.scheduler import start_scheduler, stop_scheduler
from app.routers import pedidos, reabastecimento, recomendacoes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    start_scheduler()
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
app.include_router(reabastecimento.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/health/firebird")
async def health_firebird() -> dict:
    engine, remote = firebird_ping()
    return {"status": "ok", "engine": engine, "remote": remote}
