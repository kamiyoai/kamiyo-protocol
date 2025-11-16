#!/bin/bash

# Kill any existing processes on port 3001
echo "Checking for processes on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Kill any existing processes on port 3000 (old port)
echo "Checking for processes on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

cd /Users/dennisgoslar/Projekter/kamiyo/website

echo "Starting dev server on port 3001..."
PORT=3001 npm run dev
