# syntax=docker/dockerfile:1

# Both bases are pinned by digest so a build is reproducible and the image that
# was scanned is the image that ships. The build stage never reaches the final
# image, so its CVEs do not ship; the runtime base is what the scan gate guards.
# Bump by replacing tag AND digest together (dependabot does this for you).
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# `-slim` carries nginx + its core modules only: no image-filter / xslt modules and
# therefore no libpng / tiff / libxml2 / curl, which were most of the CVE surface.
# nginx.conf uses only core directives (gzip, try_files, proxy_pass), so slim suffices.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY docker/entrypoint.sh /entrypoint.sh
# The runtime user owns nothing it serves or is configured by. The base image leaves
# /etc/nginx writable for its own templating entrypoint, which this image replaces; a
# writable config or web root would let a compromised nginx process rewrite the bundle
# every browser loads, or reconfigure itself on the next reload. It writes only to /tmp.
# What it reads is made world-readable explicitly: COPY keeps source modes, so a checkout
# made under umask 077 would otherwise ship 0600 files the nginx user cannot open.
#
# zlib is upgraded in place: the 1.31.7 base still ships 1.3.2-r0, which Trivy flags
# (CVE-2026-85091) with 1.3.2-r1 available. Drop this once a base carries the fix.
USER 0
RUN apk upgrade --no-cache zlib \
    && chmod 755 /entrypoint.sh \
    && chown -R root:root /etc/nginx /usr/share/nginx/html \
    && chmod -R a+rX,go-w /etc/nginx /usr/share/nginx/html \
    && mkdir -p /srv/config
USER 101
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/example/kube-state-graph-frontend"
ENTRYPOINT ["/entrypoint.sh"]
