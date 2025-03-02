#!/bin/sh

# Check the value of DISPATCHARR_ENV and run the corresponding program
case "$DISPATCHARR_ENV" in
    "dev")
        echo "DISPATCHARR_ENV is set to 'dev'. Running Development Program..."
        apt-get update && apt-get install -y nodejs
        cd /app/frontend && npm install
        cd /app
        exec /usr/bin/uwsgi --ini uwsgi.dev.ini
        ;;
    "aio")
        echo "DISPATCHARR_ENV is set to 'aio'. Running All-in-One Program..."
        exec /usr/bin/uwsgi --ini uwsgi.aio.ini
        ;;
    *)
        echo "DISPATCHARR_ENV is not set or has an unexpected value. Running standalone..."
        exec /usr/bin/uwsgi --ini uwsgi.ini
        ;;
esac
