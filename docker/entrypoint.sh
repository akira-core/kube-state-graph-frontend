#!/bin/sh
set -eu

# Two proxies, two upstreams. `/api/` fronts the graph API; `/metrics-api/` fronts a
# Prometheus-compatible store, because the filter and Sankey controls enumerate their
# options from `/api/v1/label/<name>/values?match[]=kube_pod_info` — a path the graph API
# does not serve. Pointing `endpoints.labelValues` at the graph API is a 404 that reads as
# an estate with no az / env rather than as a misconfiguration.

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

if [ -n "${KSG_METRICS_PROXY_TARGET:-}" ]; then
  cat > /tmp/metrics_proxy.conf <<EOF
location /metrics-api/ {
    proxy_pass ${KSG_METRICS_PROXY_TARGET}/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    add_header Cache-Control "no-store" always;
    add_header X-Content-Type-Options nosniff always;
}
EOF
else
  cat > /tmp/metrics_proxy.conf <<EOF
location /metrics-api/ {
    default_type text/plain;
    add_header Cache-Control no-store always;
    add_header X-Content-Type-Options nosniff always;
    return 404;
}
EOF
fi

exec nginx -g 'daemon off;'
