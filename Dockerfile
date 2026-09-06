# syntax=docker/dockerfile:1

# Both bases are pinned by digest so a build is reproducible and the image that
# was scanned is the image that ships. The build stage never reaches the final
# image, so its CVEs do not ship; the runtime base is what the scan gate guards.
# Bump by replacing tag AND digest together (dependabot does this for you).
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
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
COPY docker/entrypoint.sh /entrypoint.sh
USER 0
RUN chmod 755 /entrypoint.sh \
    && mkdir -p /srv/config \
    && chown -R 101:101 /srv/config /usr/share/nginx/html
USER 101
EXPOSE 8080
LABEL org.opencontainers.image.source="https://github.com/example/kube-state-graph-frontend"
ENTRYPOINT ["/entrypoint.sh"]
