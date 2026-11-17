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
