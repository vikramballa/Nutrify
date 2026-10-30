# Build context must be the REPO ROOT (workspaces: shared + hoisted deps):
#   docker build -f apps/api/Dockerfile -t nutrichef-api .

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci -w @nutrichef/shared -w @nutrichef/api --include-workspace-root=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @nutrichef/api   # prisma generate + shared build + tsc → dist/

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 4000
# DATABASE_URL and AUTH_SECRET must be provided at runtime.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
