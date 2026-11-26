# Kịch bản demo (10–15 phút)

Chạy trên cụm production ở máy cá nhân ([trien-khai.md, mục 3b](trien-khai.md#3b-chạy-trên-máy-cá-nhân-windows--docker-desktop)), mở `https://localhost`. Các bước dưới đã chạy thử tự động ngày 26/11/2026.

## Tài khoản

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Học viên | `hv@hton.local` | `Hocvien@123` |
| Giảng viên | `gv@hton.local` | `Giangvien@123` |
| Quản trị | theo `ADMIN_EMAIL` trong `.env.prod` | theo `ADMIN_PASSWORD` |

## Chuẩn bị (trước buổi demo 10 phút)

1. Mở Docker Desktop, chạy cụm: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d`
2. Làm mới kỳ thi mẫu, mở từ 1 giờ trước tới 7 ngày sau. Bài làm cũ của kỳ thi này bị xóa, dữ liệu khác giữ nguyên:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend node dist-seed/prisma/seed.js
   ```
3. Kiểm tra `curl -k https://localhost/api/health` trả `{"status":"ok"}`.
4. Nếu dùng AI chạy trên máy (`AI_PROVIDER=ollama`): kiểm tra Ollama đang chạy (biểu tượng ở khay hệ thống, hoặc `curl http://localhost:11434/api/version`), rồi nạp model trước bằng `ollama run qwen2.5:3b "xin chào"`. Lần nạp đầu mất khoảng 40 giây; nạp trước để lúc demo AI trả lời trong 2–3 giây.
5. Mở 2 cửa sổ trình duyệt khác nhau (ví dụ Chrome thường và Chrome ẩn danh): một cho học viên, một cho giảng viên.
6. Muốn demo lại từ đầu hoàn toàn (học viên chưa ghi danh, chưa có lịch sử ôn): xem lệnh `down -v` ở mục 3b của runbook.

## Các bước

| # | Thời lượng | Vai trò | Làm gì | Điều cần chỉ ra |
|---|---|---|---|---|
| 1 | 1′ | Học viên | Đăng nhập, mở khóa "Nhập môn lập trình Web", bấm **Ghi danh miễn phí** | Danh mục khóa học, lộ trình |
| 2 | 1′ | Học viên | Học bài đầu, **Đánh dấu đã hoàn thành**, **Bài tiếp →** | Tiến độ học lưu theo bài |
| 3 | 2′ | Học viên | Vào **Ôn tập và thi thử**, **Bắt đầu ôn tập**, chọn đáp án, bấm **Kiểm tra** từng câu, **Kết thúc ôn tập** | Chấm ngay từng câu; nút **✦ AI giải thích** |
| 4 | 1′ | Học viên | Mở **Năng lực của tôi** và **Sổ tay câu sai**. Quay lại trang ôn tập, thấy **Ôn N câu theo điểm yếu** | Thống kê theo chủ đề, gợi ý ôn theo điểm yếu |
| 5 | 1′ | Giảng viên | **Soạn khóa học** → khóa → **Kỳ thi** → "Thi giữa kỳ (mẫu)" → **Màn giám thị** | Chấm xanh "Đang cập nhật trực tiếp" (WebSocket) |
| 6 | 1′ | Học viên | Menu **Kỳ thi** → **Vào thi**, xác nhận | Đề đóng băng lúc vào, đồng hồ do server giữ |
| 7 | 1′ | Học viên | Làm vài câu, nhấn **F5** | Các câu đã chọn vẫn còn; F5 **không** tính vi phạm (nhật ký ghi "Rời / tải lại trang") |
| 8 | 2′ | Học viên | DevTools (F12) → Network → **Offline**, chọn thêm vài câu, rồi bật lại **No throttling** | Bài vẫn làm được khi mất mạng; có mạng lại thì tự gửi bù |
| 9 | 1′ | Học viên | Chuyển sang tab/ứng dụng khác rồi quay lại | Cảnh báo trên màn hình thí sinh, màn giám thị tăng số vi phạm ngay |
| 10 | 1′ | Giảng viên | Trên màn giám thị đổi **Phân xử** sang "Nghi vấn"; ở trang chi tiết kỳ thi mở **Nhật ký** và **Gia hạn** | Nhật ký từng sự kiện; gia hạn khi thí sinh mất kết nối |
| 11 | 1′ | Học viên | **Nộp bài** | Chấm qua hàng đợi; điểm chỉ công bố khi kỳ thi đóng |
| 12 | 1′ | Giảng viên | **Ngân hàng câu hỏi** → **Nhập từ Excel** (có **file mẫu**) và **✦ Tạo bằng AI** | Câu do AI tạo vào trạng thái "Chờ duyệt (AI)", giảng viên duyệt mới dùng |

## Khi có sự cố trong lúc demo

- **Không có mạng hoặc API key:** các tính năng AI tự chuyển sang phương án dự phòng (giải thích của giảng viên kèm trích đoạn bài học, lời khuyên ôn soạn sẵn). Tạo câu hỏi bằng AI báo "Tính năng AI chưa được bật". Đây cũng là một điểm demo (ADR-005).
- **Kỳ thi báo đã đóng hoặc đã làm:** chạy lại lệnh seed ở bước Chuẩn bị 2.
- **Trình duyệt chặn vì chứng chỉ:** bấm "Nâng cao → Tiếp tục", hoặc cài chứng chỉ gốc Caddy (runbook mục 3b).

## Ghi chú cho người trình bày

- Đổi tab không phạt ngay. Số vi phạm chỉ là căn cứ, giảng viên phân xử ở cột **Phân xử**.
