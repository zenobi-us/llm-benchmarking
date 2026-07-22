FROM ubuntu:24.04

# Create working directory
WORKDIR /app

# Install openssh-client for the task
RUN apt-get update && apt-get install -y openssh-client && rm -rf /var/lib/apt/lists/*
