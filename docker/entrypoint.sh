#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

# Function to clean up only running processes
cleanup() {
    echo "🔥 Cleanup triggered! Stopping services..."
    for pid in "${pids[@]}"; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "⛔ Stopping process (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null
        else
            echo "✅ Process (PID: $pid) already stopped."
        fi
    done
    wait
}

# Catch termination signals (CTRL+C, Docker Stop, etc.)
trap cleanup TERM INT

# Initialize an array to store PIDs
pids=()

# Function to echo with timestamp
echo_with_timestamp() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Set PostgreSQL environment variables
export POSTGRES_DB=${POSTGRES_DB:-dispatcharr}
export POSTGRES_USER=${POSTGRES_USER:-dispatch}
export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-secret}
export POSTGRES_HOST=${POSTGRES_HOST:-localhost}
export POSTGRES_PORT=${POSTGRES_PORT:-5432}

export REDIS_HOST=${REDIS_HOST:-localhost}
export REDIS_DB=${REDIS_DB:-0}
export DISPATCHARR_PORT=${DISPATCHARR_PORT:-9191}

# READ-ONLY - don't let users change these
export POSTGRES_DIR=/data/db

# Global variables, stored so other users inherit them
if [[ ! -f /etc/profile.d/dispatcharr.sh ]]; then
    echo "export PATH=$PATH" >> /etc/profile.d/dispatcharr.sh
    echo "export VIRTUAL_ENV=$VIRTUAL_ENV" >> /etc/profile.d/dispatcharr.sh
    echo "export DJANGO_SETTINGS_MODULE=$DJANGO_SETTINGS_MODULE" >> /etc/profile.d/dispatcharr.sh
    echo "export PYTHONUNBUFFERED=$PYTHONUNBUFFERED" >> /etc/profile.d/dispatcharr.sh
    echo "export POSTGRES_DB=$POSTGRES_DB" >> /etc/profile.d/dispatcharr.sh
    echo "export POSTGRES_USER=$POSTGRES_USER" >> /etc/profile.d/dispatcharr.sh
    echo "export POSTGRES_PASSWORD=$POSTGRES_PASSWORD" >> /etc/profile.d/dispatcharr.sh
    echo "export POSTGRES_HOST=$POSTGRES_HOST" >> /etc/profile.d/dispatcharr.sh
    echo "export POSTGRES_PORT=$POSTGRES_PORT" >> /etc/profile.d/dispatcharr.sh
    echo "export DISPATCHARR_ENV=$DISPATCHARR_ENV" >> /etc/profile.d/dispatcharr.sh
    echo "export DISPATCHARR_DEBUG=$DISPATCHARR_DEBUG" >> /etc/profile.d/dispatcharr.sh
    echo "export REDIS_HOST=$REDIS_HOST" >> /etc/profile.d/dispatcharr.sh
    echo "export REDIS_DB=$REDIS_DB" >> /etc/profile.d/dispatcharr.sh
    echo "export POSTGRES_DIR=$POSTGRES_DIR" >> /etc/profile.d/dispatcharr.sh
    echo "export DISPATCHARR_PORT=$DISPATCHARR_PORT" >> /etc/profile.d/dispatcharr.sh
fi

chmod +x /etc/profile.d/dispatcharr.sh

pip install django-filter

# Run init scripts
echo "Starting init process..."
. /app/docker/init/01-user-setup.sh
. /app/docker/init/02-postgres.sh
. /app/docker/init/03-init-dispatcharr.sh

# Start PostgreSQL
echo "Starting Postgres..."
su - postgres -c "/usr/lib/postgresql/14/bin/pg_ctl -D ${POSTGRES_DIR} start -w -t 300 -o '-c port=${POSTGRES_PORT}'"
# Wait for PostgreSQL to be ready
until su - postgres -c "/usr/lib/postgresql/14/bin/pg_isready -h ${POSTGRES_HOST} -p ${POSTGRES_PORT}" >/dev/null 2>&1; do
    echo_with_timestamp "Waiting for PostgreSQL to be ready..."
    sleep 1
