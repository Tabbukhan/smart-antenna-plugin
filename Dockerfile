FROM node:18

WORKDIR /app

# Accept NPM_TOKEN from GitHub Actions
ARG NPM_TOKEN
ENV NPM_TOKEN=${NPM_TOKEN}

# Write secure .npmrc for private registry access
RUN echo "@speedshield:registry=https://registry.npmjs.org/" > .npmrc \
    && echo "always-auth=true" >> .npmrc \
    && echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" >> .npmrc

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Start application
CMD ["node", "src/Main.js"]
