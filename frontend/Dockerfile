# Build stage — Node 22 because vite 8 and the test toolchain expect >= 22.
FROM node:22-alpine AS build

WORKDIR /app

# Copied first so the dependency layer is reused whenever only sources change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve stage — static files only. The dashboards talk to the gateway and n8n
# through absolute localhost URLs resolved by the browser, so no reverse proxy
# is needed here.
FROM nginx:1.27-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# 127.0.0.1, not localhost: inside the container localhost resolves to ::1
# first, while `listen 80` binds IPv4 only — the probe would hit nothing.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
