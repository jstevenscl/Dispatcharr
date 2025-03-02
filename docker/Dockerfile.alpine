FROM alpine

ENV PATH="/dispatcharrpy/bin:$PATH" \
    VIRTUAL_ENV=/dispatcharrpy \
    DJANGO_SETTINGS_MODULE=dispatcharr.settings \
    PYTHONUNBUFFERED=1

RUN apk add \
        python3 \
        python3-dev \
        gcc \
        musl-dev \
        linux-headers \
        py3-pip \
        ffmpeg \
        streamlink \
        vlc \
        libpq-dev \
        gcc \
        py3-virtualenv  \
        uwsgi \
        uwsgi-python \
        nodejs \
        npm \
        git \
        redis

RUN \
    mkdir /data && \
    virtualenv /dispatcharrpy && \
    git clone https://github.com/Dispatcharr/Dispatcharr /app && \
    cd /app && \
    /dispatcharrpy/bin/pip install --no-cache-dir -r requirements.txt && \
    cd /app/frontend && \
    npm install && \
    npm run build && \
    find . -maxdepth 1 ! -name '.' ! -name 'build' -exec rm -rf '{}' \; && \
    cd /app && \
    python manage.py collectstatic --noinput || true

# Cleanup
RUN \
    apk del \
        nodejs \
        npm \
        git \
        gcc \
        musl-dev \
        python3-dev \
        linux-headers

WORKDIR /app

CMD ["/app/docker/entrypoint.aio.sh"]
