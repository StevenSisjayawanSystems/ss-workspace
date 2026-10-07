# Game server image, used by Railway. The web app is deployed separately on Vercel.
FROM node:22-slim
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate
WORKDIR /app

# Install first, from manifests only, so dependency layers are reused between deploys.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod --filter server...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

USER node
WORKDIR /app/apps/server
# Railway supplies PORT; 2567 is the local default.
EXPOSE 2567
# Started with node directly, so nothing is downloaded at boot and shutdown signals reach the server.
CMD ["node", "--import", "tsx", "src/index.ts"]
