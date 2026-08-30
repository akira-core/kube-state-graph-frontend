#!/bin/sh
set -eu

if [ -n "${KSG_API_PROXY_TARGET:-}" ]; then
  cat > /tmp/api_proxy.conf <<EOF
location /api/ {
    proxy_pass ${KSG_API_PROXY_TARGET}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options nosniff always;
}
EOF
else
  cat > /tmp/api_proxy.conf <<EOF
location /api/ {
    default_type text/plain;
    add_header Cache-Control no-store always;
    add_header X-Content-Type-Options nosniff always;
    return 404;
}
EOF
fi

exec nginx -g 'daemon off;'
