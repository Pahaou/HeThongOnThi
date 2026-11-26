# Kế hoạch: hoàn thiện, triển khai và bảo vệ đồ án HTON

Spec gốc: [docs/dac-ta.md](../docs/dac-ta.md). Danh sách việc: [tasks/todo.md](todo.md).

## Tổng quan
Code đã có đủ FR-01..FR-20 và NFR-01..06, đã gộp vào `main` (tag `v0.4`–`v0.6`). Phần còn lại không phải tính năng mới mà là **đưa hệ thống ra dùng thật và bảo vệ được**:
1. Gộp code, sửa nốt các lỗi nhỏ từ review, gắn mốc phiên bản.
2. Chạy cụm production (Docker + Caddy) trên **máy cá nhân** để demo; VPS để sau, nếu cần link online.
3. Bật AI thật bằng API key, diễn tập rollback và khôi phục sao lưu.
4. Tài liệu bàn giao, kịch bản demo, báo cáo, slide, video.

## Quyết định
- **Gộp trước, sửa sau.** Không xếp thêm PR lên #15 nữa. Gộp #11–#15 vào `main`, các sửa nhỏ đi trên một nhánh mới từ `main`.
- **Tag:** `v0.4` (merge #12, xong GĐ3), `v0.5` (#13, GĐ4), `v0.6` (#15, GĐ5–6 về code). `v1.0` gắn sau khi cụm production trên máy cá nhân chạy ổn kèm AI thật (T6). Đây cũng là tag đầu tiên có Dockerfile, nên rollback mới diễn tập được.
- **Mục 5 trong review (gia hạn khi thí sinh offline đến hết giờ):** không làm tính năng mở lại bài đã nộp. Chỉ ghi vào hướng dẫn giám thị (Task 8). Tính năng này đụng tới luồng chấm và hàng đợi, rủi ro cao so với lợi ích.
- **Demo trên máy cá nhân trước** (theo trả lời của người dùng). Cụm production dùng nguyên `docker-compose.prod.yml` với `DOMAIN=localhost` (Caddy cấp chứng chỉ nội bộ), cùng cấu hình sẽ dùng trên VPS.
- **Kiểm chứng `trust proxy` từ nhiều máy (T5) hoãn tới khi có VPS:** Docker Desktop trên Windows NAT mọi kết nối vào, backend chỉ thấy IP gateway nên trên máy cá nhân không đo được. Logic đã có e2e test che.
- **API key do người dùng tự đặt** vào `.env.prod` / `backend/.env`; không dán key vào chat, không commit.
- **Báo cáo chưa có mẫu:** viết nội dung bằng Markdown theo cấu trúc đồ án CNPM thông dụng trong `docs/bao-cao/`, khi có mẫu thì chuyển sang .docx (skill `docx`). Nội dung không phụ thuộc định dạng nên không phải chờ.

## Lịch (bảo vệ tháng 12, chưa rõ ngày)
| Thời gian | Việc |
|---|---|
| 18–21/11 | Giai đoạn A (T2, T3) + B trên máy cá nhân (T4, T6, T7) |
| 22–30/11 | T8 hướng dẫn, T9 demo, T10 báo cáo |
| 1–7/12 | T11 slide, T12 video, tập demo |
| Sau 7/12 | Đệm; T5 + VPS nếu trường yêu cầu link online |

## Đồ thị phụ thuộc
```
T1 gộp PR + tag ──┬── T2 sửa lỗi kiểu test + CI typecheck
                  └── T3 dọn mục 6–7 review
                          │
                          │
                  T4 cụm prod trên máy ── T6 AI thật + gắn v1.0      (T5 chờ VPS)
                                                                    │
                                                    T7 diễn tập rollback + khôi phục
                                                                    │
                  T8 hướng dẫn sử dụng ── T9 kịch bản + dữ liệu demo ── T10 báo cáo ── T11 slide ── T12 video
```
T8 có thể làm song song từ sau T1. T10 và T11 dùng số liệu của T6–T7.

## Danh sách việc
Chi tiết, tiêu chí đạt và cách kiểm chứng nằm trong [todo.md](todo.md).

### Giai đoạn A: Ổn định code
- [x] T1: Gộp #11 → #15, gắn tag v0.4–v0.6 (người dùng duyệt)
- [x] T2: Sửa lỗi kiểu ở `exams.e2e-spec.ts`, thêm bước typecheck test vào CI
- [x] T3: Dọn mục 6–7 review: bỏ truy vấn lặp ở gợi ý ôn, dọn `lastEmit` khi nộp bài
- **Checkpoint A:** CI xanh trên `main`, 40 unit + 80 e2e test qua

### Giai đoạn B: Triển khai (máy cá nhân trước)
- [ ] T4: Chạy cụm production trên máy cá nhân theo `docs/trien-khai.md`, qua checklist mục 3
- [ ] T5: *(hoãn tới khi có VPS)* Kiểm chứng giới hạn đăng nhập tính riêng từng máy khi đi qua Caddy
- [ ] T6: Bật `ANTHROPIC_API_KEY`, chạy thật 3 tính năng AI, ghi chi phí; gắn `v1.0`
- [ ] T7: Diễn tập rollback (về `v1.0`) và khôi phục từ bản sao lưu
- **Checkpoint B:** cụm production chạy trên máy cá nhân (HTTPS nội bộ), AI thật đã kiểm, rollback và khôi phục đã thử

### Giai đoạn C: Bàn giao và bảo vệ
- [ ] T8: Hướng dẫn sử dụng cho học viên, giảng viên, giám thị
- [ ] T9: Kịch bản demo và dữ liệu demo không hết hạn
- [ ] T10a: Báo cáo: dàn ý + Mở đầu, Ch.1 Tổng quan, Ch.2 Công nghệ
- [ ] T10b: Báo cáo: Ch.3 Phân tích và thiết kế
- [ ] T10c: Báo cáo: Ch.4 Cài đặt và kiểm thử, Ch.5 Triển khai, Kết luận
- [ ] T11: Slide bảo vệ
- [ ] T12: Video demo (người dùng quay)
- **Checkpoint C:** đủ hồ sơ nộp, chạy thử demo trọn vẹn một lần theo kịch bản trên máy cá nhân

## Rủi ro
| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Máy cá nhân hỏng/Docker lỗi đúng hôm bảo vệ | Cao | Video dự phòng (T12); ghi lệnh dựng lại từ đầu trong `docs/demo.md`, thử trước 1 ngày |
| Trường yêu cầu link online | TB | Runbook VPS đã sẵn (`docs/trien-khai.md`), cần ~1 giờ + T5 |
| Mẫu báo cáo đến muộn, khác cấu trúc dự kiến | TB | Viết theo chương độc lập, chỉ cần sắp xếp lại khi có mẫu |
| Câu hỏi do AI sinh kém chất lượng, hoặc tốn tiền hơn dự kiến | TB | Giảng viên duyệt trước khi dùng (đã có). Giới hạn lượt/ngày (đã có). Đo token ở T6 |
| Mạng/API AI lỗi lúc demo | TB | Chính là lúc trình bày phương án dự phòng (NFR-06); sinh sẵn câu hỏi + cache giải thích trước buổi demo |
| Dữ liệu demo hết hạn đúng hôm bảo vệ (đã xảy ra 15/11) | TB | T9: seed đặt giờ thi theo thời điểm chạy seed, kèm lệnh làm mới |
| Rate limit trong bộ nhớ chỉ đúng với 1 instance | Thấp | Ghi trong báo cáo là giới hạn đã biết. Quy mô đồ án chỉ cần 1 instance |
| Mạng phòng bảo vệ chập chờn lúc demo | TB | Có video dự phòng (T12) và cụm chạy trên máy |

## Câu hỏi đã trả lời (18/11)
1. VPS/tên miền: **demo bằng máy cá nhân trước**.
2. Ngày bảo vệ: **tháng 12** (chưa rõ ngày; báo khi biết để chỉnh lịch).
3. Mẫu báo cáo: **chưa có**.
4. AI khi demo: **dùng API key thật**.
