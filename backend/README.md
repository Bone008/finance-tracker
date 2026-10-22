# Backend

A [FastAPI](https://fastapi.tiangolo.com/) service serving everything under `/api/`. Dependencies are managed with [uv](https://docs.astral.sh/uv/).

- `app/main.py` wires up the routers and error handling. `app/settings.py` reads configuration from `FT_*` environment variables.
- `app/routes/storage.py` handles `GET/POST /api/storage/{key}`. It stores client databases as opaque, usually end-to-end encrypted blobs on disk. Overwriting requires the hash of the last loaded version, and old versions are kept as backups.
- `app/routes/banksync.py` handles `POST /api/banksync`. It calls the scrapers in `banksync/` to export recent transactions as CSV. See [`banksync/README.md`](banksync/README.md) for the system packages DKB needs.

`app/frontend.py` optionally serves the static frontend build under `/` (see `FT_FRONTEND_DIR`). This makes single-process deployments like the Docker image possible. Alternatively, a separate web server serves the frontend and reverse-proxies `/api/` to uvicorn.

## Usage

```bash
uv sync                                   # install dependencies into .venv/
uv run uvicorn app.main:app --reload      # dev server on :8000, API docs at /api/docs
uv run pytest                             # tests
```

Configuration (environment variables):

- `FT_STORAGE_DIR` sets the folder for stored databases (default: `backend/storage/`).
- `FT_FRONTEND_DIR` sets the folder of a frontend build (`dist/finance-tracker/`) to serve under `/` (default: unset, API only).
- `FT_DEBUG=true` exposes stack traces and bank sync logs to clients.
- `FT_DKB_XVFB=false` shows the DKB browser instead of running it in a virtual framebuffer.
