#!/bin/bash

echo "🔹 Cleaning up old Docker containers and volumes..."

# Para todos os containers
docker stop $(docker ps -aq) 2>/dev/null

# Remove todos os containers
docker rm $(docker ps -aq) 2>/dev/null

# Remove todos os volumes
docker volume rm $(docker volume ls -q) 2>/dev/null

# Remove todas as imagens não utilizadas
docker image prune -af 2>/dev/null

echo "✅ Cleanup done!"

echo "🔹 Starting Docker..."
docker compose up --build
echo "✅ Docker started!"
