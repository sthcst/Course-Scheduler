# Use the official Node.js LTS image as the base
FROM node:14

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Install nodemon globally
RUN npm install -g nodemon

# Expose the port
EXPOSE 3000

# Default command (will be overridden by Docker Compose)
CMD ["nodemon", "server.js"]