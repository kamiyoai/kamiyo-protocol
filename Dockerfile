FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY database/ ./database/
COPY aggregators/ ./aggregators/
COPY api/ ./api/
COPY frontend/ ./frontend/
COPY config/ ./config/
COPY main.py .

# Create data directory
RUN mkdir -p /app/data

# Expose ports
EXPOSE 8000 3000

# Run application
CMD ["python", "main.py", "all"]
