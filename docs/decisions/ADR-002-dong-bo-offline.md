# ADR-002: Đồng bộ bài thi khi mất mạng bằng thời điểm chọn và 60 giây chờ đồng bộ

## Trạng thái
Accepted

## Ngày
2026-11-08

## Bối cảnh
Mục tiêu roadmap: rút mạng giữa giờ thi không mất bài. Client có thể gửi lựa chọn trễ, sai thứ tự, hoặc gửi lại bản cũ từ hàng đợi offline. Đồng hồ máy thí sinh không tin được.

## Quyết định
- Client lưu từng lựa chọn vào IndexedDB rồi gửi theo lô, mỗi câu kèm `clientSavedAt` (giờ server đã hiệu chỉnh ở client).
- Server chỉ ghi khi `clientSavedAt` mới hơn bản đang có (điều kiện nằm trong `WHERE` để an toàn khi request đồng thời); giờ client tương lai bị kẹp về giờ server.
- Sau hạn nộp, server còn nhận đồng bộ **60 giây** nhưng chỉ câu chọn **trước hạn** (trễ tối đa 5 giây); quá 60 giây thì tự nộp.
- Mỗi lượt thi chỉ một phiên (tab/thiết bị) được ghi; phiên mới giành quyền, phiên cũ nhận 409 `SESSION_REPLACED`.

## Phương án đã cân nhắc
- **Ghi đè theo thứ tự request đến**: request cũ đến sau sẽ đè lựa chọn mới. Loại.
- **Không nhận gì sau hạn**: thí sinh rớt mạng sát giờ mất bài dù chọn đúng giờ. Loại.
- **Tin hoàn toàn `clientSavedAt`**: người sửa giờ máy làm thêm vô hạn. Loại; giới hạn ở 60 giây là thỏa hiệp có chủ đích.

## Hệ quả
- Kiểm chứng trên trình duyệt thật: offline chọn 2 câu, F5 khi có mạng, server nhận đủ.
- Rủi ro còn lại: người cố tình sửa giờ máy lợi tối đa 60 giây.
