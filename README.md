# TiCaBeBe — Đặt lịch cắt tóc

Giao diện mobile cho khách đặt lịch và quản trị viên quản lý ngày/tuần/tháng.

Mặc định 45 phút cắt + 15 phút nghỉ; các giờ bắt đầu cách nhau 15 phút. Supabase kiểm tra chống trùng lịch tại cơ sở dữ liệu.

## Sử dụng

- Trang đặt lịch: mở đường dẫn GitHub Pages của repository.
- Trang quản trị: thêm `#admin` vào cuối đường dẫn.
- Tài khoản admin do chủ tiệm tạo riêng trong Supabase Authentication và cấp quyền qua bảng `admin_users`. Mật khẩu không nằm trong mã nguồn. Cấu hình email hoặc ID ở `config.js`.
- `schema.sql` là mã khởi tạo backend trên project Supabase mới. Project đang kết nối đã được khởi tạo; không chạy lại file này.
- Khóa trong `config.js` là publishable key dùng trên trình duyệt. Dữ liệu cá nhân được bảo vệ bằng Row Level Security và quyền quản trị.

## Cập nhật từ ChatGPT/Codex

Mã nguồn đầy đủ đã được gắn với repository này bằng Git. Chỉnh giao diện trong `public/`, sau đó chạy:

```sh
node scripts/deploy.mjs "Mô tả thay đổi"
```

Lệnh trên tải trạng thái remote, kiểm tra lịch sử, chạy kiểm thử, đồng bộ file xuất bản, commit và push lên `main`. GitHub Pages tự dựng lại website sau mỗi push. Không cần upload file bằng trình duyệt. Nếu Git báo xung đột hoặc thiếu xác thực, dừng để xử lý thay vì ghi đè lịch sử.

Bạn có thể yêu cầu trong dự án này: **“Sửa ... rồi kiểm tra và cập nhật website.”** Kết nối Git được xác thực qua Git Credential Manager trên máy; không lưu token hoặc mật khẩu trong repository.

Các file giao diện ở thư mục gốc là bản sinh từ `public/`. Kiểm tra bằng `node scripts/sync-pages.mjs --check`; không sửa trực tiếp các bản sinh. Bản HTML xem thử và thư mục `publish/` không được đưa vào Git.

Tài liệu tạo Supabase và xem thử nằm trong [docs/SETUP.md](docs/SETUP.md). Workflow trong repository kiểm thử mã nguồn; việc xuất bản dùng workflow Pages có sẵn của GitHub.

## Hosting

Repository chứa các file giao diện ở thư mục gốc. GitHub Pages dùng nhánh `main`, thư mục `/(root)`.
