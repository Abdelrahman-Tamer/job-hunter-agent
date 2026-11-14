# Multi-stage production Dockerfile for BottaJobs
# Combines Angular 19 Dashboard + FastAPI Backend + 24/7 Telegram Bot + 09:00 Cairo Scheduler

# Stage 1: Build Angular Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend Runtime
FROM python:3.14-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    TZ=Africa/Cairo

WORKDIR /app

# Install system dependencies (curl for healthchecks, tzdata for Cairo timezone)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source and configuration
COPY . .

# Copy built Angular frontend from Stage 1 into the runtime image
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

# Run as non-root user for security
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/data && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

# Health check using FastAPI /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Automatically apply database migrations then launch unified app
CMD ["sh", "-c", "python -m alembic upgrade head && uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
