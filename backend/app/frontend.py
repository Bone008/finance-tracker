"""Optional serving of the static frontend build, for single-process deployments."""

from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class FrontendFiles(StaticFiles):
    """Serves static files, falling back to index.html for client-side routes."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except HTTPException as e:
            # Unknown API paths should not return the app.
            if e.status_code != 404 or path == "api" or path.startswith("api/"):
                raise
            response = await super().get_response("index.html", scope)

        # Bundles have hashed file names, but index.html must always be
        # revalidated so clients pick up new deployments.
        if response.media_type == "text/html":
            response.headers["Cache-Control"] = "no-cache"
        return response
