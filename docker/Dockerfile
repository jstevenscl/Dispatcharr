FROM python:3.10-slim

# Install required packages including ffmpeg, streamlink, and vlc
RUN apt-get update && apt-get install -y \
    ffmpeg \
    streamlink \
    vlc \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

ENV API_PORT=5656

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . /app/

# Set environment variables
ENV DJANGO_SETTINGS_MODULE=dispatcharr.settings
ENV PYTHONUNBUFFERED=1
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

# Run Django commands
RUN python manage.py collectstatic --noinput || true
RUN python manage.py migrate --noinput || true

# Expose port 9191 (this is the port the app will listen on inside the container)
EXPOSE 9191

# Command to run the application binding to host and port
CMD ["gunicorn", "--workers=4", "--worker-class=gevent", "--timeout=300", "--bind", "0.0.0.0:5656", "dispatcharr.wsgi:application"]
