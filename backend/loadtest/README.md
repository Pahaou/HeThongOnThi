# Đo tải kỳ thi

Cần Docker đang chạy (Postgres, Redis của `docker-compose.yml`). Chạy từ thư mục gốc repo.

```bash
# 1. Backend trong mạng Docker (JWT_ACCESS_SECRET phải giống backend/.env)
docker build -t hton-backend backend
export JWT_ACCESS_SECRET=$(grep ^JWT_ACCESS_SECRET backend/.env | cut -d= -f2-)
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d backend

# 2. Tạo 300 thí sinh + kỳ thi đang mở, ghi loadtest/data.json
cd backend && npx ts-node loadtest/seed.ts 300

# 3. Chạy k6 trong cùng mạng Docker (Git Bash trên Windows cần MSYS_NO_PATHCONV=1)
MSYS_NO_PATHCONV=1 docker run --rm --network hton_default \
  -e BASE_URL=http://backend:3000/api \
  -v "$(cygpath -w "$(pwd)/loadtest"):/scripts" -w /scripts \
  grafana/k6:0.55.0 run exam.js

# 4. Đối chiếu: số saves_ok và submits_ok k6 in ra
npx ts-node loadtest/verify.ts <saves_ok> <submits_ok>

# 5. Dọn dữ liệu đo tải
npx ts-node loadtest/seed.ts --clean
```

Kịch bản tắt server: chạy bước 3 ở nền, sau ~7 giây `docker kill hton-backend-1` rồi `docker start hton-backend-1`, sau đó chạy bước 4 với số k6 in ra.

Kết quả đã đo: [docs/hieu-nang.md](../../docs/hieu-nang.md).
