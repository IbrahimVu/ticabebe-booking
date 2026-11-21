# Nhân sự và dịch vụ

## Triển khai

1. Xuất bản frontend mới trước. Khi database chưa nâng cấp, trang tiếp tục dùng luồng đặt lịch cũ.
2. Trong Supabase SQL Editor, chạy toàn bộ `supabase/migrations/20261121_01_team_services.sql` **một lần** trên database đã có bản bảo mật `booking_private`. Với dự án mới, chạy `supabase/schema.sql` trước rồi migration này. Không chạy lại schema khởi tạo trên dữ liệu đang dùng.
   Sau đó chạy `supabase/migrations/20261121_02_security_hardening.sql` để thu hẹp các API cũ và quyền mặc định. Migration bảo mật không thay đổi lịch/giá/tài khoản hiện có.
3. Đăng nhập admin hiện có. Mở **Quản lý → Nhân sự**, đổi tên hiển thị của admin và thêm người thực hiện. Admin/quản lý cũng nhận dịch vụ được nếu bật **Hiện cho khách chọn đặt lịch**.
4. Thêm dịch vụ trong tab **Dịch vụ**. Mỗi dịch vụ có thời lượng và thời gian nghỉ chung cho mọi người, bước 15 phút.
5. Trong **Giá theo người**, chọn người + dịch vụ, điền giá VNĐ và bật nhận dịch vụ. Không có giá thì khách không thấy lựa chọn đó; giá 0 được hiểu là miễn phí. Giá cắt tóc cũ không được tự đoán.
6. Admin bấm **Kích hoạt đặt lịch mới** khi cấu hình xong ít nhất một lựa chọn. Trước kích hoạt, khách vẫn đặt theo luồng cũ. Sau kích hoạt, khách chọn dịch vụ → người thực hiện → ngày/giờ, xem đúng giá trước xác nhận.

## Tài khoản và quyền

Admin tạo tài khoản đăng nhập bằng **Supabase → Authentication → Users → Add user** (email/mật khẩu), rồi trong giao diện **Nhân sự** nhập đúng email để liên kết và cấp vai trò. Không mở đăng ký công khai. Việc tạo/reset mật khẩu vẫn làm trong Supabase; không dùng service-role key trong website. Có thể thêm nhân sự chưa có email để nhận lịch mà chưa có quyền đăng nhập.

| Vai trò | Lịch hẹn | Dịch vụ, giá, giờ mở cửa | Tài khoản, vai trò |
| --- | --- | --- | --- |
| Admin | Xem/sửa/hủy toàn tiệm | Có | Có |
| Quản lý | Xem/sửa/hủy toàn tiệm | Có | Không |
| Thợ cắt tóc | Chỉ lịch của mình; được sửa/hủy và cập nhật trạng thái | Không | Không |

Đăng nhập bằng email tài khoản. ID `admin` cũ vẫn là bí danh của email trong cấu hình. Khóa nhân sự chặn quyền ở database ngay cả khi token cũ chưa hết hạn. Admin cuối cùng không thể bị hạ quyền/khóa. Thay đổi người đang dùng bằng tài khoản admin khác để tránh tự mất quyền quản lý.

## Dữ liệu và lịch

- Lịch cũ giữ nguyên mã, khách, giờ, trạng thái và được gán cho nhân sự admin đầu tiên. Giá lịch cũ hiển thị **Chưa đặt giá**; không tự áp giá mới lên quá khứ. Kiểm tra phân công cũ trước khi nhận lịch nhiều thợ.
- Cùng một người không thể nhận các lịch chồng lấn, bao gồm thời gian nghỉ. Hai người khác nhau nhận được cùng giờ. Ràng buộc GiST trong PostgreSQL kiểm tra cả ghi trực tiếp và yêu cầu đồng thời.
- Giá, tên dịch vụ/người thực hiện và thời lượng được chốt lúc đặt. Đổi bảng giá/thời lượng sau đó không sửa lịch cũ. Dời giờ giữ nguyên người thực hiện, giá và thời lượng đã chốt.
- Các trạng thái phục vụ: đã xác nhận, đang phục vụ, hoàn thành. Hủy vẫn giữ lịch sử. Hoàn thành vẫn giữ khoảng giờ đã chiếm; không tự giải phóng lịch quá sớm.
- Giờ mở cửa và ngày nghỉ đang dùng chung toàn tiệm. Mỗi lượt đặt một dịch vụ với một người; chưa có giỏ nhiều dịch vụ hay ca làm riêng từng người.
- Khi quản lý sửa giá sau khi khách đã chọn nhưng chưa gửi, server từ chối giá cũ để khách tải lại bảng giá và xác nhận lại. Frontend không quyết định giá hoặc quyền.
- Dữ liệu khách và danh sách tài khoản vẫn trong `booking_private`. API công khai chỉ trả danh mục dịch vụ/tên hiển thị/giá và các khoảng giờ bận; không trả email tài khoản hoặc danh sách khách.

## Kiểm thử

`tests/team-services.test.mjs` chạy migration trên PostgreSQL nhúng: giữ lịch cũ, quyền 3 vai trò, khóa tài khoản, chống truy cập chéo, giá riêng, thời lượng chung, chặn giá giả và lịch trùng. `tests/team-ui-smoke.mjs` kiểm tra đặt lịch, sửa lịch và quản lý trên mobile 320–768px bằng API giả (chạy local server trước). Các bài cũ tiếp tục kiểm tra chế độ chưa nâng cấp.
