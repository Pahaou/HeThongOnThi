# ADR-004: Rate limit theo người dùng thay vì theo IP

## Trạng thái
Accepted

## Ngày
2026-11-16

## Bối cảnh
Phòng thi thường dùng chung một IP công khai (NAT). Giới hạn mặc định của `@nestjs/throttler` tính theo IP, nên 300 thí sinh sẽ chia nhau 300 request/phút và bị chặn oan.

## Quyết định
`UserThrottlerGuard` tính theo `user:<id>` khi đã đăng nhập, theo `ip:<ip>` khi chưa. Guard chạy **sau** `JwtAuthGuard` để `req.user` đã có. Giữ giới hạn 10/phút cho đăng nhập/đăng ký (theo IP) và cho nhóm API AI (theo người dùng).

## Phương án đã cân nhắc
- **Nâng giới hạn theo IP lên rất cao**: mất tác dụng chống dò mật khẩu và chống lạm dụng. Loại.

## Hệ quả
- Có e2e test: hai học viên cùng IP không chặn nhau.
- Đăng nhập vẫn tính theo IP, nên cả phòng thi đăng nhập dồn trong 1 phút có thể chạm giới hạn 10 lần/phút; nếu tổ chức thi tập trung, cần nâng giới hạn này (`AUTH_THROTTLE` trong `auth.controller.ts`).

## Cập nhật 2026-11-26
Đăng nhập và đăng ký đổi sang đếm theo **IP + email** (10 lần/phút). Lý do: rà soát cho thấy với cách đếm theo IP, phòng thi 40 người chung NAT chỉ 10 người đăng nhập được trong phút đầu. Dò mật khẩu một tài khoản vẫn bị chặn ở lần thứ 11. Đổi lại, thử một mật khẩu trên nhiều email từ cùng IP không còn bị giới hạn ở route này (ghi `shortcut:` trong `auth.controller.ts`). Có e2e test cho cả hai trường hợp.
