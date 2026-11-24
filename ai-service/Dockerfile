# Python 3.11+ is required for the patched filelock release (see docs/SECURITY_REVIEW.md).
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 speech && mkdir -p /models && chown speech /models
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "filelock>=4.2.1"
COPY app app
USER speech
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
