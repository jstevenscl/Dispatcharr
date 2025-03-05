#!/bin/bash

# Required so both uwsgi and nginx (www-data) can use it
# @TODO: change nginx to run as the same use as uwsgi
touch /app/uwsgi.sock
chown -R $PUID:$PGID /app
chmod 777 /app/uwsgi.sock
