FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/package.json app/package-lock.json ./app/
COPY web/package.json web/package-lock.json ./web/
RUN npm ci
RUN npm ci --prefix app
RUN npm ci --prefix web
COPY . .
RUN npm run build:render

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/app/dist ./app/dist
COPY --from=build /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
