FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG APP=public
ENV APP=${APP}

EXPOSE 4200 4300

CMD ["sh", "-c", "npm run start:${APP}"]