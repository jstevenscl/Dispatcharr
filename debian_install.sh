#!/usr/bin/env bash

set -e

##############################################################################
# 0) Warning / Disclaimer
##############################################################################

echo "**************************************************************"
echo "WARNING: While we do not anticipate any problems, we disclaim all"
echo "responsibility for anything that happens to your machine."
echo ""
echo "This script is intended for **Debian-based operating systems only**."
echo "Running it on other distributions WILL cause unexpected issues."
echo ""
echo "This script is **NOT RECOMMENDED** for use on your primary machine."
echo "For safety and best results, we strongly advise running this inside a"
echo "clean virtual machine (VM) or LXC container environment."
echo ""
echo "Additionally, there is NO SUPPORT for this method; Docker is the only"
echo "officially supported way to run Dispatcharr."
echo "**************************************************************"
echo ""
echo "If you wish to proceed, type \"I understand\" and press Enter."
read user_input

if [ "$user_input" != "I understand" ]; then
  echo "Exiting script..."
  exit 1
fi


##############################################################################
# 1) Configuration
##############################################################################

# Linux user/group under which Dispatcharr processes will run
DISPATCH_USER="dispatcharr"
DISPATCH_GROUP="dispatcharr"

# Where Dispatcharr source code should live
APP_DIR="/opt/dispatcharr"

# Git branch to clone (e.g., "main" or "dev")
DISPATCH_BRANCH="dev"

# PostgreSQL settings
POSTGRES_DB="dispatcharr"
POSTGRES_USER="dispatch"
POSTGRES_PASSWORD="secret"

# The port on which Nginx will listen for HTTP
NGINX_HTTP_PORT="9191"

# The TCP port for Daphné (Django Channels)
WEBSOCKET_PORT="8001"

# Directory inside /run/ for our socket; full path becomes /run/dispatcharr/dispatcharr.sock
GUNICORN_RUNTIME_DIR="dispatcharr"
GUNICORN_SOCKET="/run/${GUNICORN_RUNTIME_DIR}/dispatcharr.sock"

##############################################################################
# 2) Install System Packages
##############################################################################

echo ">>> Installing system packages..."
apt-get update
apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    gcc \
    libpcre3-dev \
    libpq-dev \
    python3-dev \
    python3-venv \
    python3-pip \
    nginx \
    redis-server \
    postgresql \
    postgresql-contrib \
    ffmpeg \
    procps \
    streamlink

# Node.js setup (v23.x from NodeSource) - adjust version if needed
if ! command -v node >/dev/null 2>&1; then
  echo ">>> Installing Node.js..."
  curl -sL https://deb.nodesource.com/setup_23.x | bash -
  apt-get install -y nodejs
fi

# Start & enable PostgreSQL and Redis
systemctl enable postgresql redis-server
systemctl start postgresql redis-server

##############################################################################
# 3) Create Dispatcharr User/Group
##############################################################################

if ! getent group "${DISPATCH_GROUP}" >/dev/null; then
    echo ">>> Creating group: ${DISPATCH_GROUP}"
    groupadd "${DISPATCH_GROUP}"
fi

if ! id -u "${DISPATCH_USER}" >/dev/null; then
    echo ">>> Creating user: ${DISPATCH_USER}"
    useradd -m -g "${DISPATCH_GROUP}" -s /bin/bash "${DISPATCH_USER}"
fi

##############################################################################
# 4) Configure PostgreSQL Database
##############################################################################

echo ">>> Configuring PostgreSQL..."
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\"" | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE DATABASE ${POSTGRES_DB};\""

su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\"" | grep -q 1 || \
  su - postgres -c "psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';\""

su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};\""
su - postgres -c "psql -c \"ALTER DATABASE ${POSTGRES_DB} OWNER TO ${POSTGRES_USER};\""
su - postgres -c "psql -d ${POSTGRES_DB} -c \"ALTER SCHEMA public OWNER TO ${POSTGRES_USER};\""

##############################################################################
# 5) Clone or Update Dispatcharr Code
##############################################################################

echo ">>> Installing or updating Dispatcharr in ${APP_DIR} ..."

