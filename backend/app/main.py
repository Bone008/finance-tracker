import traceback

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.frontend import FrontendFiles
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
if settings.frontend_dir is not None:
    # Must come last, since it catches all paths not handled by the API.
    app.mount("/", FrontendFiles(directory=settings.frontend_dir), name="frontend")


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
