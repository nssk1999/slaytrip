# Use slim Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy backend
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy full project
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Set working directory to backend so relative path to frontend works
WORKDIR /app/backend

# Expose port
EXPOSE 8080

# Start the server
CMD ["python", "main.py"]
