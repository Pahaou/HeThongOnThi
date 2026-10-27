# HTON – Hệ thống học tập và ôn thi trực tuyến tích hợp AI

Stack: React + Vite (frontend), NestJS (backend), PostgreSQL, Redis.

## Cấu trúc
```
frontend/   React + TypeScript (Vite)
backend/    NestJS API, prefix /api
docs/       Đặc tả, ERD, kiến trúc, quy ước
docker-compose.yml   Postgres + Redis cho môi trường dev
```

## Chạy dev
```bash
cp .env.example .env
docker compose up -d          # Postgres :5432, Redis :6379

cd backend && npm install && npm run start:dev    # http://localhost:3000/api/health
cd frontend && npm install && npm run dev         # http://localhost:5173
```
Frontend proxy `/api` sang backend, nên trang chủ hiển thị trạng thái backend.

## Tài liệu
- [Đặc tả yêu cầu](docs/dac-ta.md)
- [ERD](docs/erd.md)
- [Kiến trúc](docs/kien-truc.md)
- [Quy ước nhánh và commit](docs/quy-uoc.md)
