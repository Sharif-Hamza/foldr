# Use the official Node.js runtime as base image
FROM node:18-alpine

# Install qpdf, ghostscript, and Sharp dependencies
RUN apk add --no-cache \
    qpdf \
    ghostscript \
    vips-dev \
    python3 \
    make \
    g++

# Set the working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p uploads output compressed

# Expose the port
EXPOSE 3001

# Start the application
CMD ["npm", "start"] 