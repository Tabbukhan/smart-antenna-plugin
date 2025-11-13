FROM node:18

WORKDIR /app

# Copy npmrc for private registry
COPY .npmrc ./l

# Copy dependency files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

ENV VELOCITY_HOME=assembly

CMD ["node", "src/Main.js"]
