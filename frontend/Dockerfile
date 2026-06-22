FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# We need to build Next.js for production or we can just run dev mode
# For MVP docker-compose, running dev mode is often easier, but let's do a build for a proper image
# Wait, for now let's just use dev server to make it simple and allow live-reload with volumes
CMD ["npm", "run", "dev"]
