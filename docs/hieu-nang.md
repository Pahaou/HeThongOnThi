# Hiệu năng và kịch bản sự cố (giai đoạn 5)

Đo ngày 16/11/2026 trên máy phát triển (Windows 11, Docker Desktop); Postgres 16, Redis 7 và backend chạy trong Docker. Công cụ: k6 0.55 ([backend/loadtest/exam.js](../backend/loadtest/exam.js)); đối chiếu dữ liệu: [backend/loadtest/verify.ts](../backend/loadtest/verify.ts). Cách chạy lại: [backend/loadtest/README.md](../backend/loadtest/README.md).

## Kịch bản tải
300 thí sinh cùng lúc vào một kỳ thi 6 câu: vào thi (sinh và đóng băng đề), lưu từng câu cách nhau 1-3 giây, rồi nộp gần như đồng thời. Đăng nhập không nằm trong phép đo (token ký sẵn).

## Trước và sau tối ưu

| Chỉ số | Trước | Sau |
|---|---|---|
| Thí sinh vào thi được | 269/300 (10,3% lỗi) | **300/300** |
| Request lỗi | 1,42% | **0%** |
| Lưu câu trả lời, p95 | 258 ms | **31 ms** |
| Nộp bài, p95 | 678 ms | **64 ms** |
| Vào thi, p95 | 2,45 s | 2,40 s |
| Câu đã lưu còn trong DB | không đối chiếu | **1800/1800** |
| Bài được chấm | không đối chiếu | **300/300**, xong ~0,1 s sau khi nộp |

"Trước" là backend chạy trực tiếp trên Windows, k6 trong Docker gọi ra; "sau" là backend trong cùng mạng Docker, cộng các điều chỉnh dưới đây. Hai lần đo khác cả môi trường lẫn mã, nên bảng không tách riêng tác dụng của từng điều chỉnh.

**Điều chỉnh:**
1. Chạy backend trong mạng Docker như khi triển khai. 31 lỗi ban đầu đều là `connection refused` ở lớp chuyển cổng của Docker Desktop khi mở 300 kết nối cùng lúc; tăng backlog và pool trên Windows vẫn còn 14 lỗi loại này.
2. Hàng đợi kết nối TCP 4096 (mặc định Node 511).
3. Pool kết nối Postgres 20 (mặc định của `pg` là 10), chỉnh bằng `DB_POOL_SIZE`. Riêng thay đổi này không làm giảm p95 vào thi.
4. Màn giám thị chỉ truy vấn khi có giám thị đang xem (trước đó mỗi lần vào thi/lưu bài tốn thêm 2 truy vấn).
5. Rate limit theo người dùng ([ADR-004](decisions/ADR-004-rate-limit-theo-nguoi-dung.md)).

**Còn lại:** vào thi là bước chậm nhất (p95 2,4 s khi 300 người vào cùng một thời điểm). Hướng cải thiện nếu cần: sinh sẵn đề khi công bố kỳ thi, hoặc cache kho câu hỏi theo kỳ thi.

## Kịch bản sự cố đã kiểm chứng

| Kịch bản | Cách kiểm chứng | Kết quả |
|---|---|---|
| Tắt server giữa kỳ thi | k6 300 thí sinh; `docker kill` backend ở giây thứ 7, bật lại; đối chiếu DB | Server trả lời lại sau 7 s. **1288/1288** câu server đã xác nhận còn đủ, **299/299** bài đã nộp đều được chấm. Request trong lúc tắt thất bại (k6 không gửi lại; client thật giữ trong IndexedDB rồi gửi bù) |
| Server tắt sau khi nhận nộp, trước khi chấm | e2e | Lượt quét 30 s xếp hàng lại và chấm đủ ([ADR-003](decisions/ADR-003-hang-doi-cham-diem.md)) |
| Rút mạng giữa giờ thi | Trình duyệt thật (Edge headless): offline chọn 2 câu, có mạng lại thì F5 ngay | Hiện "2 câu chờ gửi"; sau F5 trang và server đều có đủ 2 câu ([ADR-002](decisions/ADR-002-dong-bo-offline.md)) |
| Mất mạng sát giờ nộp | e2e: gửi bù 30 s sau hạn | Nhận câu chọn trước hạn, bỏ câu chọn sau hạn |
| Mở bài ở hai thiết bị | Trình duyệt thật + e2e | Tab cũ bị khóa ghi, ghi sự kiện đổi máy cho giám thị |
| Nộp lặp / đồng thời | e2e | Chấm đúng một lần |
| Giảng viên sửa đáp án giữa giờ thi | e2e | Vẫn chấm theo đề đã đóng băng ([ADR-001](decisions/ADR-001-dong-bang-de-thi.md)) |
| Gia hạn đồng thời | e2e | Cộng đủ cả hai lần |

## Kiểm thử tự động
- Unit test 40: chấm điểm, tính giờ, sinh đề theo ma trận, đọc Excel, mức năng lực, chọn câu theo điểm yếu.
- e2e 79 trên Postgres và Redis thật, chạy trong CI ở mỗi PR.
