# ORBITAL API image: FastAPI + SQLAlchemy 2 + Alembic on psycopg3.
#
# Build (from the repository root):
#   docker build -t orbital-api ./backend
#
# The image is a plain API server: it never migrates or seeds on its own.
# docker-compose.yml explicitly runs migrations and (for local development
# only) loads the simulation seed in its `command` before starting uvicorn.

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/app

# Install dependencies first so application code edits do not invalidate the
# (slow) pip layer. requirements-dev.txt is intentionally not installed.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Run as an unprivileged user; the app writes nothing to disk.
RUN useradd --create-home --uid 10001 orbital \
    && chown -R orbital:orbital /srv/app
USER orbital

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
