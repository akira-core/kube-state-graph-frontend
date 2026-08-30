# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
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
