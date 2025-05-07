# Start from LinuxServer.io's ffmpeg base with glibc 2.38 support
FROM lscr.io/linuxserver/ffmpeg:latest AS base

# Create a builder stage for Python and your app
FROM python:3.13-slim AS builder

ARG BRANCH=main
ARG REPO_URL=https://github.com/Dispatcharr/Dispatcharr
ARG TIMESTAMP

ENV PATH="/dispatcharrpy/bin:$PATH" \
    VIRTUAL_ENV=/dispatcharrpy \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=dispatcharr.settings \
    DISPATCHARR_BUILD=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    git \
    libpcre3-dev \
    python3-dev \
    wget && \
    python -m pip install virtualenv && \
    virtualenv /dispatcharrpy && \
    git clone -b ${BRANCH} ${REPO_URL} /app && \
    cd /app && rm -rf .git

RUN if [ -n "$TIMESTAMP" ]; then \
    sed -i "s|__timestamp__ = None.*|__timestamp__ = '${TIMESTAMP}'|" /app/version.py; fi

RUN cd /app && pip install --no-cache-dir -r requirements.txt

# Node build stage
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY --from=builder /app /app
RUN corepack enable && corepack prepare yarn@stable --activate && \
    yarn install && yarn build && \
    find . -maxdepth 1 ! -name '.' ! -name 'dist' -exec rm -rf '{}' \;

# Final image
FROM lscr.io/linuxserver/ffmpeg:latest

ENV PATH="/dispatcharrpy/bin:$PATH" \
    VIRTUAL_ENV=/dispatcharrpy \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=dispatcharr.settings

# Install required packages for Django
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libpq-dev \
    nginx \
    procps \
    streamlink \
    redis-server \
    postgresql-14 \
    postgresql-contrib-14 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=builder /dispatcharrpy /dispatcharrpy
COPY --from=builder /app /app
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

RUN cd /app && python manage.py collectstatic --noinput && \
    cp /app/docker/nginx.conf /etc/nginx/sites-enabled/default

WORKDIR /app

CMD ["/app/docker/entrypoint.sh"]