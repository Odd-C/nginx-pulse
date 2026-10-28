FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY scripts/ ./scripts/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8090
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8090"]
