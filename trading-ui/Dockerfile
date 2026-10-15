# Trading UI and admin console in one image: both are built for production and
# served by nginx, the trading UI at / and the console at /admin/ (its baseHref).
# One origin for both, so the APIs' CORS allow list needs only this address.

# Build stage: both apps into dist/ (what `npm run build` does, one at a time).
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx ng build admin
# `ng build trading-ui` writes its output and prints "Output location", then
# never exits: an esbuild service process it started stays open, so a plain
# RUN waits forever. Run it in the background and finish the step once it has
# succeeded, reported an error or exited; the step's end discards the leftover
# process.
RUN (npx ng build trading-ui > /tmp/build.log 2>&1; echo "ng exited with $?" >> /tmp/build.log) & \
    until grep -qE "Output location|\[ERROR\]|ng exited with" /tmp/build.log 2>/dev/null; do sleep 1; done; \
    sleep 1; \
    cat /tmp/build.log; \
    grep -q "Output location" /tmp/build.log && test -f dist/trading-ui/browser/index.html

# Runtime stage: static files only, no Node.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/trading-ui/browser /usr/share/nginx/html
COPY --from=build /app/dist/admin/browser /usr/share/nginx/html/admin

EXPOSE 80
