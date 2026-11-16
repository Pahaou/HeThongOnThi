# Backend NestJS: build ở tầng đầu, chạy bằng image gọn ở tầng sau
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Client Prisma đã biên dịch vào dist; prisma CLI và dotenv nằm ở dependencies để chạy migrate deploy
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
# Áp migration rồi chạy server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
