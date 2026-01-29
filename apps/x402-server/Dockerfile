FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3402

COPY --from=builder /app/package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3402

CMD ["node", "dist/index.js"]
