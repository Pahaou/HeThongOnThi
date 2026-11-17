# ADR-001: Đóng băng đề thi vào bài làm lúc thí sinh bắt đầu

## Trạng thái
Accepted

## Ngày
2026-11-08

## Bối cảnh
Ngân hàng câu hỏi được giảng viên sửa liên tục (sửa nội dung, đổi đáp án, lưu trữ câu). Kỳ thi chính thức kéo dài vài giờ và phải chấm lại được sau này. Mỗi thí sinh nhận một đề ngẫu nhiên theo ma trận.

## Quyết định
Khi thí sinh bấm bắt đầu, server sinh đề và chép toàn bộ nội dung câu hỏi, phương án (đã xáo) và đáp án đúng vào cột `attempt_questions.snapshot` (jsonb). Hiển thị và chấm điểm chỉ đọc từ snapshot. Ma trận đề cũng được chép từ đề thi thử sang `exam_rules` khi tạo kỳ thi.

## Phương án đã cân nhắc
- **Tham chiếu thẳng tới `questions`**: gọn hơn, nhưng sửa đáp án giữa giờ thi sẽ đổi kết quả chấm. Loại.
- **Phiên bản hóa câu hỏi (question_versions)**: đúng về lý thuyết nhưng thêm một bảng và logic cho mọi chỗ sửa câu hỏi. Quá nặng cho đồ án.

## Hệ quả
- Sửa ngân hàng giữa giờ thi không ảnh hưởng bài đang làm (có e2e test).
- Dung lượng tăng theo số câu × số thí sinh (vài KB mỗi bài), chấp nhận được.
- Báo cáo thống kê theo chủ đề của ôn tập vẫn đọc bảng `questions` (ôn tập không đóng băng).
