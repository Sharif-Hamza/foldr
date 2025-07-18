# Use the official Node.js runtime as base image
FROM node:18-alpine

# Install qpdf, ghostscript, poppler-utils, and Sharp dependencies with proper verification
RUN apk add --no-cache \
    qpdf \
    ghostscript \
    poppler-utils \
    vips-dev \
    python3 \
    make \
    g++ \
    && which qpdf \
    && which gs \
    && which pdftotext \
    && qpdf --version \
    && gs --version \
    && pdftotext -v

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