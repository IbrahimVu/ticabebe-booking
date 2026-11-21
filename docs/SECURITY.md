# Bảo mật TiCaBeBe

Báo cáo rà soát sâu gần nhất: [21/11/2026](SECURITY-REVIEW-2026-11-21.md), gồm phạm vi kiểm chứng, phát hiện đã sửa và các rủi ro còn lại. Không coi kết quả test là bảo đảm an toàn tuyệt đối.

Người dùng đã chọn **HTTPS/TLS + siết bảo mật**. Đăng nhập dùng Supabase Auth chuẩn: gửi email/mật khẩu trong POST body qua HTTPS. TLS mã hóa trên đường truyền; Network trong chính trình duyệt vẫn hiển thị JSON trước khi mã hóa. Không thêm Base64, hash phía client hoặc khóa AES đặt trong frontend để tạo cảm giác giấu mật khẩu. Supabase lưu mật khẩu bằng bcrypt có salt; mã ứng dụng không lưu mật khẩu.

## Bảo vệ trong mã nguồn

- `public/security.mjs` chỉ cho request API đến đúng `https://ulhipapekijwwhylsafq.supabase.co`, chặn HTTP và URL/đường dẫn lạ. Trang production phải mở bằng HTTPS; localhost HTTP được phép để phát triển.
- Fetch dùng `cache: no-store`, `redirect: error`, `credentials: omit`, `referrerPolicy: no-referrer`. Email và mật khẩu không được gắn vào URL. Refresh token cũng chỉ gửi qua HTTPS đến đúng project.
- CSP trong `public/index.html` chỉ cho script cùng origin và kết nối đúng Supabase. Script inline không được phép; không cho form tự submit khi JavaScript lỗi, không cho nhúng object/frame hoặc thay base URL. CSS inline được giữ để tương thích giao diện hiện tại. Font chỉ dùng Google Fonts. Referrer bị tắt.
- Chỉ lưu access token, refresh token và hạn dùng trong `sessionStorage` của tab, không lưu response người dùng, email hay mật khẩu vào phiên. Ô mật khẩu được xóa sau khi gửi. Sau 30 phút không tương tác, xóa phiên và đăng xuất giao diện. Phiên cũ không đúng định dạng mới bị xóa.
- Mỗi lần đổi/kết thúc phiên tăng số phiên nội bộ. Phản hồi API và refresh thuộc phiên cũ bị bỏ qua, kể cả khi một tài khoản khác đã đăng nhập. Đăng xuất xóa giao diện/lịch trong bộ nhớ ngay, rồi cố gắng thu hồi phiên Supabase với `scope=local`. Refresh không kéo dài hạn idle; kiểm tra idle cả khi quay lại tab và trước/sau request. Kết quả đăng nhập bị bỏ qua nếu người dùng đã rời biểu mẫu.
- Giao diện và request ứng dụng bị chặn trong iframe để giảm nguy cơ thao tác qua khung nhúng. Đây là kiểm tra JavaScript phía ứng dụng, không thay thế header `frame-ancestors` do máy chủ cấp.
- Bảng lịch hẹn và danh sách admin nằm trong schema `booking_private`, không mở qua Data API; cả `anon` và `authenticated` đều không có quyền đọc trực tiếp. RLS vẫn được giữ. Admin đọc lịch qua `admin_appointments` và chọn giờ sửa qua `admin_availability`; cả hai kiểm tra `require_admin()` và giới hạn phạm vi truy vấn.
- API đặt lịch chỉ trả mã lịch, giờ bắt đầu và kết thúc. Tên/số điện thoại trên xác nhận lấy từ chính biểu mẫu vừa gửi. API công khai xem giờ bận chỉ trả thời gian, không có mã lịch hay thông tin khách; biết mã lịch không cấp quyền tra cứu. Lỗi dữ liệu đầu vào/trùng lịch không trả chi tiết bản ghi khách.
- SQL dùng tham số, không ghép câu lệnh từ dữ liệu khách. Nội dung tên/số điện thoại được escape trước khi hiển thị HTML. Ràng buộc PostgreSQL chặn trùng lịch ngay tại DB.
- Git dùng Git Credential Manager trên máy. Không đưa credential Git, mật khẩu Supabase, service-role key hoặc secret key vào repository. Publishable key là cấu hình công khai; email admin đã được chủ tài khoản đồng ý công khai để ánh xạ ID `admin`.

## Cấu hình Supabase đang chạy

Tạo tài khoản qua popup Nhân sự cần Edge Function `staff-create` và migration `20261121_03_admin_account_creation.sql`. Chỉ admin gọi được; function xác minh token với Auth, kiểm tra role tại DB, và trigger kiểm tra lại quyền trong transaction tạo tài khoản. Mật khẩu không được lưu trong bảng ứng dụng hoặc metadata. Secret chỉ đọc từ môi trường Edge, không có trong frontend. Xem `docs/ADMIN-ACCOUNTS.md`; phần backend chỉ có hiệu lực khi đã deploy và chạy SQL, không tự triển khai khi push Pages.

Ngày 14/11/2026 đã tắt **Allow new users to sign up** và xác minh API Auth trả `disable_signup: true`. Tài khoản admin đã tạo vẫn đăng nhập bình thường. Khách đặt lịch qua anonymous database RPC, không cần tạo tài khoản. Anonymous sign-ins và manual linking vẫn tắt; xác nhận email vẫn bật. Quyền đọc bảng lịch bằng publishable key đã được kiểm tra trả HTTP 401.

