# syntax=docker/dockerfile:1

# --- Frontend build -----------------------------------------------------------
FROM node:20-bookworm-slim AS frontend
WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY angular.json tsconfig.json tslint.json .browserslistrc ./
COPY src/ src/
RUN npm run protoc && npm run build -- --prod


# --- Runtime: backend serving API and frontend --------------------------------
FROM debian:bookworm-slim
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# DKB bank sync drives a real browser inside a virtual framebuffer. Build with
# --build-arg WITH_DKB=false for a much smaller image without DKB support.
ARG WITH_DKB=true
RUN if [ "$WITH_DKB" = "true" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends -o Acquire::Retries=5 chromium xvfb xauth \
      && rm -rf /var/lib/apt/lists/* \
      # Xvfb cannot create this as a non-root user.
      && mkdir -m 1777 /tmp/.X11-unix; \
    fi

# Use a uv-managed Python (installed outside of /root, so the app user can
# access it). Unlike the official slim Python images, it includes tkinter,
# which seleniumbase needs when running the browser inside xvfb.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_PYTHON_PREFERENCE=only-managed
WORKDIR /app

# Install dependencies first for better layer caching.
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --locked --no-dev

COPY --from=frontend /src/dist/finance-tracker/ /app/frontend/

# seleniumbase keeps a chromedriver matching the browser in its package folder
# and may (re)download it at runtime, so that folder must be writable.
RUN useradd --create-home --uid 1000 app \
    && mkdir /data && chown app /data \
    && chown -R app /app/.venv/lib/python*/site-packages/seleniumbase/drivers
USER app
# Fetch the driver now rather than on the first DKB sync.
RUN if [ "$WITH_DKB" = "true" ]; then /app/.venv/bin/sbase get uc_driver; fi

ENV PATH=/app/.venv/bin:$PATH \
    FT_STORAGE_DIR=/data \
    FT_FRONTEND_DIR=/app/frontend
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
