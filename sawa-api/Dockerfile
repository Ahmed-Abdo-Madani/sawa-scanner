# Base image with Node.js and Playwright dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

# Set working directory inside the container
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy scripts folder since postinstall script needs scripts/download-tessdata.js
COPY scripts/ ./scripts/

# Install dependencies (this will also trigger scripts/download-tessdata.js)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the NestJS application
RUN npm run build

# Expose port (Koyeb uses PORT environment variable, usually 8080)
EXPOSE 3000

# Start command: run migrations first, then run production server
CMD ["sh", "-c", "npm run migration:run && npm run start:prod"]
