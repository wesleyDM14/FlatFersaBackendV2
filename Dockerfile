# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN yarn build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist

RUN mkdir -p tmp

EXPOSE 3333
CMD ["node", "dist/server.js"]
