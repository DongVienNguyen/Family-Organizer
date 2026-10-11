# Family Organizer

## Thiết kế giao diện — ĐỌC TRƯỚC KHI TẠO/ĐỔI UI

Toàn bộ quy ước phong cách (màu, theme Sáng/Tối, typography, component, layout,
modal, FAB, safe-area) nằm trong **[DESIGN.md](DESIGN.md)** — nguồn chân lý chung
cho người và AI. Khi tạo màn hình hoặc component mới, hãy tuân theo file đó: ưu
tiên tái dùng các lớp Tailwind mẫu sẵn có thay vì tự nghĩ ra giá trị mới, và bám
checklist ở cuối DESIGN.md trước khi hoàn tất.

## Windows paths/scripts

Đọc [native-paths.md](docs/engineering/native-paths.md): production DATA_DIR tuyệt đối ngoài release, roots đặt bằng environment; provider .env ở CONFIG_DIR. `clean`/`release:notes`/`data:migrate` dùng Node; `release` bị chặn, không gọi Bash/tag.

## Phiên bản & phát hành

> **Quy trình hiện hành — Windows-native (F01):** đọc [AGENTS.md](AGENTS.md),
> [baseline](docs/engineering/windows-baseline.md) và
> [tiến độ](docs/engineering/implementation-status.md). CI dùng Windows2022/pwsh,
> giữ baseline Node22 và kiểm runtime default Node24 riêng. Workflow release Pi/GHCR đã gỡ; F08 sẽ tạo
> workflow Windows có cổng duyệt. Không chạy `npm run release`, tạo tag/release,
> merge hoặc triển khai VPS trong PR nền tảng. Server2019 chưa nghiệm thu (R02).

### Lifecycle hiện hành (F03)

`server/app.ts` tạo routes từ config/dependencies, không mở storage hoặc start jobs
khi import. `server/runtime.ts` mở một installation store/process và bind HTTP.
`server/lifecycle.ts` quản lý maintenance/drain/close; jobs ở `server/appJobs.ts`.
CLI nhận stdin `stop` hoặc SIGINT/SIGTERM; Windows service stop cần F07 xác minh.
App chỉ hiển thị phiên bản; operator quản lý release/rollback, không app auto-apply.
Đọc [native-lifecycle.md](docs/engineering/native-lifecycle.md) và status cho giới hạn
đã/chưa kiểm chứng. Tài liệu/scripts Pi/Docker cũ chỉ là đầu vào migration.
