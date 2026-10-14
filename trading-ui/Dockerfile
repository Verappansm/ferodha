# Trading UI and admin console in one image: both are built for production and
# served by nginx, the trading UI at / and the console at /admin/ (its baseHref).
# One origin for both, so the APIs' CORS allow list needs only this address.

# Build stage: `npm run build` builds both apps into dist/.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Runtime stage: static files only, no Node.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/trading-ui/browser /usr/share/nginx/html
COPY --from=build /app/dist/admin/browser /usr/share/nginx/html/admin

EXPOSE 80
