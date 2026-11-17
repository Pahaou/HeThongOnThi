# Rà soát bảo mật (giai đoạn 5)

| Hạng mục | Cách làm | Kiểm chứng |
|---|---|---|
| Xác thực | JWT 15 phút giữ trong bộ nhớ; refresh token ngẫu nhiên trong cookie `httpOnly`, `SameSite=Strict`, `Path=/api/auth`, DB chỉ lưu SHA-256; xoay vòng, dùng lại token cũ thì thu hồi cả chuỗi | e2e auth |
| Token giả mạo | Sửa payload hoặc `alg: none` bị từ chối | e2e security |
| Phân quyền | Mọi API mặc định cần đăng nhập; `@Roles` theo vai trò; kiểm tra sở hữu khóa học ở từng thao tác | e2e security (14 API quản lý, học viên đều nhận 403) và e2e từng module |
| Không lộ đáp án | Ôn tập: đáp án chỉ gửi khi câu đã chấm; thi thử: sau khi nộp; thi chính thức: không bao giờ gửi, đề đóng băng ở server | e2e kiểm tra JSON không có `isCorrect` |
| Rate limit | Theo người dùng, theo IP khi chưa đăng nhập ([ADR-004](decisions/ADR-004-rate-limit-theo-nguoi-dung.md)): 300/phút chung; đăng nhập/đăng ký 10/phút; AI 10/phút cộng giới hạn lượt/ngày | e2e security |
| Header bảo mật | `helmet` (nosniff, `X-Frame-Options: SAMEORIGIN`, ẩn `X-Powered-By`...) | e2e security |
| Dữ liệu vào | `ValidationPipe` whitelist + forbidNonWhitelisted; UUID kiểm ở route; giới hạn kích thước và đuôi file (tài liệu 20 MB, Excel 5 MB, tài liệu AI 10 MB) | e2e từng module |
| SQL injection | Prisma; câu SQL thô dùng tagged template (tham số hóa) | đọc code |
| File tải lên | Tên lưu ngẫu nhiên, không phục vụ tĩnh, tải qua API có kiểm quyền | e2e courses |
| Thi cử | Server giữ giờ; một phiên ghi mỗi lượt; giờ client bị kẹp; nộp idempotent; nhật ký sự kiện và phân xử | e2e exams, integrity, proctor |
| AI | Tài liệu đưa vào được đánh dấu là dữ liệu (giảm prompt injection); câu AI sinh phải duyệt; khóa API chỉ ở server ([ADR-005](decisions/ADR-005-ai-co-du-phong.md)) | e2e ai |
| WebSocket | Xác thực JWT trong middleware handshake; chỉ giảng viên của khóa hoặc admin vào phòng kỳ thi | e2e proctor |

**Chưa làm:** giám sát camera (tùy chọn, cắt theo nguyên tắc ưu tiên của roadmap), xác thực hai lớp, quét lỗ hổng phụ thuộc tự động trong CI.
