#!/bin/sh
# Skript for running migrations on startup

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Starting server..."
node --es-module-specifier-resolution=node dist/index.js
