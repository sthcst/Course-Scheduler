FROM python:3.9-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

# Make sure the entrypoint script is executable
RUN chmod +x entrypoint.sh

# Set environment variables
ENV PORT=5000
ENV PYTHONUNBUFFERED=1

# Expose the port the app will run on
EXPOSE 5000

# Command to run the application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "api:app"]