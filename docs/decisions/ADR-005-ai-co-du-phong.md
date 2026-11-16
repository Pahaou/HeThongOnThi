# ADR-005: Tính năng AI qua Claude API, luôn có phương án dự phòng

## Trạng thái
Accepted

## Ngày
2026-11-16

## Bối cảnh
Roadmap giai đoạn 4: đúng 3 tính năng AI, có giới hạn số lần gọi, xử lý lỗi và timeout, luôn có phương án dự phòng khi AI không phản hồi. CI không được gọi API thật.

## Quyết định
- Mọi lời gọi đi qua interface `AiClient` (`src/ai/ai-client.ts`), cài đặt bằng `@anthropic-ai/sdk`, model `claude-opus-5-5`. Test thay bằng bản giả qua token `AI_CLIENT`.
- Sinh câu hỏi dùng structured output (Zod); giải thích/lời khuyên bật fallback phía server khi bị từ chối.
- Mọi lỗi API/mạng/hết giờ/từ chối quy về `AiUnavailableError`; tầng nghiệp vụ chọn dự phòng: giải thích của giảng viên + trích đoạn bài học; lời khuyên soạn sẵn; sinh câu hỏi trả 503 có hướng dẫn soạn tay.
- Việc chọn câu ôn theo điểm yếu là thuật toán, không phụ thuộc AI.
- Câu AI sinh lưu `DRAFT`, giảng viên duyệt mới `ACTIVE`.
- Giới hạn lượt/24 giờ + 10 lần/phút; ghi `ai_usages` kèm token; cache giải thích theo câu hỏi.

## Phương án đã cân nhắc
- **Gọi AI trực tiếp trong service**: không test được nếu không tốn tiền, khó thay nhà cung cấp. Loại.
- **Hàng đợi cho sinh câu hỏi**: hợp lý khi tài liệu lớn, nhưng thêm độ phức tạp cho giao diện chờ; để sau nếu cần.

## Hệ quả
- Không có `ANTHROPIC_API_KEY` thì hệ thống vẫn chạy đủ, AI hiển thị là dự phòng (đã kiểm chứng).
- Chưa gọi Claude thật trong quá trình phát triển (máy chưa có khóa API); chất lượng câu hỏi AI cần giảng viên kiểm khi bật.
