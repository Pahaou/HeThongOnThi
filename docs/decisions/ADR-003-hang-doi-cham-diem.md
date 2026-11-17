# ADR-003: Chấm bài thi qua hàng đợi BullMQ (Redis) kèm lượt quét định kỳ

## Trạng thái
Accepted

## Ngày
2026-11-08

## Bối cảnh
Hàng trăm thí sinh nộp cùng lúc khi hết giờ. Server có thể tắt giữa lúc đã nhận nộp mà chưa chấm. Roadmap yêu cầu nộp bài idempotent và hàng đợi chấm điểm.

## Quyết định
- Nộp bài chỉ đổi trạng thái `IN_PROGRESS → SUBMITTED` (có điều kiện, nên idempotent) rồi xếp job `grade` vào BullMQ với `jobId` theo lượt thi.
- Job chấm đổi `SUBMITTED → GRADED` đúng một lần trong transaction.
- Job `sweep` mỗi 30 giây: tự nộp bài quá hạn và xếp hàng lại bài `SUBMITTED` quá 30 giây chưa chấm.
- Dùng `@nestjs/bullmq@11` (bản 12 chỉ có ESM, không chạy với NestJS 11) và `ioredis` (bullmq 6 để tùy chọn).

## Phương án đã cân nhắc
- **Chấm đồng bộ trong request nộp**: đơn giản nhưng đợt nộp đồng loạt làm request chậm và mất việc chấm nếu server tắt giữa chừng. Đây là cách làm ở PR #9, đã thay.
- **Cron trong tiến trình (setInterval)**: không bền khi chạy nhiều instance. Loại.

## Hệ quả
- Đo tải 300 thí sinh: nộp bài p95 64 ms, chấm xong cả 300 bài ~0,1 giây sau khi nộp.
- Tắt server giữa kỳ thi: mọi bài đã nộp đều được chấm sau khi bật lại.
- Backend cần Redis để chạy.