if [ ! -d "${APP_DIR}" ]; then
    echo ">>> Cloning repository for the first time..."
    mkdir -p "${APP_DIR}"
    chown "${DISPATCH_USER}:${DISPATCH_GROUP}" "${APP_DIR}"
    su - "${DISPATCH_USER}" -c "git clone -b ${DISPATCH_BRANCH} https://github.com/Dispatcharr/Dispatcharr.git ${APP_DIR}"
else
    echo ">>> Updating existing repository..."
    su - "${DISPATCH_USER}" <<EOSU
cd "${APP_DIR}"
if [ -d .git ]; then
    git fetch origin
    git checkout ${DISPATCH_BRANCH}
    git pull origin ${DISPATCH_BRANCH}
else
    echo "WARNING: .git directory missing, cannot perform update via git."
fi
EOSU
fi

##############################################################################
# 6) Create Python Virtual Environment & Install Python Dependencies
##############################################################################

echo ">>> Setting up Python virtual environment..."
su - "${DISPATCH_USER}" <<EOSU
cd "${APP_DIR}"
python3 -m venv env
source env/bin/activate

# Upgrade pip and install dependencies from requirements
pip install --upgrade pip
pip install -r requirements.txt

# Explicitly ensure Gunicorn is installed in the virtualenv
pip install gunicorn
EOSU

# 6a) Create a symlink for ffmpeg in the virtualenv's bin directory.
echo ">>> Linking ffmpeg into the virtual environment..."
ln -sf /usr/bin/ffmpeg ${APP_DIR}/env/bin/ffmpeg

##############################################################################
# 7) Build Frontend (React)
##############################################################################

echo ">>> Building frontend..."
su - "${DISPATCH_USER}" <<EOSU
cd "${APP_DIR}/frontend"
npm install --legacy-peer-deps
npm run build
EOSU

##############################################################################
# 8) Django Migrate & Collect Static
##############################################################################

echo ">>> Running Django migrations & collectstatic..."
su - "${DISPATCH_USER}" <<EOSU
cd "${APP_DIR}"
source env/bin/activate
export POSTGRES_DB="${POSTGRES_DB}"
export POSTGRES_USER="${POSTGRES_USER}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
export POSTGRES_HOST="localhost"
python manage.py migrate --noinput
python manage.py collectstatic --noinput
EOSU

##############################################################################
# 9) Create Systemd Service for Gunicorn
##############################################################################

cat <<EOF >/etc/systemd/system/dispatcharr.service
[Unit]
Description=Gunicorn for Dispatcharr
After=network.target postgresql.service redis-server.service

[Service]
User=${DISPATCH_USER}
Group=${DISPATCH_GROUP}
WorkingDirectory=${APP_DIR}

RuntimeDirectory=${GUNICORN_RUNTIME_DIR}
RuntimeDirectoryMode=0775

# Update PATH to include both the virtualenv and system binaries (for ffmpeg)
Environment="PATH=${APP_DIR}/env/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
Environment="POSTGRES_DB=${POSTGRES_DB}"
Environment="POSTGRES_USER=${POSTGRES_USER}"
Environment="POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
Environment="POSTGRES_HOST=localhost"

ExecStart=${APP_DIR}/env/bin/gunicorn \\
    --workers=4 \\
    --worker-class=gevent \\
    --timeout=300 \\
    --bind unix:${GUNICORN_SOCKET} \\
    dispatcharr.wsgi:application

Restart=always
KillMode=mixed

[Install]
WantedBy=multi-user.target
EOF

##############################################################################
# 10) Create Systemd Service for Celery
##############################################################################

cat <<EOF >/etc/systemd/system/dispatcharr-celery.service
[Unit]
Description=Celery Worker for Dispatcharr
After=network.target redis-server.service
Requires=dispatcharr.service

[Service]
User=${DISPATCH_USER}
Group=${DISPATCH_GROUP}
WorkingDirectory=${APP_DIR}
Environment="PATH=${APP_DIR}/env/bin"
Environment="POSTGRES_DB=${POSTGRES_DB}"
Environment="POSTGRES_USER=${POSTGRES_USER}"
Environment="POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
Environment="POSTGRES_HOST=localhost"
Environment="CELERY_BROKER_URL=redis://localhost:6379/0"

ExecStart=${APP_DIR}/env/bin/celery -A dispatcharr worker -l info

Restart=always
KillMode=mixed

