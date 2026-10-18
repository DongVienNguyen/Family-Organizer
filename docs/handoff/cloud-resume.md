# Giữ và tiếp tục bản Cloud

Không xóa hay thu gọn checkout Cloud để tạo bộ PC. Toàn bộ tests, workflows,
bằng chứng cũ và W15 tests vẫn thuộc nhánh đầy đủ:

<https://github.com/DongVienNguyen/Family-Organizer/tree/codex/feature-first-acceptance>

`SOURCE-MANIFEST.json` trong bản PC trỏ tới commit nguồn của checkpoint bàn giao.
Nhánh `codex/pc-source-only-2026-10-18` là bản lọc riêng, không phải nơi lưu tests.
Không merge nhánh source-only vào main/Cloud; chuyển riêng diff production/docs.

Code đã commit/push có thể lấy lại từ GitHub ngay cả khi máy Cloud hết phiên.
Không coi máy Cloud, process, cache, credentials hay file ngoài Git là lưu trữ vĩnh
viễn. Báo cáo cũ đã commit vẫn trong repo đầy đủ. Log W15 lúc bàn giao được lưu ở
`docs/engineering/evidence/pc-handoff/`; không mang chúng vào ZIP PC.

Prompt quay lại Cloud:

> Tiếp tục Family-Organizer từ nhánh `codex/feature-first-acceptance`. Đọc AGENTS,
> CLAUDE, implementation-status và plan `2026-10-18-pc-continuation.md`. Xác minh
> HEAD; không reset hoặc ghi đè thay đổi mới. Đây là checkpoint W15 WIP, không phải
> toàn bộ plan hoàn tất. Giữ tests/bằng chứng. Nếu có thay đổi từ PC, so manifest
> nguồn và tích hợp diff source/docs có chọn lọc; không merge snapshot source-only
> làm mất tests. Ưu tiên tính năng và regression tập trung, CI Windows toàn bộ ở
> cuối nhóm; không release/tag hoặc truy cập VPS. Đọc tiến độ PC mới nếu được cung
> cấp trước khi tiếp tục để tránh làm lại công việc.
