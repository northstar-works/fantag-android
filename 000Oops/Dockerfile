FROM python:3.12-slim

# System deps for Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Make sure /app is always on the Python path (fixes seed.py module resolution)
ENV PYTHONPATH=/app

# Data and uploads volumes
RUN mkdir -p /data /uploads

ENV DATABASE_URL=sqlite:////data/fantag.db

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
