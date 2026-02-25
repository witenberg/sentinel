# Stage 1 - Builder (install deps only)
FROM python:3.14-slim-bookworm AS builder

WORKDIR /app

# Virtual environment
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN python -m venv /opt/venv

# Only production dependencies, without cache
COPY requirements-prod.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements-prod.txt

# Stage 2 - Production (minimal runtime)
FROM python:3.14-slim-bookworm AS production

# No pip/build in final image
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1001 -s /bin/sh app

WORKDIR /app

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Only venv (without pip, setuptools in image) + application code
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app worker.py anomaly.py ./

USER app

CMD ["python", "-u", "worker.py"]