done
postgres_pid=$(su - postgres -c "/usr/lib/postgresql/14/bin/pg_ctl -D ${POSTGRES_DIR} status" | sed -n 's/.*PID: \([0-9]\+\).*/\1/p')
echo "✅ Postgres started with PID $postgres_pid"
pids+=("$postgres_pid")

uwsgi_file="/app/docker/uwsgi.ini"
if [ "$DISPATCHARR_ENV" = "dev" ] && [ "$DISPATCHARR_DEBUG" != "true" ]; then
    uwsgi_file="/app/docker/uwsgi.dev.ini"
elif [ "$DISPATCHARR_DEBUG" = "true" ]; then
    uwsgi_file="/app/docker/uwsgi.debug.ini"
fi

if [[ "$DISPATCHARR_ENV" = "dev" ]]; then
    . /app/docker/init/99-init-dev.sh
    echo "Starting frontend dev environment"
    su - $POSTGRES_USER -c "cd /app/frontend && npm run dev &"
    npm_pid=$(pgrep vite | sort | head -n1)
    echo "✅ vite started with PID $npm_pid"
    pids+=("$npm_pid")
else
    echo "🚀 Starting nginx..."
    nginx
    nginx_pid=$(pgrep nginx | sort  | head -n1)
    echo "✅ nginx started with PID $nginx_pid"
    pids+=("$nginx_pid")
fi

cd /app
python manage.py migrate --noinput
python manage.py collectstatic --noinput

uwsgi_file="/app/docker/uwsgi.ini"
if [ "$DISPATCHARR_ENV" = "dev" ]; then
    uwsgi_file="/app/docker/uwsgi.dev.ini"
fi

echo "🚀 Starting uwsgi..."
su - $POSTGRES_USER -c "cd /app && uwsgi --ini $uwsgi_file &"
uwsgi_pid=$(pgrep uwsgi | sort  | head -n1)
echo "✅ uwsgi started with PID $uwsgi_pid"
pids+=("$uwsgi_pid")

# sed -i 's/protected-mode yes/protected-mode no/g' /etc/redis/redis.conf
# su - $POSTGRES_USER -c "redis-server --protected-mode no &"
# redis_pid=$(pgrep redis)
# echo "✅ redis started with PID $redis_pid"
# pids+=("$redis_pid")

# echo "🚀 Starting gunicorn..."
# su - $POSTGRES_USER -c "cd /app && gunicorn dispatcharr.asgi:application \
#   --bind 0.0.0.0:5656 \
#   --worker-class uvicorn.workers.UvicornWorker \
#   --workers 2 \
#   --threads 1 \
#   --timeout 0 \
#   --keep-alive 30 \
#   --access-logfile - \
#   --error-logfile - &"
# gunicorn_pid=$(pgrep gunicorn | sort | head -n1)
# echo "✅ gunicorn started with PID $gunicorn_pid"
# pids+=("$gunicorn_pid")

# echo "Starting celery and beat..."
# su - $POSTGRES_USER -c "cd /app && celery -A dispatcharr worker -l info --autoscale=8,2 &"
# celery_pid=$(pgrep celery | sort | head -n1)
# echo "✅ celery started with PID $celery_pid"
# pids+=("$celery_pid")

# su - $POSTGRES_USER -c "cd /app && celery -A dispatcharr beat -l info &"
# beat_pid=$(pgrep beat | sort | head -n1)
# echo "✅ celery beat started with PID $beat_pid"
# pids+=("$beat_pid")

# Wait for at least one process to exit and log the process that exited first
if [ ${#pids[@]} -gt 0 ]; then
    echo "⏳ Waiting for processes to exit..."
    while kill -0 "${pids[@]}" 2>/dev/null; do
        sleep 1  # Wait for a second before checking again
    done

    echo "🚨 One of the processes exited! Checking which one..."

    for pid in "${pids[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
            process_name=$(ps -p "$pid" -o comm=)
            echo "❌ Process $process_name (PID: $pid) has exited!"
        fi
    done
else
    echo "❌ No processes started. Exiting."
    exit 1
fi

# Cleanup and stop remaining processes
cleanup
