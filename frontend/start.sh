#!/bin/sh
# Generate nginx.conf with the actual backend URL from environment variable
# BACKEND_URL must be set as an environment variable in Northflank

if [ -z "$BACKEND_URL" ]; then
  echo "ERROR: BACKEND_URL environment variable is not set!"
  exit 1
fi

echo "Starting nginx with backend proxy: $BACKEND_URL"

# Substitute $BACKEND_URL in nginx template and write final config
envsubst '$BACKEND_URL' < /etc/nginx/nginx.template > /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'
