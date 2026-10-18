# Frontend image, built in TWO stages (multi-stage build):
#   Stage 1 (node):  install packages and build the React app into static files (dist/)
#   Stage 2 (nginx): a tiny web server that only serves those files
# The final image has no Node.js and no node_modules: small and safe.

# ---------- Stage 1: build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Vite puts VITE_* values INTO the JavaScript at BUILD time, so the API URL
# is a build argument:  docker build --build-arg VITE_API_BASE_URL=https://... .
ARG VITE_API_BASE_URL=http://localhost:8000
ARG VITE_DEMO_MODE=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_DEMO_MODE=$VITE_DEMO_MODE

# Install dependencies first (cached layer), exactly as locked in package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
