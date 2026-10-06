# syntax=docker/dockerfile:1.7
# One image, one service (D-02): the Vite build is served by FastAPI next to /api.

# --- 1. Frontend build -----------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Backend runtime ----------------------------------------------------------------------
FROM python:3.13-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/srv/venv
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/uv

WORKDIR /srv/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev

COPY --from=web /web/dist /srv/static

RUN useradd --system --uid 10001 app && chown -R app /srv
USER app

ENV APP_ENV=production \
    STATIC_DIR=/srv/static \
    PORT=8000 \
    PATH="/srv/venv/bin:$PATH"
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
