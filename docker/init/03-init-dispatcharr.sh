#!/bin/bash

mkdir -p /data/logos
mkdir -p /app/logo_cache
mkdir -p /app/media

sed -i "s/NGINX_PORT/${DISPATCHARR_PORT}/g" /etc/nginx/sites-enabled/default

# NOTE: mac doesn't run as root, so only manage permissions
# if this script is running as root
if [ "$(id -u)" = "0" ]; then
    touch /app/uwsgi.sock
    chown -R $PUID:$PGID /app
    chown $PUID:$PGID /app/uwsgi.sock

    chown -R $PUID:$PGID /app
    chown -R $PUID:$PGID /data/logos

    # Permissions
    chown -R postgres:postgres /data/db
    chmod +x /data
fi