## Phạm vi và giới hạn

Khi áp dụng migration nhân sự `20261121_01_team_services.sql`, quyền đọc/sửa lịch mở rộng cho quản lý toàn tiệm và thợ trên lịch của chính họ, theo lựa chọn của chủ tiệm. `studio_profile` kiểm tra nhân sự còn hoạt động tại mỗi RPC; `studio_edit` và `studio_appointments` lọc/kiểm tra chủ lịch ở database. Chỉ admin được cấp vai trò hoặc liên kết tài khoản. Catalog công khai không chứa email, ID đăng nhập hay thông tin khách. Xem `docs/TEAM-SERVICES.md` để cấu hình và triển khai.

Session token vẫn có thể được JavaScript cùng origin đọc; GitHub Pages thuần tĩnh không cấp cookie HttpOnly cho backend Supabase. CSP và escape giảm nguy cơ XSS, không phải cam kết không thể bị tấn công. Hết hạn khi idle xóa phiên trên tab; không hủy ngay mọi access token đã phát hành ở phía server. Mật khẩu, thiết bị và quyền tài khoản GitHub/Supabase vẫn cần được chủ tài khoản bảo vệ.

`frame-ancestors` và các security header tùy chỉnh không được bảo đảm bằng meta CSP; không tuyên bố đã chống clickjacking hoàn toàn. CAPTCHA/chống spam cho luồng đặt lịch công khai và MFA cho admin cần cấu hình riêng nếu triển khai thêm; chưa được bật bởi mã này.

Khi đổi project Supabase, cập nhật đồng bộ `public/config.js`, `public/security.mjs` và `connect-src` trong CSP. Khi thêm nguồn script/API khác, xem xét rõ quyền trước khi mở CSP.

## Xác minh

### Đợt rà soát 21/11/2026

- Đã tái hiện và bổ sung kiểm thử cho phản hồi chậm khi đăng xuất, đổi tài khoản, refresh sau đăng xuất, idle khi refresh, rời màn hình đăng nhập và tài khoản bị thu hồi quyền. `tests/session-ui-smoke.mjs` dùng API giả, không dùng dữ liệu khách thật.
- Migration `supabase/migrations/20261121_02_security_hardening.sql` gỡ quyền các RPC quản trị cũ trên phiên bản nhân sự, siết `is_admin` theo hồ sơ đang hoạt động, kiểm tra quyền lại sau khi lấy khóa cấu hình và không công khai giờ bận của nhân sự không còn nhận dịch vụ. Không xóa lịch hoặc tài khoản.
- Migration cũng bỏ quyền tạo đối tượng của client trên schema `public`, giữ bảng/hàm trong `booking_private` không truy cập trực tiếp. Quyền mặc định cho **hàm mới do `postgres` tạo** được thu hẹp toàn cục và theo schema; chỉ REVOKE theo schema không loại bỏ EXECUTE mặc định kế thừa từ PUBLIC. Hàm mới phải được GRANT tường minh. Vai trò tạo đối tượng khác cần được rà soát ACL riêng.
- `tests/security-permissions.test.mjs` kiểm tra quyền thực tế bằng các role, tài khoản admin bị khóa dù còn membership cũ, API dư thừa và ACL của bảng/hàm mới. Migration có thể chạy lại.
- Probe anonymous production ngày 21/11 xác nhận đăng ký công khai và anonymous sign-in vẫn tắt, API hồ sơ/quản lý/lịch và legacy-book bị từ chối, các bảng khách/nhân sự không được mở qua Data API. Quét mẫu khóa bí mật trong file Git đang theo dõi không phát hiện secret key, token GitHub hay private key; đây không phải kiểm tra mọi loại secret hoặc toàn bộ lịch sử Git.

**Triển khai:** frontend được cập nhật bằng script deploy. Phần siết quyền database chỉ có hiệu lực sau khi chạy migration `20261121_02_security_hardening.sql` bằng SQL Editor trên project đã có migration nhân sự. Không chạy lại schema khởi tạo. Kiểm thử cục bộ không chứng minh migration đã được áp dụng production; phải xác minh riêng sau khi chạy.

`tests/security.test.mjs` kiểm tra HTTP, sai origin, URL/đường dẫn lạ, fetch options và dữ liệu phiên tối thiểu. `tests/database.test.mjs` kiểm tra quyền và ràng buộc dữ liệu trên PostgreSQL nhúng. `tests/customer-privacy.test.mjs` kiểm tra nâng cấp giữ nguyên dữ liệu, chặn đọc trực tiếp và tài khoản không phải admin, response đặt lịch tối thiểu và lỗi không lộ thông tin. `tests/ui-smoke.mjs` kiểm tra luồng đăng nhập và hết hạn phiên. Kiểm tra production không tạo lịch thử trên dữ liệu thật.

Tài liệu: [Supabase securing API](https://supabase.com/docs/guides/api/securing-your-api), [Supabase sign-out](https://supabase.com/docs/guides/auth/signout), [PostgreSQL default privileges](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html), [Supabase password security](https://supabase.com/docs/guides/auth/password-security), [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP TLS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html).
