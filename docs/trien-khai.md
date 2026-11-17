# Triển khai production (giai đoạn 6)

Một VPS chạy Docker: Caddy (HTTPS tự động, phục vụ frontend, chuyển `/api` và `/socket.io`), backend NestJS, Postgres, Redis, và container sao lưu hằng ngày. Cấu hình nằm trong [docker-compose.prod.yml](../docker-compose.prod.yml).

## 1. Chuẩn bị
- VPS Linux, tối thiểu 2 vCPU / 2 GB RAM, đã cài Docker và Docker Compose.
- Tên miền trỏ bản ghi `A` về IP VPS; mở cổng 80 và 443 (Caddy cần cổng 80 để lấy chứng chỉ Let's Encrypt).

## 2. Triển khai lần đầu
```bash
git clone https://github.com/Pahaou/HeThongOnThi.git && cd HeThongOnThi
cp .env.prod.example .env.prod      # điền DOMAIN, mật khẩu, JWT_ACCESS_SECRET (openssl rand -hex 32)
docker build -t hton-backend backend && docker build -t hton-web frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
# Tài khoản demo (admin theo ADMIN_EMAIL/ADMIN_PASSWORD, gv@hton.local, hv@hton.local) và dữ liệu mẫu
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend node dist-seed/prisma/seed.js
```
Backend tự chạy `prisma migrate deploy` mỗi lần khởi động. Image được build bằng `docker build` vì `compose --build` của Compose v5 đòi cấp thêm quyền đọc file.

## 3. Kiểm tra sau khi triển khai (giờ đầu)
- [ ] `curl https://DOMAIN/api/health` trả `{"status":"ok"}`
- [ ] `docker compose -f docker-compose.prod.yml ps`: mọi service `running`, backend `healthy`
- [ ] Đăng nhập học viên, mở một bài học; đăng nhập giảng viên, mở màn giám thị (WebSocket kết nối)
- [ ] `docker compose -f docker-compose.prod.yml logs backend --since 10m` không có lỗi mới
- [ ] Có file sao lưu đầu tiên trong `./backups/`

## 4. Cập nhật phiên bản
```bash
git pull
docker build -t hton-backend backend && docker build -t hton-web frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend web
```
Tránh cập nhật **trong giờ thi**: backend khởi động lại vài giây, client tự gửi bù (IndexedDB) nhưng thí sinh sẽ thấy thông báo mất kết nối.

## 5. Sao lưu và khôi phục
- Container `backup` chạy `pg_dump` mỗi 24 giờ vào `./backups/hton-<thời điểm>.sql.gz`, giữ 7 bản. Nên chép thư mục này ra ngoài VPS định kỳ.
- Sao lưu ngay: `docker compose -f docker-compose.prod.yml restart backup`.
- Khôi phục (ghi đè dữ liệu hiện tại):
```bash
docker compose -f docker-compose.prod.yml stop backend
gunzip -c backups/hton-YYYYMMDD-HHMMSS.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $POSTGRES_DB WITH (FORCE)" -c "CREATE DATABASE $POSTGRES_DB" && psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose -f docker-compose.prod.yml start backend
```
File đính kèm bài học nằm ở volume `uploads`, không nằm trong bản sao lưu CSDL.

## 6. Kế hoạch rollback
**Khi nào:** health check lỗi, tỉ lệ lỗi 5xx tăng gấp đôi, hoặc chức năng thi (vào thi/lưu/nộp) hỏng sau khi cập nhật.

**Cách làm (dưới 5 phút):**
1. `git checkout <tag hoặc commit trước>` (các mốc: `v0.1`, `v0.2`, `v0.3`, ...)
2. `docker build -t hton-backend backend && docker build -t hton-web frontend
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend web`
3. Kiểm tra lại mục 3.

**Migration:** Prisma không có migration ngược. Nếu bản lỗi đã chạy migration làm hỏng dữ liệu, khôi phục từ bản sao lưu trước lần cập nhật (mục 5). Vì vậy **sao lưu ngay trước mỗi lần cập nhật**.

## 7. Giám sát
- Log: `docker compose -f docker-compose.prod.yml logs -f backend` (Nest ghi ra stdout; lượt quét chấm bài in số bài tự nộp/xếp hàng lại).
- Sức khỏe: `/api/health`; Docker tự khởi động lại container lỗi (`restart: unless-stopped`).
- Chi phí AI: bảng `ai_usages` (trạng thái, số token theo người dùng).

## Rủi ro đã biết
- Backend đặt `TRUST_PROXY=1` để lấy IP thật từ Caddy. Nếu thêm một proxy/CDN nữa phía trước thì tăng số này; nếu cho backend nhận request trực tiếp (không qua Caddy) thì bỏ biến này, kẻo client tự khai IP để lách giới hạn đăng nhập.
- Bộ đếm rate limit lưu trong bộ nhớ từng tiến trình: chỉ đúng khi chạy **một** instance backend.
- `npm audit`: còn 2 lỗi mức trung bình ở `uuid` (phụ thuộc của `exceljs`), chỉ xảy ra khi truyền tham số `buf`; bản sửa cần đổi phiên bản phá tương thích nên chưa áp dụng.
- Đăng nhập giới hạn 10 lần/phút theo IP: thi tập trung cả phòng chung một IP có thể cần nâng ([ADR-004](decisions/ADR-004-rate-limit-theo-nguoi-dung.md)).
