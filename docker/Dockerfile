FROM python:3.10-slim

# Install required packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

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

# Expose the port
EXPOSE 8000

# Command to run the application
CMD ["gunicorn", "--workers=4", "--worker-class=gevent", "--timeout=300", "--bind", "0.0.0.0:8000", "dispatcharr.wsgi:application"]
