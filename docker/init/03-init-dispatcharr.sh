#!/bin/bash

# NOTE: mac doesn't run as root, so only manage permissions
# if this script is running as root
if [ "$(id -u)" = "0" ]; then
    touch /app/uwsgi.sock
    chown -R $PUID:$PGID /app
    chown $PUID:$PGID /app/uwsgi.sock

    # Create and set permissions for the media / cache directories
    mkdir -p /app/media

    chown -R $PUID:$PGID /app
    echo "Created and set permissions for cached_m3u directory"
fi
