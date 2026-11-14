# SELENE server for a Hugging Face Docker Space: custom points (NASA pipeline) + Luna's AI answers.
# Built from the folder that deploy/huggingface/assemble.py writes.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=7860 \
    POINTS_DIR=/data/points \
    MPLCONFIGDIR=/tmp/matplotlib

# Spaces run as user 1000; give it the app and a writable cache.
RUN useradd -m -u 1000 user && mkdir -p /data/points /app/spike/fine && chown -R user /data /app
WORKDIR /app

COPY --chown=user server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY --chown=user server server
COPY --chown=user spike spike
COPY --chown=user web web

USER user
EXPOSE 7860
CMD ["python", "server/point_server.py"]
