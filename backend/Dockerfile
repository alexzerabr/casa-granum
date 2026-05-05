FROM python:3.12-slim AS base

# libfbclient2: cliente nativo Firebird com WireCrypt (drivers puros são rejeitados).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libfbclient2 \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    SQLITE_PATH=/app/data/casa_granum.db

LABEL org.opencontainers.image.source="https://github.com/alexzerabr/casa-granum" \
      org.opencontainers.image.description="Casa Granum — backend (FastAPI + Firebird + SQLite)" \
      org.opencontainers.image.licenses="proprietary" \
      org.opencontainers.image.title="casa-granum-backend" \
      org.opencontainers.image.vendor="Casa Granum"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
