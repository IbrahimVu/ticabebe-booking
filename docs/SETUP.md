# TiCaBeBe — Đặt lịch cắt tóc

Ứng dụng tiếng Việt cho một thợ cắt/một ghế phục vụ tại một thời điểm. Giao diện chạy trên GitHub Pages; Supabase lưu lịch dùng chung và xác thực quản trị. Không cần thuê máy chủ riêng để chạy mã backend này.

## Những gì đã có

- Khách chọn ngày, giờ, nhập tên/số điện thoại và nhận xác nhận kèm mã lịch hẹn.
- Chỉ hiển thị giờ trống; làm mới mỗi 15 giây và khi quay lại tab. Nếu hai người chọn cùng giờ, cơ sở dữ liệu chỉ nhận một lịch, người còn lại được yêu cầu chọn lại.
- Mặc định 45 phút cắt + 15 phút nghỉ, các giờ bắt đầu cách nhau 15 phút. Đặt 15:00 sẽ giữ đến 16:00, nên giờ kế tiếp là 16:00. Một lịch mới bắt đầu trước lịch cũ cũng phải đủ thời gian cắt và nghỉ, ví dụ 14:15 không thể đặt nếu 15:00 đã có khách.
- Trang admin đăng nhập ID/mật khẩu; xem ngày, tuần (thứ Hai–Chủ nhật), tháng; sửa thông tin, dời giờ, hủy lịch.
- Khi dời lịch, bấm **Đổi ngày / giờ hẹn**, chọn ngày trong khoảng cho phép rồi chạm vào giờ còn trống. Bộ chọn loại trừ chính lịch đang sửa, giữ nguyên mọi lịch khác, áp dụng cả thời gian nghỉ, ngày nghỉ và giờ mở/đóng cửa. Hệ thống kiểm tra lại khi lưu; nếu vừa có lịch mới, bộ chọn cập nhật và yêu cầu chọn lại. Có thể bấm **Giữ lịch hiện tại** để chỉ sửa tên/số điện thoại.
- Giao diện ưu tiên điện thoại: ô nhập chữ 16px, nút giờ dễ chạm, bảng sửa dạng trượt từ dưới với nút lưu luôn ở dưới. Lịch tháng cho chạm vào ngày để xem danh sách chi tiết bên dưới, tránh nhồi tên khách vào các ô nhỏ.
- Cấu hình tên tiệm, giờ mở/đóng cửa, thời gian cắt/nghỉ, ngày nghỉ hàng tuần và số ngày được đặt trước.
- Toàn bộ lịch tính theo `Asia/Ho_Chi_Minh` (GMT+7). Lượt cắt cuối phải kết thúc trước hoặc đúng giờ đóng cửa; thời gian dọn sau lượt cuối có thể vượt giờ đóng cửa.
- Tên và số điện thoại chỉ admin có quyền đọc. Khách chỉ được đọc các khoảng giờ bận, không được xem thông tin người khác.

## Xem thử trước khi chốt giao diện

Mở trực tiếp [`TiCaBeBe-xem-thu.html`](TiCaBeBe-xem-thu.html) bằng trình duyệt. File này chứa sẵn toàn bộ giao diện và dữ liệu mẫu, chạy được khi không có mạng, không cần Supabase hay máy chủ.

- Đặt lịch thử, xem xác nhận và kiểm tra các giờ bị ẩn.
- Vào **Quản trị**, dùng ID **admin**, mật khẩu **admin123** để thử xem ngày/tuần/tháng, sửa/hủy lịch và thay đổi cấu hình.
- Có sẵn lịch mẫu lúc 10:00 và 15:00 vào hôm nay, ngày mai và một số ngày tiếp theo. Mẫu 15:00 giữ giờ đến 16:00.
- Thay đổi chỉ lưu trong trình duyệt đang dùng file này, không gửi lên mạng và không đồng bộ giữa các thiết bị. Đây là bản thử để duyệt giao diện, không dùng để nhận lịch thật.
- Bấm dòng **Bản thử · Admin: admin / admin123** để mở phần hướng dẫn và nút **Khôi phục dữ liệu mẫu**.
- Bố cục gọn mở thẳng phần chọn ngày/giờ. Ở trang admin, bấm **Cấu hình** để mở bảng cấu hình riêng; menu **⋯** chứa thao tác đăng xuất. Các thông số thống kê được hiển thị trong một hàng ngắn, không chiếm các khối riêng.

