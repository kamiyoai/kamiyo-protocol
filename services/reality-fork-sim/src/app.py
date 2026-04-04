"""FastAPI application entry point for the Reality Fork simulation service."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from src import config
from src.routes import ingest, extract, simulate, report


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: validate critical config
    assert config.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY must be set"
    print(f"[reality-fork-sim] model={config.LLM_MODEL} oasis={config.OASIS_ENABLED}")
    yield
    # Shutdown
    print("[reality-fork-sim] shutting down")


app = FastAPI(
    title="Reality Fork Simulation Service",
    version="0.1.0",
    description="Ingestion, extraction, simulation, and report generation for Reality Fork.",
    lifespan=lifespan,
)

# CORS — internal service, but allow configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# Request size guard (reject bodies > configured limit)
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    max_bytes = config.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
        return Response(
            content=f'{{"error":"Request body exceeds {config.MAX_UPLOAD_SIZE_MB}MB limit"}}',
            status_code=413,
            media_type="application/json",
        )
    return await call_next(request)


app.include_router(ingest.router, tags=["ingest"])
app.include_router(extract.router, tags=["extract"])
app.include_router(simulate.router, tags=["simulate"])
app.include_router(report.router, tags=["report"])


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "reality-fork-sim",
        "model": config.LLM_MODEL,
        "oasis": config.OASIS_ENABLED,
    }
