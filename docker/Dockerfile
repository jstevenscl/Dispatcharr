FROM python:3.13-slim

ENV PATH="/dispatcharrpy/bin:$PATH" \
    VIRTUAL_ENV=/dispatcharrpy \
    DJANGO_SETTINGS_MODULE=dispatcharr.settings \
    PYTHONUNBUFFERED=1

RUN apt-get update && \
    apt-get install -y \
        curl \
        ffmpeg \
        gcc \
        git \
        gpg \
        libpq-dev \
        lsb-release \
        python3-virtualenv \
        streamlink \
        uwsgi \
        python3-django-uwsgi

RUN \
    curl -sL https://deb.nodesource.com/setup_23.x -o /tmp/nodesource_setup.sh && \
    bash /tmp/nodesource_setup.sh && \
    curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg && \
    chmod 644 /usr/share/keyrings/redis-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/redis.list && \
    apt-get update && \
    apt-get install -y redis

RUN apt-get update && \
    apt-get install -y \
        nodejs \
        redis

RUN \
    mkdir /data && \
    virtualenv /dispatcharrpy && \
    git clone https://github.com/Dispatcharr/Dispatcharr /app && \
    cd /app && \
    pip install --no-cache-dir -r requirements.txt && \
    cd /app/frontend && \
    npm install && \
    npm run build && \
    find . -maxdepth 1 ! -name '.' ! -name 'build' -exec rm -rf '{}' \; && \
    cd /app && \
    python manage.py collectstatic --noinput || true && \
    apt-get remove -y \
        gcc \
        git \
        gpg \
        libpq-dev \
        lsb-release \
        nodejs && \
    apt-get clean && \
    apt-get autoremove -y && \
    rm -rf \
        /tmp/* \
        /var/lib/apt/lists/* \
        /var/tmp/*

WORKDIR /app

CMD ["/app/docker/entrypoint.aio.sh"]
