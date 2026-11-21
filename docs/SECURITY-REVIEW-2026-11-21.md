# Rà soát an toàn thông tin TiCaBeBe — 21/11/2026

Phạm vi: mã frontend, các migration hiện có, Edge Function tạo tài khoản, kiểm thử PostgreSQL nhúng, kiểm thử trình duyệt với dữ liệu giả, các yêu cầu anonymous không làm thay đổi dữ liệu trên production, lịch sử Git và advisory dependency. Bản rà soát bắt đầu từ commit `7873320`; bản sửa và báo cáo được phát hành cùng nhau.

Đây là rà soát ứng dụng với phạm vi nêu trên, không phải chứng nhận bảo mật hoặc kiểm thử xâm nhập độc lập toàn bộ hạ tầng. Không dùng mật khẩu/token thật của admin, không tạo tài khoản/lịch thật, không đọc/in bản ghi khách production và không thực hiện thử tải/phá hoại.

## Phát hiện và xử lý

| Mục | Đánh giá | Kết quả |
| --- | --- | --- |
| Phản hồi đặt lịch cũ hiện lại thông tin sau khi chuyển màn hình | Trung bình trong tình huống dùng chung tab/thiết bị | Đã sửa: luồng cũ kiểm tra generation và biểu mẫu còn gắn với màn hình trước khi hiển thị receipt/lỗi. Kiểm thử cả phản hồi thành công và lỗi đến sau khi mở đăng nhập. |
| Khởi tạo giao diện quản trị/đặt lịch từ request cũ | Gia cố vòng đời giao diện | Đã bổ sung kiểm tra generation sau các lần chờ tải; phiên đã kết thúc không được dựng lại màn hình cũ. Các chốt sessionEpoch/refresh/idle trước đó tiếp tục được kiểm tra. |
| Đọc/sửa lịch chéo, tự cấp quyền admin, gọi chức năng không đúng vai trò | Chưa tìm thấy đường vượt quyền trong các trường hợp đã kiểm tra | Ma trận 5 loại người dùng × 14 chức năng trên DB giả, mỗi thao tác ghi rollback. Thợ chỉ đọc/sửa lịch mình; quản lý không cấp vai trò/tạo tài khoản; admin dùng đúng RPC hiện hành. |
| XSS từ tên khách | Chưa tái hiện được qua sink đã kiểm tra | Gửi chuỗi giống thẻ `img` có handler qua API giả, xác nhận hiện nguyên văn, không sinh phần tử img/svg/script trong vùng ứng dụng. CSP và escape vẫn giữ nguyên. |
| API anonymous và lộ trường thừa | Các probe production đạt | 12 RPC đặc quyền bị từ chối; bảng riêng trả không tìm thấy và schema riêng bị từ chối; catalog chỉ có trường công khai đã định nghĩa. Không thu thập dữ liệu khách để kiểm tra. |
| Tạo tài khoản qua Edge | Các nhánh kiểm tra hiện có đạt | Anonymous, token giả và origin lạ bị chặn trên production. Kiểm thử local xác minh vai trò bằng Auth/DB API giả; trigger DB kiểm tra lại actor admin trong transaction và không tin user_metadata. Không tạo tài khoản thật trong lần rà soát. |
| Khóa bí mật trong Git | Không phát hiện mẫu đã quét | Quét 103 blob văn bản trong lịch sử Git có thể truy cập: mẫu secret Supabase, token GitHub, private key và JWT có role service_role. Không in giá trị. Không bảo đảm phát hiện mọi định dạng secret; không quét kho credential hay môi trường ngoài dự án. Publishable key và email bí danh được phê duyệt là dữ liệu công khai có chủ đích. |
| Dependency advisory | Không có advisory được pnpm audit báo tại thời điểm chạy | 0 dependency production, 3 dependency phát triển; không phát hiện advisory ở các mức trong lần kiểm tra. Không đồng nghĩa dependency không có lỗi chưa công bố. Edge Function không thêm dependency ngoài. |

## Những giới hạn vẫn còn, cần ưu tiên tiếp theo

