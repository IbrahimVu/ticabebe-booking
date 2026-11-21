# Tạo tài khoản trong popup Nhân sự

## Triển khai một lần trên project hiện tại

Frontend được xuất bản bằng quy trình GitHub Pages sẵn có. Backend cần hai bước trên Supabase, theo đúng thứ tự:

1. Mở **SQL Editor → New query**, dán và chạy toàn bộ `supabase/migrations/20261121_03_admin_account_creation.sql`. Project phải có các migration team/services và security_hardening trước đó. Migration không sửa mật khẩu hay tài khoản đang có; có thể chạy lại.
2. Mở **Edge Functions → Deploy a new function → Via Editor**. Đặt tên chính xác **`staff-create`**. Thay nội dung `index.ts` bằng toàn bộ `supabase/functions/staff-create/index.ts`, rồi deploy. Trong cấu hình function, đặt **Verify JWT with legacy secret = OFF**, tương ứng `verify_jwt = false` trong `supabase/config.toml`. Function tự kiểm tra bearer token với Supabase Auth `/user` trên mọi POST và kiểm tra vai trò admin trong DB; không nhận yêu cầu anonymous.

Không sao chép secret/service-role key vào file. Function đọc biến môi trường backend Supabase có sẵn: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, hoặc fallback các biến legacy `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. Các giá trị không được gửi ra frontend hoặc ghi log. Nếu project đã vô hiệu các khóa legacy và không cung cấp nhóm khóa mới, cần cấu hình môi trường Edge phù hợp; không đưa khóa vào chat/repository.

Nếu máy đã được cấp quyền Supabase CLI, có thể deploy sau bước SQL bằng:

```sh
supabase functions deploy staff-create --project-ref ulhipapekijwwhylsafq
```

Config tracked chỉ chứa project ID và chế độ gateway. Không yêu cầu mở đăng ký công khai. Việc push GitHub Pages tự động **không** deploy Edge Function hay chạy SQL. Chưa có quy trình CI lưu credential Supabase.

## Sử dụng

Chỉ admin thấy tab **Nhân sự**. Khi thêm nhân sự mới, chọn:

- **Tạo tài khoản mới:** nhập tên, email, mật khẩu 8–128 ký tự, vai trò và trạng thái; bấm **Lưu nhân sự**. Email được admin xác nhận tự động; tài khoản có thể đăng nhập bằng email/mật khẩu ngay nếu nhân sự đang hoạt động.
- **Liên kết tài khoản đã có:** nhập email Supabase đã tồn tại; không có ô mật khẩu và không thay mật khẩu cũ.
- **Chưa cấp tài khoản:** thêm người nhận lịch mà không cấp quyền đăng nhập.

Khi sửa nhân sự hiện có, chỉ có liên kết/bỏ liên kết và đổi thông tin, không tạo đè hoặc đổi mật khẩu. Nếu email đã tồn tại, tạo mới trả `EMAIL_EXISTS` và yêu cầu chọn liên kết. Đổi/reset mật khẩu vẫn làm trong Supabase Auth; đây không phải chức năng của popup này.

## Cơ chế quyền và dữ liệu

- Backend không tin vai trò/email/actor ID do frontend tự khai để xác định người gọi. Token được kiểm tra bằng Auth `/user`, sau đó `studio_profile` phải trả role `admin` đang hoạt động.
- Trước khi tạo Auth user, backend kiểm tra `studio_account_creation_ready`. Nếu trigger chưa được triển khai, function từ chối và không tạo tài khoản rời rạc.
- Auth Admin API nhận mật khẩu qua HTTPS và metadata trong `app_metadata.ticabebe_staff` có actor ID lấy từ token đã xác minh. Trigger riêng xử lý metadata này trong cùng transaction tạo `auth.users`: lấy khóa cấu hình chung, kiểm tra actor vẫn là admin đang hoạt động rồi tạo hồ sơ/membership. Nếu bất kỳ bước nào lỗi, cả Auth user và hồ sơ mới được rollback. Không cần xóa bù tài khoản sau lỗi.
- Trigger không dùng `user_metadata` vì người dùng được phép sửa phần đó. Auth tạo thủ công không có marker vẫn hoạt động như trước và cần liên kết qua popup.
- Mật khẩu không được lưu trong bảng ứng dụng, app/user metadata, sessionStorage hay log ứng dụng. Ô mật khẩu được xóa ngay sau gửi, kể cả lỗi; cần nhập lại khi thử tiếp. Auth response/token/secret không trả ra ngoài; function chỉ trả `{created:true}` hoặc mã lỗi cố định.
- Frontend chỉ mở đúng `/functions/v1/staff-create` trên HTTPS origin Supabase đã pin. Tính năng dùng cơ chế mã hóa đường truyền TLS đã chọn, không thêm hash/encryption tự chế.
- Nếu request tạo bị ngắt mạng, kết quả có thể đã được ghi. Đóng/mở Nhân sự để kiểm tra trước khi thử lại; function không tự đổi mật khẩu hoặc gắn lại email có sẵn.

## Kiểm thử

`tests/staff-create.test.mjs`: kiểm tra Edge handler bằng Auth/DB API giả; khách/quản lý/thợ bị chặn, payload sai và backend thiếu không tạo user, lỗi không lộ password/secret. `tests/account-provisioning.test.mjs`: kiểm tra trigger trên PostgreSQL nhúng, rollback khi actor không còn quyền và không tin user_metadata. `tests/team-ui-smoke.mjs`: kiểm tra form tạo/liên kết, xóa ô mật khẩu khi request còn chờ, báo email trùng và tab chỉ có ở admin.

Tài liệu: [Edge Functions Dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Edge auth](https://supabase.com/docs/guides/functions/auth), [Auth admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
