# Use the official Node.js 18 image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Expose the app port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
