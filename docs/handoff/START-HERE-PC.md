# Bàn giao source cho PC Windows — 2026-10-18

Bản này dành cho phát triển trên PC, theo yêu cầu mới của chủ repo. Nó thay đổi
chỉ dẫn cũ “chỉ làm trên Cloud, không dùng PC”. Không cần Docker, WSL hay PC runner.
Đây là source đang phát triển, **chưa hoàn tất toàn bộ master plan** và không phải
gói production đã nghiệm thu.

## Lấy đúng bản

- Bộ đầy đủ để quay lại Cloud: nhánh `codex/feature-first-acceptance` tại
  <https://github.com/DongVienNguyen/Family-Organizer/tree/codex/feature-first-acceptance>.
  Source, tests và bằng chứng cũ được giữ nguyên ở đó.
- Bộ PC gọn: nhánh `codex/pc-source-only-2026-10-18`; tải ZIP từ
  <https://github.com/DongVienNguyen/Family-Organizer/archive/refs/heads/codex/pc-source-only-2026-10-18.zip>.
  Chỉ giải nén vào thư mục mới, ví dụ `C:\Dev\Family-Organizer`.
- `SOURCE-MANIFEST.json` trong ZIP ghi SHA nguồn đầy đủ, trạng thái WIP, danh sách
  file và SHA256. ZIP không có `.git`, tests/fixtures, cấu hình test/CI, báo cáo,
  ảnh chứng minh, `node_modules`, build, database, uploads, backup hoặc secrets.
- Nhánh PC là snapshot riêng, không thay thế `main` hoặc nhánh Cloud. Không merge
  snapshot này vào `main`: việc thiếu tests là chủ ý của bản xuất, không phải yêu
  cầu xóa tests khỏi dự án. Giữ thay đổi PC trong Git local; chỉ chuyển diff source
  đã chọn sang nhánh đầy đủ khi cần tích hợp.

## Chuẩn bị PC

1. Cài **Node.js 24.21.0 x64**, kèm npm **11.19.0**, và PowerShell 7. Không lấy
   `node_modules` từ Cloud. `better-sqlite3` đang pin **13.0.3** trong lockfile.
2. Mở thư mục đã giải nén trong VS Code/Codex. Đọc plan và prompt bên dưới.
3. Trong PowerShell chạy từng lệnh, kiểm tra exit code ngay sau lệnh:

```powershell
Set-Location 'C:\Dev\Family-Organizer'
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
node.exe --version
if ($LASTEXITCODE -ne 0) { throw 'Không chạy được Node' }
npm.cmd --version
if ($LASTEXITCODE -ne 0) { throw 'Không chạy được npm' }
# Chỉ bỏ tải browser; giữ dependencies cần cho React/Vite/TypeScript.
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci thất bại; giữ log và kiểm tra lỗi native addon' }
npm.cmd run lint
if ($LASTEXITCODE -ne 0) { throw 'Typecheck thất bại' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build thất bại' }
```

Không dùng `npm ci --omit=dev` cho bản source: React/Vite/tsx và công cụ build đang
nằm trong devDependencies. Giữ package/lockfile gốc để tránh đổi dependency ngoài
ý muốn; package test runner nhỏ vẫn được cài theo lockfile, nhưng không có bộ test
hay browser binaries trong ZIP. Không chạy `npx playwright install` để thử app.
Nếu native addon cài lỗi, giữ lỗi thực tế và để agent chẩn đoán; không đổi lockfile
hay copy binary từ Linux để vượt lỗi.

## Chạy app với dữ liệu mới trên PC

Chỉ dùng dữ liệu tự tạo để phát triển. Không cần API key hoặc dịch vụ thông báo.
Source không mang database hoặc tài khoản Cloud. App không tự tạo admin mặc định.

```powershell
# Cùng cửa sổ PowerShell, sau khi build thành công.
$env:DATA_DIR = Join-Path $env:LOCALAPPDATA 'FamilyOrganizer-Dev\data'
$env:CONFIG_DIR = Join-Path $env:LOCALAPPDATA 'FamilyOrganizer-Dev\config'
$env:LOG_DIR = Join-Path $env:LOCALAPPDATA 'FamilyOrganizer-Dev\logs'
$env:PORT = '3000'
$env:NODE_ENV = 'production'
```

Với **installation mới hoàn toàn**, tạo admin qua operator đã build. Operator chỉ
nhận JSON qua stdin, password tối thiểu 16 ký tự; không nhập password vào lệnh,
file hay lịch sử shell. Dùng đoạn sau, nhập tương tác trước khi khởi chạy Node:

```powershell
$account = Read-Host 'Tên đăng nhập (a-z, 0-9, dấu . _ -)'
$fullName = Read-Host 'Tên hiển thị'
$secret = Read-Host 'Mật khẩu mới, ít nhất 16 ký tự' -AsSecureString
$plain = [System.Net.NetworkCredential]::new('', $secret).Password
try {
    $packet = @{ username=$account; fullName=$fullName; password=$plain } | ConvertTo-Json -Compress
    $packet | node.exe 'dist/operator.cjs'
    $operatorExit = $LASTEXITCODE
    if ($operatorExit -ne 0) { throw "Khởi tạo thất bại, exit=$operatorExit" }
} finally {
    $plain = $null
    $packet = $null
    $secret.Dispose()
}
```

Chỉ chạy khởi tạo một lần. Nếu installation đã có dữ liệu, không xóa database để
chạy lại; xem `docs/engineering/account-initialization.md`. Lệnh trên không dùng
transcript/log stdin và không đặt mật khẩu trong argv/env. Chuỗi cleartext chỉ
tồn tại tạm trong bộ nhớ để gửi tới operator; đây không phải hướng dẫn production.

Sau đó chạy bản đã build:

```powershell
npm.cmd start
$appExit = $LASTEXITCODE
if ($appExit -ne 0) { throw "App kết thúc lỗi, exit=$appExit" }
```

Mở <http://127.0.0.1:3000>. Muốn sửa và xem HMR: dừng app bằng dòng `stop` trong
terminal, giữ nguyên DATA/CONFIG/LOG, đặt `$env:NODE_ENV='development'`, rồi chạy
`npm.cmd run dev` và kiểm `$LASTEXITCODE` khi lệnh kết thúc. App chỉ bind loopback.
Tính năng pilot phụ thuộc schema/flag; cài mới không tự bật toàn bộ tính năng mới.
Agent cần đọc migration/rollout có sẵn trước khi bật trên dữ liệu synthetic riêng.

## Tiếp tục công việc

- Plan: `docs/superpowers/plans/2026-10-18-pc-continuation.md`.
- Prompt để dán vào agent trên PC: `docs/handoff/pc-continuation-prompt.md`.
- Khi quay lại Cloud: `docs/handoff/cloud-resume.md`.

ZIP cố ý không có tests, vì vậy `npm test` trong ZIP **không chứng minh regression
đã đạt**. Lint/build và kiểm tra thao tác chính là vòng phản hồi nhanh trên PC.
Giữ nguyên bộ tests trên nhánh đầy đủ để chạy một lần tổng hợp ở cuối nhóm tính
năng. Windows PC không chứng minh Windows Server2019; release/tag/VPS chưa được
phê duyệt và không thuộc bàn giao này.
