# Việc cần làm (theo [plan.md](plan.md))

Lệnh kiểm chứng dùng chung (trong `backend/`): `npm test`, `npm run test:e2e` (cần Postgres và Redis), `npm run lint`, `npx tsc --noEmit -p tsconfig.build.json`. Frontend: `npm run build`.

## Giai đoạn A: Ổn định code

### T1: Gộp 5 PR và gắn tag
**Mô tả:** Gộp #11 → #12 → #13 → #14 → #15 vào `main` bằng "Create a merge commit", đúng thứ tự, rồi gắn tag cho từng giai đoạn.
**Tiêu chí đạt:**
- [x] 5 PR ở trạng thái merged, `main` chứa commit `c29762e`
- [x] Tag `v0.4` (merge #12), `v0.5` (merge #13), `v0.6` (merge #15) đã đẩy lên remote
**Kiểm chứng:**
- [x] CI trên `main` xanh
- [x] `git log --oneline --graph main` thấy đủ 5 merge commit
**Phụ thuộc:** người dùng duyệt (Claude bị chặn tự gộp)
**File:** không có
**Cỡ:** XS

### T2: Sửa lỗi kiểu trong test, thêm typecheck test vào CI
**Mô tả:** `tsc -p tsconfig.json` báo lỗi ở `test/exams.e2e-spec.ts:519` (`clientSavedAt` thiếu trong kiểu). CI hiện không typecheck thư mục test nên lỗi này lọt qua.
**Tiêu chí đạt:**
- [x] `npx tsc --noEmit -p tsconfig.json` không còn lỗi
- [x] CI có bước typecheck cả `src` lẫn `test`
**Kiểm chứng:**
- [x] CI xanh trên PR #16
**Phụ thuộc:** T1
**File:** `backend/test/exams.e2e-spec.ts`, `.github/workflows/*.yml`
**Cỡ:** XS

### T3: Dọn mục 6–7 của review
**Mô tả:** `recommendation()` gọi `stats.overview` và `unresolvedWrongIds` hai lần (lần thứ hai qua `weaknessQuestionIds`). `ProctorService.lastEmit` chỉ thêm, không bao giờ xóa.
**Tiêu chí đạt:**
- [x] Mỗi lần mở gợi ý chỉ chạy mỗi truy vấn thống kê một lần
- [x] Mục trong `lastEmit` của thí sinh bị xóa khi bài được chấm (`scheduled` vốn đã tự xóa khi hẹn giờ chạy)
**Kiểm chứng:**
- [x] `ai.e2e-spec` và `proctor.e2e-spec` vẫn qua
**Phụ thuộc:** T1
**File:** `backend/src/ai/ai.service.ts`, `backend/src/exams/proctor.service.ts`
**Cỡ:** S

### Checkpoint A
- [ ] CI xanh trên `main`, 40 unit + 80 e2e qua, typecheck test qua
- [ ] Người dùng xem lại trước khi sang triển khai

### Sửa sau khi chạy thử (18/11)
- [x] F5 trong lúc thi không còn bị tính vi phạm (`pagehide`), server bỏ sự kiện gửi trùng (`client_event_id`, migration `20261118030000_event_dedupe`)
- [x] Tiêu đề trang "HTON – Học và ôn thi trực tuyến"
- [x] Học viên thấy "Tính năng AI chưa được bật" thay vì tên biến cấu hình
- [x] Tinh chỉnh UI: màu trạng thái thành token có bản tối, màn giám thị nổi bật thí sinh mất kết nối, nút Sửa/Xóa tách xa, thẻ khóa học màu phẳng, vòng focus bàn phím
- [x] Khóa "JavaScript cơ bản" trong DB dev đã bật lại 26/11. Không có test nào đổi trạng thái khóa học, nhiều khả năng do bấm "Chuyển về nháp" khi chạy thử giao diện
- [ ] E2E và backend dev dùng chung hàng đợi Redis: chạy e2e khi đang bật backend dev thì test giám thị chập chờn (job chấm bị tiến trình khác lấy). Cân nhắc cho e2e dùng prefix hàng đợi riêng

## Giai đoạn B: Triển khai (máy cá nhân trước)

### T4: Chạy cụm production trên máy cá nhân
**Mô tả:** Làm theo mục 2–3 của `docs/trien-khai.md` trên máy Windows với Docker Desktop, `DOMAIN=localhost` (Caddy dùng chứng chỉ nội bộ). Dùng đúng cấu hình sẽ chạy trên VPS sau này.
**Tiêu chí đạt:**
- [x] `https://localhost/api/health` trả `{"status":"ok"}`, mọi service `running`, backend `healthy` (26/11)
- [x] Đủ 5 mục checklist ở mục 3 của runbook, kể cả có file sao lưu đầu tiên. Phát hiện và sửa lỗi sao lưu lỗi vẫn tạo file rỗng (pipefail)
- [x] Ghi vào runbook một mục "Chạy trên máy cá nhân" (cài chứng chỉ Caddy hoặc chấp nhận cảnh báo, mở Docker Desktop trước, lệnh dựng lại từ đầu)
**Kiểm chứng:**
- [x] Đăng nhập học viên và giảng viên trên 2 trình duyệt. Màn giám thị kết nối qua `wss://localhost` (puppeteer, không lỗi 5xx/JS)
**Phụ thuộc:** Checkpoint A
**File:** `.env.prod` (chỉ trên máy, không commit), `docs/trien-khai.md`
**Cỡ:** S
**Lưu ý:** Cụm dev (`docker compose` Postgres/Redis) cũng dùng cổng 5432/6379 nội bộ nhưng cụm prod không mở cổng DB ra ngoài nên chạy song song được; chỉ cổng 80/443 phải trống.

### T5: Đo đăng nhập dồn qua Caddy *(hoãn tới khi có VPS)*
**Mô tả:** Bài đo cũ ký JWT trực tiếp, không đi qua đăng nhập và Caddy. Cần kiểm chứng trên tên miền thật rằng sửa lỗi `trust proxy` có tác dụng: mỗi máy bị giới hạn riêng, không còn chung một giới hạn cho cả hệ thống.
**Tiêu chí đạt:**
- [ ] Máy A đăng nhập sai 11 lần thì nhận 429. Ngay sau đó máy B (mạng khác, vd. 4G) vẫn đăng nhập được
- [ ] Log backend ghi IP thật của từng máy, không phải IP container Caddy
**Kiểm chứng:**
- [ ] Tạm bỏ `TRUST_PROXY` rồi lặp lại: máy B cũng bị 429. Bằng chứng là phép thử thực sự bắt được lỗi
**Phụ thuộc:** VPS có IP công khai (Docker Desktop trên Windows NAT mọi kết nối vào nên backend chỉ thấy IP gateway, không đo được trên máy cá nhân)
**File:** `docs/hieu-nang.md` (ghi kết quả)
**Cỡ:** XS
**Lưu ý:** Caddy mặc định không tin `X-Forwarded-For` do client tự gửi, nên một máy không giả được 300 IP. Phải thử bằng máy hoặc mạng thật khác nhau. Giới hạn 10 lần/phút của cả phòng thi chung NAT vẫn là rủi ro đã biết (ADR-004).

### T6: Bật AI thật và gắn v1.0
**Mô tả:** Người dùng tự đặt `ANTHROPIC_API_KEY` vào `.env.prod` (không dán key vào chat, không commit). Chạy thật mỗi tính năng ít nhất 3 lần, đánh giá chất lượng và chi phí. Trước buổi demo: sinh sẵn một bộ câu hỏi và cache giải thích để demo không phụ thuộc hoàn toàn vào mạng.
**Tiêu chí đạt:**
- [ ] Sinh 10 câu từ một bài học. Giảng viên duyệt và ghi tỉ lệ câu dùng được
- [ ] Giải thích đáp án và gợi ý ôn trả `source: "AI"`. Số token trong bảng `ai_usages` được tổng hợp vào docs
- [ ] Tag `v1.0` gắn trên commit đang chạy trong cụm production
**Kiểm chứng:**
- [ ] Đặt key sai thì 3 tính năng tự xuống phương án dự phòng, không lỗi 500
**Phụ thuộc:** T4, người dùng có API key
**File:** `docs/hieu-nang.md` (hoặc mục AI trong README)
**Cỡ:** S

### T7: Diễn tập rollback và khôi phục sao lưu
**Mô tả:** Thử thật mục 5–6 của runbook. Bây giờ đã có tag `v1.0` chứa Dockerfile.
**Tiêu chí đạt:**
- [ ] Cập nhật lên một commit thử, rollback về `v1.0` trong dưới 5 phút, health trả ok
- [ ] Khôi phục từ file sao lưu vào máy và DB mới, số dòng các bảng chính khớp với bản gốc
**Kiểm chứng:**
- [ ] Ghi thời gian thực tế và các bước bị sai vào `docs/trien-khai.md`
**Phụ thuộc:** T6
**File:** `docs/trien-khai.md`
**Cỡ:** XS

### Checkpoint B
- [ ] Cụm production chạy trên máy cá nhân, AI thật đã kiểm, rollback và khôi phục đã thử
- [ ] Người dùng xem lại

## Giai đoạn C: Bàn giao và bảo vệ

### T8: Hướng dẫn sử dụng
**Mô tả:** Mỗi vai trò một mục ngắn có ảnh chụp màn hình: học viên (học, ôn, thi, khi mất mạng), giảng viên (khóa học, câu hỏi, import Excel, AI, kỳ thi), giám thị (bảng realtime, gia hạn, phân xử).
**Tiêu chí đạt:**
- [x] Có mục giám thị ghi rõ: **gia hạn trước khi hết giờ** khi thấy thí sinh offline, vì sau giờ hết hệ thống tự nộp trong ≤30 giây và không còn gia hạn được (mục 5 của review)
- [x] Mỗi luồng chính có ít nhất 1 ảnh (15 ảnh trong `docs/img/`)
**Kiểm chứng:**
- [ ] Một người chưa dùng hệ thống làm theo được luồng thi chính thức mà không cần hỏi
**Phụ thuộc:** T1 (làm song song với giai đoạn B được)
**File:** `docs/huong-dan.md`, `docs/img/*`
**Cỡ:** M

### T9: Kịch bản demo và dữ liệu demo
**Mô tả:** Kịch bản demo 10–15 phút, kèm dữ liệu không hết hạn. Kỳ thi mẫu từng hết hạn ngày 15/11.
**Tiêu chí đạt:**
- [x] Seed đặt giờ mở/đóng kỳ thi theo thời điểm chạy seed, và có lệnh làm mới dữ liệu demo (chạy lại seed tạo lại kỳ thi mẫu)
- [x] `docs/demo.md` liệt kê từng bước, tài khoản dùng, điều cần chỉ ra (mất mạng, F5, đổi tab, giám thị, AI dự phòng)
**Kiểm chứng:**
- [ ] Chạy trọn kịch bản 2 lần trên máy cá nhân (một lần dựng lại từ đầu bằng lệnh trong `docs/demo.md`), có bấm giờ. Đã chạy tự động 1 lần (puppeteer) qua mọi bước, còn người dùng chạy tay có bấm giờ
**Phụ thuộc:** T4
**File:** `backend/prisma/seed.ts`, `docs/demo.md`
**Cỡ:** S

### T10a: Báo cáo: dàn ý, Mở đầu, Ch.1 Tổng quan, Ch.2 Công nghệ
**Mô tả:** Chưa có mẫu của trường, nên viết Markdown trong `docs/bao-cao/` theo cấu trúc đồ án CNPM thông dụng; khi có mẫu thì chuyển sang .docx (skill `docx`). Ch.1: bài toán, mục tiêu, phạm vi (lấy từ `docs/dac-ta.md`). Ch.2: React, NestJS, PostgreSQL/Prisma, Redis/BullMQ, Socket.IO, Claude API, Docker/Caddy và lý do chọn (lấy từ ADR).
**Tiêu chí đạt:**
- [ ] `docs/bao-cao/00-dan-y.md` có dàn ý 5 chương được người dùng duyệt
- [ ] Mở đầu, Ch.1, Ch.2 viết xong, mọi lựa chọn công nghệ có lý do
**Kiểm chứng:**
- [ ] Người dùng đọc duyệt
**Phụ thuộc:** T1
**Cỡ:** M

### T10b: Báo cáo: Ch.3 Phân tích và thiết kế
**Mô tả:** Tác nhân, use case, đặc tả FR/NFR, kiến trúc, ERD, thiết kế luồng thi (đóng băng đề, đồng bộ offline, hàng đợi chấm, giám thị realtime), thiết kế AI có dự phòng. Sơ đồ Mermaid lấy từ `docs/erd.md`, `docs/kien-truc.md`.
**Tiêu chí đạt:**
- [ ] Mỗi FR có use case hoặc luồng tương ứng; có sơ đồ tuần tự cho thi chính thức và phục hồi sự cố
**Kiểm chứng:**
- [ ] Sơ đồ khớp code hiện tại (đối chiếu schema Prisma)
**Phụ thuộc:** T10a
**Cỡ:** M

### T10c: Báo cáo: Ch.4 Cài đặt và kiểm thử, Ch.5 Triển khai, Kết luận
**Mô tả:** Giao diện chính (ảnh từ T8), chiến lược test (40 unit + 80 e2e), kết quả đo tải 300 thí sinh, kịch bản tắt server, rà soát bảo mật, kết quả AI thật (T6), triển khai và rollback (T4, T7). Kết luận: đạt được, giới hạn đã biết (rate limit 1 instance, `uuid` moderate, camera bị cắt, T5 chưa đo), hướng phát triển.
**Tiêu chí đạt:**
- [ ] Mỗi FR và NFR có cách kiểm chứng và kết quả thật
**Kiểm chứng:**
- [ ] Người dùng đọc duyệt; số liệu khớp `docs/hieu-nang.md`
**Phụ thuộc:** T10b, T6, T7, T8
**Cỡ:** M

### T11: Slide bảo vệ
**Mô tả:** 12–15 slide: bài toán, kiến trúc, 3 điểm khó (phục hồi sự cố, giám thị realtime, AI có dự phòng), số liệu đo tải, demo, giới hạn và hướng phát triển.
**Tiêu chí đạt:**
- [ ] Trình bày vừa thời gian quy định
**Kiểm chứng:**
- [ ] Người dùng tập nói thử một lần
**Phụ thuộc:** T10c
**Cỡ:** M

### T12: Video demo
**Mô tả:** Người dùng quay theo kịch bản T9. Dùng làm phương án dự phòng khi mạng ở phòng bảo vệ lỗi.
**Tiêu chí đạt:**
- [ ] Video dưới 10 phút, có đủ các điểm trong kịch bản
**Phụ thuộc:** T9
**Cỡ:** S (việc của người dùng)

### Checkpoint C
- [ ] Đủ báo cáo, slide, video; cụm demo dựng lại được từ đầu trên máy cá nhân
- [ ] Chạy thử demo trọn vẹn đúng giờ
