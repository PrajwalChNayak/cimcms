# Use an official Node.js runtime as a parent image
FROM node:20


# Set the working directory in the container
WORKDIR /usr/src/app

RUN npm install pm2 -g
# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

RUN npm run gp


# Expose the port on which your app runs
EXPOSE 3506


# Command to run your app
CMD ["pm2-runtime", "app.js"]