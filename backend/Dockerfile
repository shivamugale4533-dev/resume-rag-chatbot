# Backend image: FastAPI + ChromaDB + Gemini client.
# Build:  docker build -t resume-backend ./backend
# Run:    docker run -p 8000:8000 --env-file backend/.env resume-backend

# "slim" = a small official Python image (Debian without extra tools).
FROM python:3.12-slim

# PYTHONUNBUFFERED: print logs immediately (important for Docker/Render logs).
# PYTHONDONTWRITEBYTECODE: don't create .pyc files inside the container.
# ANONYMIZED_TELEMETRY=False: stop ChromaDB from sending usage statistics.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ANONYMIZED_TELEMETRY=False \
    PORT=8000

WORKDIR /app

# Install dependencies FIRST. Docker caches this layer, so changing our code
# does not reinstall every package (much faster rebuilds).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy our code: the app, plus the evaluation dataset and saved RAGAS results
# (the Evaluation page shows them; ragas itself is NOT installed here).
COPY app ./app
COPY eval ./eval

# Security: run as a normal user, not root. data/ holds ChromaDB + the active resume.
RUN useradd --create-home appuser && mkdir -p data && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Docker checks /health every 30 s; after 3 failures the container is "unhealthy".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT', '8000') + '/health', timeout=4)"

# Render (and other hosts) give the port in $PORT, so we read it at start time.
# No --reload here: that is only for development.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
