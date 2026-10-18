# Prompt tiếp tục trên PC Windows

Sao chép phần dưới vào Codex/agent mở tại thư mục source đã giải nén:

---

Bạn đang tiếp tục Family-Organizer trên PC Windows của tôi, từ bộ source-only do
Cloud bàn giao ngày 2026-10-18. Hãy thực hiện công việc, giữ React/Express/SQLite
và chức năng hiện hữu. Tôi chủ động chuyển nơi phát triển từ Cloud sang PC; hướng
dẫn Cloud-only trong các plan cũ được thay thế bởi yêu cầu này.

Đọc trước:
1. START-HERE-PC.md, AGENTS.md, CLAUDE.md, DESIGN.md, SOURCE-MANIFEST.json.
2. docs/superpowers/plans/2026-10-18-pc-continuation.md.
3. Master, Windows foundation, Productivity, Wallet plan ngày 2026-10-11.
4. docs/engineering/implementation-status.md và tài liệu domain của phần đang sửa.

Xác minh source SHA từ manifest, OS/architecture/Node/npm, local Git status nếu có.
Đây không phải main đã nghiệm thu: nó chứa W15 WIP chưa hoàn tất. Không tự clone
toàn bộ repo/tests/reports hoặc cài browser test nặng; tôi muốn bản PC gọn. Không
nhầm thiếu tests với tests pass. Giữ package-lock và runtime Node24.21.0 x64,
npm11.19.0, better-sqlite3 13.0.3, trừ khi có lý do và kiểm chứng cụ thể để đổi.

Ưu tiên tính năng chính theo PC01–PC06 trong plan, bắt đầu PC01 rồi hoàn thiện
W15: Asset–Portfolio binding end-to-end, current ACL/media/SSE, net worth canonical
không đếm trùng. Tiếp theo W18 legacy canonical bridge/migration/delta/rollback,
I02 quản lý link và các gap M1. Đọc source trước khi quyết định phần nào còn thiếu;
không làm lại các phần đã hoàn thành hoặc tự bật schema trên dữ liệu thật.

Mỗi nhóm nhỏ: kiểm tra lỗi thực tế, sửa source tối thiểu, chạy lint/build khi cần,
thao tác luồng chính bằng dữ liệu synthetic, ghi kết quả/giới hạn vào
docs/handoff/pc-progress.md. Kiểm tra ngay LASTEXITCODE của từng npm/native trong
PowerShell. Chỉ dùng offline adapters; không gọi AI provider thật hoặc gửi thông
báo. Kiểm tra tiền/reward đúng một lần, cancel không ghi, conflict/lost-ACK, current
quyền hai đầu và dữ liệu riêng. Không gọi chức năng hoàn tất chỉ từ build.

Bộ tests và bằng chứng vẫn ở nhánh đầy đủ codex/feature-first-acceptance trên
GitHub. Nếu cần regression có thể viết case tập trung mới trong PC; không tải lại
toàn bộ test corpus. Trước tích hợp cuối nhóm, chuyển diff source đã chọn sang
nhánh đầy đủ và kiểm tra bằng tests đầy đủ ở Cloud/GitHub Actions. Không push
snapshot source-only đè vào main hoặc merge nó làm xóa tests. Không bypass required
checks, skip assertions, continue-on-error hoặc tăng timeout để làm xanh.

Tiếp tục theo thứ tự, không lặp full Windows matrix sau mỗi sửa nhỏ. Cuối nhóm mới
chạy CI Windows2022/pwsh Node22+24, browser/package/service/performance đúng HEAD.
Không cần PC làm GitHub runner. Không tuyên bố Server2019 đã nghiệm thu khi chưa R02.
Không release/tag, không truy cập hay triển khai VPS; không Docker/Linux/WSL/GHCR
runtime, public API, integration tokens, MCP hay đồng bộ ngân hàng.

Trước sửa source, lưu checkpoint Git local nếu có thể. Báo ngắn gọn phần đã làm,
kiểm tra thực sự đã chạy, phần chưa kiểm tra và task kế tiếp. Không hỏi lại quyền
cho việc sửa source đã được giao; nếu gặp blocker thật thì giữ kết quả và nói rõ.
