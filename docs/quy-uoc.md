# Quy ước nhánh và commit

## Nhánh
- `main`: luôn chạy được. Xong mỗi giai đoạn thì gắn tag (`v0.1`, `v0.2`, ...).
- `feat/<ten-ngan>`, `fix/<ten-ngan>`, `docs/<ten-ngan>`, `test/<ten-ngan>`: tách từ `main`, merge lại qua PR (CI phải xanh).

## Commit (Conventional Commits)
```
<type>(<scope>): <mô tả ngắn>
```
- `type`: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`
- `scope`: `auth`, `course`, `question`, `practice`, `exam`, `proctor`, `ai`, `infra`, `fe`
- Ví dụ: `feat(exam): autosave bài làm mỗi 10 giây`, `fix(auth): refresh token hết hạn không đăng xuất`

## Tag theo giai đoạn
| Tag | Giai đoạn |
|-----|-----------|
| v0.1 | 0. Chuẩn bị |
| v0.2 | 1. Nền tảng và học tập |
| v0.3 | 2. Ngân hàng câu hỏi và ôn tập |
| v0.4 | 3. Thi chính thức và phục hồi sự cố |
| v0.5 | 4. AI |
| v0.6 | 5. Kiểm thử, hiệu năng, bảo mật |
| v1.0 | 6. Triển khai |
