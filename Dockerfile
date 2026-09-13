# syntax=docker/dockerfile:1

# Both bases are pinned by digest so a build is reproducible and the image that
# was scanned is the image that ships. The build stage never reaches the final
# image, so its CVEs do not ship; the runtime base is what the scan gate guards.
# Bump by replacing tag AND digest together (dependabot does this for you).
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# `-slim` carries nginx + its core modules only: no image-filter / xslt modules and
# therefore no libpng / tiff / libxml2 / curl, which were most of the CVE surface.
# nginx.conf uses only core directives (gzip, try_files, proxy_pass), so slim suffices.
FROM nginxinc/nginx-unprivileged:1.31.5-alpine-slim@sha256:7d289d4f8935051d213bc3ecee3b4fc2d52f97ea5a954273e031054b633e7934
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
USER 0
RUN chmod 755 /entrypoint.sh \
    && chown -R root:root /etc/nginx /usr/share/nginx/html \
    && chmod -R a+rX,go-w /etc/nginx /usr/share/nginx/html \
    && mkdir -p /srv/config
USER 101
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/example/kube-state-graph-frontend"
ENTRYPOINT ["/entrypoint.sh"]
