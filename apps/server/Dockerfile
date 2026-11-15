FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global pnpm@10.34.9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @mimi/server build
ENV NODE_ENV=production HOST=0.0.0.0
USER node
EXPOSE 3001
CMD ["pnpm", "--filter", "@mimi/server", "start"]
