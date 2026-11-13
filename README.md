# TiCaBeBe — Đặt lịch cắt tóc

Giao diện mobile cho khách đặt lịch và quản trị viên quản lý ngày/tuần/tháng.

Mặc định 45 phút cắt + 15 phút nghỉ; các giờ bắt đầu cách nhau 15 phút. Supabase kiểm tra chống trùng lịch tại cơ sở dữ liệu.

## Sử dụng

- Trang đặt lịch: mở đường dẫn GitHub Pages của repository.
- Trang quản trị: thêm `#admin` vào cuối đường dẫn.
- Tài khoản admin do chủ tiệm tạo riêng trong Supabase Authentication và cấp quyền qua bảng `admin_users`. Mật khẩu không nằm trong mã nguồn. Cấu hình email hoặc ID ở `config.js`.
- `schema.sql` là mã khởi tạo backend trên project Supabase mới. Project đang kết nối đã được khởi tạo; không chạy lại file này.
- Khóa trong `config.js` là publishable key dùng trên trình duyệt. Dữ liệu cá nhân được bảo vệ bằng Row Level Security và quyền quản trị.