Sau khi sửa giao diện nguồn, chạy `node scripts/build-preview.mjs` để dựng lại file HTML. Kiểm tra file độc lập bằng `node tests/preview-smoke.mjs` (cần cài thư viện kiểm thử ở phần bên dưới). File xem thử nằm ngoài thư mục `public`, nên workflow Pages chỉ xuất bản ứng dụng kết nối Supabase.

## Supabase là gì?

GitHub Pages phục vụ HTML/CSS/JavaScript, không tự có cơ sở dữ liệu hay máy chủ xác thực. [Supabase](https://supabase.com/) bổ sung hai phần này: lưu lịch chung cho mọi thiết bị và kiểm tra tài khoản admin. Bạn tạo một project Supabase rồi nối ứng dụng bằng URL và publishable key. Xem [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) và [khóa API Supabase](https://supabase.com/docs/guides/api/api-keys).

## Bước 1 — Tạo nơi lưu dữ liệu

1. Mở [Supabase Dashboard](https://supabase.com/dashboard), đăng nhập và tạo **New project**. Lưu mật khẩu database ở nơi riêng; không cần đưa mật khẩu đó vào ứng dụng.
2. Vào **SQL Editor → New query**. Sao chép toàn bộ file [`supabase/schema.sql`](supabase/schema.sql), dán vào và bấm **Run**. Chỉ chạy file này một lần trên project mới. Không chạy lại để nâng cấp vì nó tạo bảng và hàm từ đầu.
3. Vào **Authentication → Users → Add user → Create new user**, tạo tài khoản bằng email của bạn và mật khẩu mạnh (từ 12 ký tự được khuyến nghị). Bật xác nhận email tự động nếu màn hình có tùy chọn **Auto Confirm User**. Không tạo bằng cách đăng ký từ giao diện ứng dụng — trang này không mở đăng ký công khai.
4. Đánh dấu tài khoản vừa tạo là admin: mở **SQL Editor**, chạy câu lệnh sau sau khi thay email:

```sql
insert into booking_private.admin_users(user_id)
select id from auth.users where lower(email) = lower('EMAIL_CUA_BAN@example.com')
on conflict do nothing;

-- Kết quả phải có đúng tài khoản admin bạn vừa cấp quyền.
select u.email from auth.users u join booking_private.admin_users a on a.user_id=u.id;
```

5. Trong **Authentication → Providers / Sign In**, giữ đăng nhập Email/Password được bật. Có thể tắt **Allow new users to sign up** vì chỉ admin cần đăng nhập. Các tài khoản không có trong bảng `admin_users` không có quyền đọc lịch dù đăng nhập được.

## Bước 2 — Điền kết nối

Lấy **Project URL** và **Publishable key** trong bảng **Connect** hoặc **Project Settings → API / API Keys** của project. Dùng khóa bắt đầu bằng `sb_publishable_`; khóa `anon` cũ cũng được hỗ trợ. Tuyệt đối không đưa secret key (`sb_secret_`), `service_role` hoặc mật khẩu vào mã nguồn.

Sửa [`public/config.js`](public/config.js):

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://PROJECT_ID.supabase.co',
  supabaseKey: 'sb_publishable_THAY_BANG_KHOA_CUA_BAN',
  adminId: 'admin',
  adminEmail: 'EMAIL_CUA_BAN@example.com'
};
```

`adminId` là tên đăng nhập viết tắt (ví dụ `admin`, bạn có thể đổi). Khi nhập ID này, ứng dụng dùng `adminEmail` để xác thực mật khẩu với Supabase. Bạn cũng có thể đăng nhập trực tiếp bằng email. Email và publishable key trong file này là công khai; mật khẩu do Supabase kiểm tra và không nằm trong repository. Bảo vệ dữ liệu nằm ở quyền PostgreSQL và Row Level Security, không phải việc giấu trang admin.

## Bước 3 — Bạn tự đưa code lên GitHub Pages

1. Tạo repository trên GitHub, ví dụ `ticabebe-booking`. Chọn **Public** nếu tài khoản của bạn dùng Pages cho repository công khai.
2. Đưa toàn bộ mã nguồn vào repository, bao gồm thư mục ẩn `.github`, file `package.json`, `pnpm-lock.yaml`, `public`, `supabase` và `tests`. Không đưa `node_modules` hoặc mật khẩu lên GitHub.
3. Mở repository → **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Mở tab **Actions**, chạy workflow **Publish GitHub Pages** bằng **Run workflow**, hoặc push thêm commit vào nhánh `main`/`master`. Workflow sẽ cài thư viện kiểm thử, kiểm thử rồi xuất bản thư mục `public`.
5. Sau khi workflow màu xanh, lấy đường dẫn ở **Settings → Pages** hoặc ở kết quả deployment. Thường là `https://TEN_GITHUB.github.io/TEN_REPO/`.
6. Trang quản trị nằm tại `https://TEN_GITHUB.github.io/TEN_REPO/#admin`. Đăng nhập bằng ID bạn cấu hình và mật khẩu đã tạo ở Supabase.

**Cách đơn giản nếu không dùng GitHub Actions:** upload riêng nội dung bên trong thư mục `public` vào thư mục gốc của một repository; trong **Settings → Pages**, chọn **Deploy from a branch → main → /(root)**. Không upload nguyên thư mục `public` với cách này vì `index.html` cần nằm ở thư mục gốc được xuất bản.

## Kiểm tra trước khi nhận khách

Mở website trên hai thiết bị/tab. Chọn ngày mai, đặt 15:00 ở tab thứ nhất. Tab thứ hai sẽ ẩn những giờ giao nhau sau lần cập nhật kế tiếp; 16:00 còn trống. Nếu tab thứ hai đã chọn giờ trước khi cập nhật, gửi đặt lịch vẫn bị server từ chối. Đăng nhập admin, kiểm tra đủ tên/số điện thoại, thử dời giờ hoặc hủy để giờ đó trống trở lại.

Trong trang admin, chọn cấu hình giờ làm/ngày nghỉ phù hợp trước khi gửi link cho khách. Đổi cấu hình chỉ áp dụng cho lượt đặt mới và lượt được dời giờ; không tự thay đổi thời lượng lịch cũ. Hủy lịch giữ lại lịch sử, không xóa dữ liệu.

## Chạy trên máy và kiểm thử

Cần Node.js 22 trở lên. Giao diện không cần cài thư viện để chạy:

```sh
node scripts/serve.mjs
```

Mở `http://127.0.0.1:4173`. Khi chưa điền Supabase, trang hiển thị thông báo chưa kết nối và không nhận lịch giả.

Để chạy kiểm thử:

```sh
npm install
npm test
```

Hoặc dùng `pnpm install --frozen-lockfile` và `pnpm test`. Bộ test kiểm tra giờ trống, GMT+7, kỳ tuần/tháng, rồi chạy `schema.sql` trên PostgreSQL nhúng (PGlite) để kiểm tra quyền khách/admin, ràng buộc chống trùng, dời/hủy lịch và cấu hình. Kiểm thử cục bộ không thay thế việc kiểm tra kết nối Supabase thực tế sau khi bạn cài đặt.

Kiểm tra giao diện với Playwright: `npx playwright install chromium` rồi `node tests/ui-smoke.mjs`. Chạy máy chủ cục bộ trước. Bài kiểm tra này dùng dữ liệu giả để kiểm tra luồng giao diện, không kết nối project Supabase của bạn.

## Khi gặp vấn đề

- **Chưa kết nối dữ liệu:** kiểm tra hai giá trị Supabase trong `public/config.js`, commit và xuất bản lại.
- **Không thể tải ứng dụng / không tìm thấy bảng, hàm:** kiểm tra đã chạy thành công `supabase/schema.sql` và Data API được bật cho schema `public`.
- **Sai ID/mật khẩu:** ID phải trùng `adminId` hoặc là email thật; kiểm tra tài khoản đã xác nhận email. Có thể đặt lại mật khẩu trong Supabase Dashboard.
- **NOT_ADMIN / không có quyền quản trị:** chạy câu lệnh cấp admin ở bước 1 cho đúng email.
- **Không có giờ trống:** kiểm tra ngày nghỉ, giờ làm, thời gian hiện tại ở Việt Nam, khoảng đặt trước và các lịch đã được xác nhận.
- **Workflow Pages thất bại:** kiểm tra đã chọn Source = GitHub Actions, đã upload `pnpm-lock.yaml`, và nhánh đang dùng là `main` hoặc `master` (nếu tên khác, đổi danh sách trong `.github/workflows/pages.yml`).
- **Project Supabase ngừng hoạt động:** kiểm tra trạng thái trong Dashboard và khôi phục project trước khi nhận lịch tiếp. Hạn mức và chính sách gói dịch vụ được quản lý bởi Supabase.

## Cấu trúc

```text
public/                  Giao diện được xuất bản trên GitHub Pages
  config.js              URL, publishable key, ID/email admin
  app.mjs                Đặt lịch, xác nhận, đăng nhập, quản trị
  booking.mjs            Quy tắc giờ trống và múi giờ
supabase/schema.sql      Bảng, phân quyền, RPC và ràng buộc chống trùng
tests/                   Kiểm thử logic, PostgreSQL và giao diện
.github/workflows/       Xuất bản GitHub Pages tự động
```