1. **Chống đặt lịch tự động — ưu tiên cao về khả năng phục vụ.** RPC nhận lịch vẫn công khai và chưa có CAPTCHA/chống bot/rate limit theo nguồn đã xác thực. Kẻ xấu có thể thử chiếm giờ bằng nhiều yêu cầu hợp lệ. Không thử làm đầy lịch production để chứng minh. RLS bảo vệ tên/điện thoại không giải quyết việc spam tạo lịch. Nếu triển khai CAPTCHA, cần xác minh token ở backend và khóa đường tạo trực tiếp để không bị bỏ qua; CAPTCHA của Supabase Auth không tự bảo vệ RPC đặt lịch.
2. **MFA cho quyền quản trị — chưa triển khai trong ứng dụng.** Cần có luồng challenge và kiểm tra AAL2 ở backend cho thao tác đặc quyền. Chỉ bật tùy chọn MFA ở dashboard không tự làm các SECURITY DEFINER RPC yêu cầu MFA. Giữ mức mật khẩu tối thiểu 8 theo lựa chọn của chủ tiệm; chưa tự thay chính sách này.
3. **Backup/khôi phục, lưu giữ/xóa dữ liệu và audit log nghiệp vụ — chưa kiểm chứng.** Cần chủ project xác nhận cấu hình backup và thử khôi phục, thời gian cần lưu thông tin khách/lịch hủy và quyền truy cập bản sao. Không tự xóa dữ liệu hiện có hoặc hứa đã có backup chỉ vì dùng dịch vụ managed. Chưa có lịch tự xóa PII hoặc nhật ký đầy đủ ai đọc/sửa từng lịch.
4. **Giới hạn GitHub Pages.** Session token vẫn đọc được bởi JavaScript cùng origin; chưa có cookie HttpOnly/BFF. CSP meta và chặn iframe bằng JavaScript không thay thế mọi HTTP security header. Các repository khác trên cùng origin Pages cũng cần được bảo vệ, vì đường dẫn khác không tạo origin bảo mật riêng.
5. **Thu hồi JWT và idle.** Đăng xuất xóa dữ liệu local ngay và cố gắng thu hồi refresh session, nhưng access JWT có thể còn hạn. Quyền staff được kiểm tra tại DB mỗi RPC. Hạn idle 30 phút là cơ chế của giao diện, không phải chính sách idle server chống được một client đã bị sửa mã.

## Kiểm chứng production còn giới hạn ở đâu?

- Đã kiểm tra anonymous và bearer token không hợp lệ trên project thật; chưa đăng nhập bằng các tài khoản admin/quản lý/thợ production để thực hiện thao tác tạo/sửa thật. Ma trận quyền đầy đủ chạy trên PostgreSQL nhúng với dữ liệu giả và các migration nguồn hiện hành.
- Không có phiên quản trị Supabase để đọc Security Advisor, toàn bộ ACL thực tế, MFA của tài khoản, chính sách mật khẩu/rate limit chi tiết, backup hoặc audit log hệ thống. Việc probe endpoint bị chặn không tự chứng minh mọi ACL trong project đều đúng.
- Có file `supabase/audits/security-posture.sql` chỉ đọc metadata để chủ project kiểm tra thêm RLS, quyền schema/bảng/sequence/hàm, search_path và RPC cũ. Không đọc dữ liệu khách/password/token; các mục `failures=0` là đạt kiểm tra tương ứng. File này đã được chạy trên DB kiểm thử, chưa chạy bằng quyền quản trị production. Không cần chạy file này để sử dụng bản sửa frontend.

## Bằng chứng có thể chạy lại

- `node --test tests/*.test.mjs`: kiểm thử DB, ma trận quyền, Edge handler và các lớp bảo mật.
- `tests/session-ui-smoke.mjs`: đổi tài khoản, đăng xuất, refresh chậm, idle, rời biểu mẫu đăng nhập, nhân sự bị khóa, iframe và phản hồi đặt lịch công khai sau chuyển màn hình.
- `tests/team-ui-smoke.mjs`: đặt dịch vụ/người thực hiện, escape tên khách, quản lý tài khoản admin-only, mật khẩu không lưu trong phiên, danh sách tài khoản và popup không nháy.
- `tests/ui-smoke.mjs`, `tests/preview-smoke.mjs`: hồi quy luồng cũ và file HTML offline.
- `pnpm audit --json`: advisory dependency. Kết quả phụ thuộc thời điểm và cơ sở dữ liệu advisory.

## Đối chiếu tài liệu

- [OWASP Broken Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)
- [OWASP Top 10 API Security Risks](https://api-security.owasp.org/editions/2023/en/0x11-t10/)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase backups](https://supabase.com/docs/guides/database/backups)
- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
