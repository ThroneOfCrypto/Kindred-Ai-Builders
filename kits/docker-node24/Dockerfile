# kits/docker-node24/Dockerfile
#
# Diagnostic runner for Kindred Deterministic Core under Docker.
#
# IMPORTANT:
# - This lane is NOT authoritative.
# - Vercel remains the only authoritative kernel executor.
# - We explicitly set KINDRED_ALLOW_LOCAL_DIAGNOSTIC=1 so the Vercel guard does not block.

FROM node:24-bookworm-slim

WORKDIR /repo

# Keep installs deterministic and cache-friendly
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the repo
COPY . .

# Diagnostic override: allow contract checks to run outside Vercel.
ENV KINDRED_ALLOW_LOCAL_DIAGNOSTIC=1

# Default: run the kernel test suite (build is also available)
CMD ["npm", "test"]
