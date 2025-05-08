FROM python:3.13-slim AS builder

# Define build arguments with default values
ARG BRANCH=main
# This will be overridden by the GitHub Actions workflow
# when building the Docker image for production.
ARG REPO_URL=https://github.com/Dispatcharr/Dispatcharr
# Add timestamp argument
ARG TIMESTAMP

ENV PATH="/dispatcharrpy/bin:$PATH" \
    VIRTUAL_ENV=/dispatcharrpy \
    DJANGO_SETTINGS_MODULE=dispatcharr.settings \
    PYTHONUNBUFFERED=1 \
    DISPATCHARR_BUILD=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gcc \
    git \
    libpcre3 \
    libpcre3-dev \
    python3-dev \
    wget && \
    git clone -b ${BRANCH} ${REPO_URL} /app && \
    cd /app && \
    rm -rf .git && \
    # Clean apt cache in builder stage
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Update version.py with build timestamp if provided
RUN if [ -n "$TIMESTAMP" ]; then \
    echo "Updating timestamp to ${TIMESTAMP} in version.py" && \
    sed -i "s|__timestamp__ = None.*|__timestamp__ = '${TIMESTAMP}'    # Set during CI/CD build process|" /app/version.py && \
    cat /app/version.py; \
    fi

RUN cd /app && \
    pip install --no-cache-dir -r requirements.txt

# Use a dedicated Node.js stage for frontend building
FROM node:20 AS frontend-builder
WORKDIR /app/frontend
COPY --from=builder /app /app
RUN corepack enable && corepack prepare yarn@stable --activate && \
    yarn install && \
    yarn build && \
    find . -maxdepth 1 ! -name '.' ! -name 'dist' -exec rm -rf '{}' \; && \
    # Clean yarn cache to reduce layer size
    yarn cache clean

# Use linuxserver/ffmpeg as a separate source image for FFmpeg binaries
FROM lscr.io/linuxserver/ffmpeg:latest AS ffmpeg

# Stage 2: Ubuntu base with Python
FROM ubuntu:24.04

ENV PATH="/dispatcharrpy/bin:$PATH" \
    VIRTUAL_ENV=/dispatcharrpy \
    DJANGO_SETTINGS_MODULE=dispatcharr.settings \
    PYTHONUNBUFFERED=1 \
    DISPATCHARR_BUILD=1

ENV DEBIAN_FRONTEND=noninteractive

# Install required dependencies including Python 3.13
RUN apt-get update && \
    apt-get install -y software-properties-common && \
    add-apt-repository -y ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y \
    python3.13 python3.13-venv python3.13-dev python3-pip python-is-python3 \
    libstdc++6 libglib2.0-0 libgomp1 libvdpau1 libva2 \
    libxcb-shape0 libv4l-0 ocl-icd-libopencl1 \
    alsa-base libasound2t64 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the application only (not the virtual environment)
COPY --from=builder /app /app
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Create a fresh virtual environment with Python 3.13
RUN apt-get update && \
    apt-get install -y python3-venv && \
    python3.13 -m venv /dispatcharrpy && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pip in the virtual environment
RUN /dispatcharrpy/bin/pip install --upgrade pip

# Install Python requirements in the Python 3.13 virtual environment
RUN cd /app && \
    /dispatcharrpy/bin/pip install --no-cache-dir -r requirements.txt

# Add the necessary libraries and binaries from the FFmpeg image
COPY --from=ffmpeg /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /usr/local/bin/ffprobe /usr/local/bin/ffprobe
COPY --from=ffmpeg /usr/local/lib/ /usr/local/lib/

# Run collectstatic after installing requirements
RUN cd /app && \
    /dispatcharrpy/bin/python manage.py collectstatic --noinput

# Install base dependencies with memory optimization
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl \
    libpcre3 \
    libpq-dev \
    nginx \
    procps \
    streamlink \
    wget \
    gnupg2 \
    lsb-release \
    libva-drm2 \
    libva-x11-2 \
    libva-dev \
    libva-wayland2 \
    vainfo \
    i965-va-driver \
    intel-media-va-driver \
    mesa-va-drivers && \
    cp /app/docker/nginx.conf /etc/nginx/sites-enabled/default && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set up Redis repository in a separate step
RUN curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg && \
    chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/redis.list && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y redis-server && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set up PostgreSQL repository and install in a separate step
RUN echo "=== setting up postgres ====" && \
    sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && \
    wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql-14 postgresql-contrib-14 && \
    mkdir -p /data && \
    apt-get remove -y gnupg2 lsb-release && \
    apt-get clean && \
    apt-get autoremove -y && \
    rm -rf /tmp/* /var/lib/apt/lists/* /var/tmp/*

WORKDIR /app

CMD ["/app/docker/entrypoint.sh"]
