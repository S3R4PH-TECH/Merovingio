FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY Workspace/Merovingio/data-sync-svc/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY Workspace/Merovingio/data-sync-svc/app /app/app

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