[Install]
WantedBy=multi-user.target
EOF

##############################################################################
# 11) Create Systemd Service for Celery Beat (Optional)
##############################################################################

cat <<EOF >/etc/systemd/system/dispatcharr-celerybeat.service
[Unit]
Description=Celery Beat Scheduler for Dispatcharr
After=network.target redis-server.service
Requires=dispatcharr.service

[Service]
User=${DISPATCH_USER}
Group=${DISPATCH_GROUP}
WorkingDirectory=${APP_DIR}
Environment="PATH=${APP_DIR}/env/bin"
Environment="POSTGRES_DB=${POSTGRES_DB}"
Environment="POSTGRES_USER=${POSTGRES_USER}"
Environment="POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
Environment="POSTGRES_HOST=localhost"
Environment="CELERY_BROKER_URL=redis://localhost:6379/0"

ExecStart=${APP_DIR}/env/bin/celery -A dispatcharr beat -l info

Restart=always
KillMode=mixed

[Install]
WantedBy=multi-user.target
EOF

##############################################################################
# 12) Create Systemd Service for Daphné (WebSockets / Channels)
##############################################################################

cat <<EOF >/etc/systemd/system/dispatcharr-daphne.service
[Unit]
Description=Daphne for Dispatcharr (ASGI)
After=network.target
Requires=dispatcharr.service

[Service]
User=${DISPATCH_USER}
Group=${DISPATCH_GROUP}
WorkingDirectory=${APP_DIR}
Environment="PATH=${APP_DIR}/env/bin"
Environment="POSTGRES_DB=${POSTGRES_DB}"
Environment="POSTGRES_USER=${POSTGRES_USER}"
Environment="POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
Environment="POSTGRES_HOST=localhost"

ExecStart=${APP_DIR}/env/bin/daphne -b 0.0.0.0 -p ${WEBSOCKET_PORT} dispatcharr.asgi:application

Restart=always
KillMode=mixed

[Install]
WantedBy=multi-user.target
EOF

##############################################################################
# 13) Configure Nginx
##############################################################################

echo ">>> Configuring Nginx at /etc/nginx/sites-available/dispatcharr.conf ..."
cat <<EOF >/etc/nginx/sites-available/dispatcharr.conf
server {
    listen ${NGINX_HTTP_PORT};

    # Proxy to Gunicorn socket for main HTTP traffic
    location / {
        include proxy_params;
        proxy_pass http://unix:${GUNICORN_SOCKET};
    }

    # Serve Django static files
    location /static/ {
        alias ${APP_DIR}/static/;
    }

    # Serve React build assets
    location /assets/ {
        alias ${APP_DIR}/frontend/dist/assets/;
    }

    # Serve media files if any
    location /media/ {
        alias ${APP_DIR}/media/;
    }

    # WebSockets for Daphné
    location /ws/ {
        proxy_pass http://127.0.0.1:${WEBSOCKET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Host \$host;
    }
}
EOF

ln -sf /etc/nginx/sites-available/dispatcharr.conf /etc/nginx/sites-enabled/dispatcharr.conf

# Remove default site if it exists
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

echo ">>> Testing Nginx config..."
nginx -t

echo ">>> Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

##############################################################################
# 14) Start & Enable Services
##############################################################################

echo ">>> Enabling systemd services..."
systemctl daemon-reload
systemctl enable dispatcharr
systemctl enable dispatcharr-celery
systemctl enable dispatcharr-celerybeat
systemctl enable dispatcharr-daphne

echo ">>> Restarting / Starting services..."
systemctl restart dispatcharr
systemctl restart dispatcharr-celery
systemctl restart dispatcharr-celerybeat
systemctl restart dispatcharr-daphne

##############################################################################
# Done!
##############################################################################

echo "================================================="
echo "Dispatcharr installation (or update) complete!"
echo "Nginx is listening on port ${NGINX_HTTP_PORT}."
echo "Gunicorn socket: ${GUNICORN_SOCKET}."
echo "WebSockets on port ${WEBSOCKET_PORT} (path /ws/)."
echo "You can check logs via 'sudo journalctl -u dispatcharr -f', etc."
echo "Visit http://<server_ip>:${NGINX_HTTP_PORT} in your browser."
echo "================================================="
