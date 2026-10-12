# Stage 1: run the Python data pipeline
FROM python:3.11-slim AS build
WORKDIR /app
COPY scripts ./scripts
COPY data ./data
COPY web ./web
RUN python scripts/build_data.py

# Stage 2: serve the static app with nginx
FROM nginx:1.27-alpine
COPY --from=build /app/web /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/ >/dev/null || exit 1
