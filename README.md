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

cd backend
cp .env.example .env          # đổi JWT_ACCESS_SECRET
npm install                   # tự chạy prisma generate
npx prisma migrate dev        # tạo bảng
npx prisma db seed            # tạo tài khoản admin
npm run start:dev             # http://localhost:3000/api/health

cd frontend && npm install && npm run dev         # http://localhost:5173
```
Frontend proxy `/api` sang backend.

Tài khoản do seed tạo:

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@hton.local` | `Admin@123` (đổi trong `backend/.env`) |
| Giảng viên | `gv@hton.local` | `Giangvien@123` |

Seed cũng tạo khóa học mẫu "Nhập môn lập trình Web" đã công bố.

File đính kèm lưu ở `backend/uploads/` (đổi bằng `UPLOAD_DIR`), chỉ tải được qua API có kiểm tra quyền.

## Kiểm thử
```bash
cd backend
npm test            # unit test
npm run test:e2e    # e2e, cần Postgres đang chạy
```

## Xác thực
- Access token JWT 15 phút, gửi qua header `Authorization: Bearer`. Frontend chỉ giữ trong bộ nhớ.
- Refresh token ngẫu nhiên trong cookie `httpOnly`, `SameSite=Strict`, `Path=/api/auth`; DB chỉ lưu SHA-256.
- Mỗi lần refresh sẽ xoay vòng token. Dùng lại token đã thu hồi thì toàn bộ chuỗi phiên bị thu hồi.
- Mọi API mặc định cần đăng nhập; route công khai gắn `@Public()`, giới hạn vai trò bằng `@Roles(...)`.
- Rate limit: 10 lần/phút cho đăng ký và đăng nhập, 300 lần/phút cho các API khác.

## Tài liệu
- [Đặc tả yêu cầu](docs/dac-ta.md)
- [ERD](docs/erd.md)
- [Kiến trúc](docs/kien-truc.md)
- [Quy ước nhánh và commit](docs/quy-uoc.md)
