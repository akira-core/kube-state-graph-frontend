#!/bin/sh
set -eu

# Two proxies, two upstreams. `/api/` fronts the graph API; `/metrics-api/` fronts a
# Prometheus-compatible store, because the filter and Sankey controls enumerate their
# options from `/api/v1/label/<name>/values?match[]=kube_pod_info` — a path the graph API
# does not serve. Pointing `endpoints.labelValues` at the graph API is a 404 that reads as
# an estate with no az / env rather than as a misconfiguration.
#
# Every generated location includes the shared security headers: nginx drops the
# server-level add_header set from any block that declares its own, so a header set once
# at server level would silently vanish from these responses.
HEADERS=/etc/nginx/security-headers.conf

# Each target is pasted verbatim into nginx config, so it must be a bare http(s) URL. A
# space, `;`, brace, quote or `$` would be parsed as config rather than as part of the
# URL — refuse to start instead of serving an injected location.
NL='
'
require_upstream_url() {
  case $2 in
    *"$NL"*) ;;
    http://?* | https://?*)
      if printf '%s' "$2" | grep -Eqx 'https?://[][A-Za-z0-9._~:/@%+=,-]+'; then
        return 0
      fi
      ;;
  esac
  echo "entrypoint: $1 must be a bare http(s) URL, got: $2" >&2
  exit 1
}

not_found() {
  cat <<EOF
location $1 {
    default_type text/plain;
    add_header Cache-Control no-store always;
    include $HEADERS;
    return 404;
}
EOF
}

# GET (and HEAD) only: the SPA never writes, so no other method has a reason to reach an
# upstream through the front door.
proxy_location() {
  cat <<EOF
location $1 {
    limit_except GET { deny all; }
    proxy_pass $2;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    # The browser policy is this server's to set: drop an upstream's copy so each header
    # reaches the browser exactly once.
    proxy_hide_header Content-Security-Policy;
    proxy_hide_header X-Frame-Options;
    proxy_hide_header Referrer-Policy;
    proxy_hide_header X-Content-Type-Options;
    add_header Cache-Control "no-store" always;
    include $HEADERS;
}
EOF
}

[ -z "${KSG_API_PROXY_TARGET:-}" ] || require_upstream_url KSG_API_PROXY_TARGET "$KSG_API_PROXY_TARGET"
[ -z "${KSG_METRICS_PROXY_TARGET:-}" ] || require_upstream_url KSG_METRICS_PROXY_TARGET "$KSG_METRICS_PROXY_TARGET"

if [ -n "${KSG_API_PROXY_TARGET:-}" ]; then
  {
    proxy_location /api/ "${KSG_API_PROXY_TARGET}/"
    # The backend's Prometheus registry is for an in-cluster scraper, not for a browser.
    not_found '= /api/metrics'
  } > /tmp/api_proxy.conf
else
  not_found /api/ > /tmp/api_proxy.conf
fi

# Only label enumeration is forwarded — the one store API the controls read. The rest of
# it (query, query_range, series, export) stays behind the 404: the front door carries no
# authentication, so forwarding the whole prefix would hand every browser arbitrary PromQL
# and a bulk export of every series in the store.
{
  not_found /metrics-api/
  if [ -n "${KSG_METRICS_PROXY_TARGET:-}" ]; then
    proxy_location /metrics-api/api/v1/label/ "${KSG_METRICS_PROXY_TARGET}/api/v1/label/"
  fi
} > /tmp/metrics_proxy.conf

exec nginx -g 'daemon off;'
