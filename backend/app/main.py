import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.routes import banksync, storage
from app.settings import settings

app = FastAPI(
    title="Finance Tracker API",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.include_router(storage.router, prefix="/api")
app.include_router(banksync.router, prefix="/api")


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    # The exception is still re-raised and logged by the server afterwards.
    if settings.debug:
        content = {
            "error": str(exc),
            "stackTrace": "".join(traceback.format_exception(exc)),
        }
    else:
        content = {"error": "Internal server error"}
    return JSONResponse(content, status_code=500)
