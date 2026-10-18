# Hướng dẫn Codex Cloud → GitHub Actions Windows → VPS Server 2019

> **User sequencing update — 2026-10-17 (Asia/Saigon):** Develop and functionally
> test the main feature flows in Cloud first; run comprehensive Windows checks
> when the feature group is ready, before merge and package handoff. Do not
> publish every intermediate commit. Required branch protection and final Windows
> qualification remain mandatory. See [feature-first validation](../../engineering/feature-first-validation.md).

> **F01 checkout verification (11/10/2026):** HEAD thực thi ban đầu là
> `68cb753c13c35e13dd120b217040aa12365e3b40`, sau baseline
> `b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91` đúng một commit thêm7tài liệu;
> source/tests/dependencies không đổi. Xem [baseline](../../engineering/windows-baseline.md)
> và [implementation status](../../engineering/implementation-status.md) cho SHA/PR/CI thực.
> Các tuyên bố khảo sát bên dưới là lịch sử; không dùng chúng làm bằng chứng CI hiện tại.


**Repo đích duy nhất:** [DongVienNguyen/Family-Organizer](https://github.com/DongVienNguyen/Family-Organizer), public, branch `main`. Chọn chính repo này khi attach Cloud environment, upload tài liệu, mở PR, xem Actions, cấu hình ruleset và tạo release. Repo public không tự cấp quyền ghi: kết nối GitHub vẫn phải có quyền trên repo của bạn. HEAD đã kiểm tra trùng SHA baseline của plan.

Ngày11/10/2026. Đọc [master cuối cùng](2026-10-11-family-organizer-upgrade-master.md) và [plan Windows-native](2026-10-11-windows-native-foundation.md) trước. Những script/command npm đề xuất chưa tồn tại cho tới khi các task F được implement. Tài liệu này là hướng dẫn và prompt, không phải xác nhận đã cấu hình GitHub hoặc VPS.

## 1. Mô hình làm việc đã chốt

```text
Bạn giao task bằng Codex Cloud
    ↓ sửa code + tests trong repo/branch
Pull request trên GitHub
    ↓ GitHub Actions / windows-2022 / PowerShell
Quality → Integration → Browser → Package → Service → ci-gate
    ↓ sửa trong Codex Cloud cho tới khi đúng SHA đạt mọi check
Merge theo chính sách repository
    ↓ workflow_dispatch tạo release candidate Windows ZIP
Nghiệm thu riêng trên Windows Server 2019
    ↓ approve đúng version + SHA256
Cài release lên VPS → smoke/backup/monitor
```

Máy cá nhân chỉ dùng trình duyệt gửi yêu cầu, xem PR/report và quản trị tài khoản. Không cần cài Node/Git/Docker/WSL/Playwright, không cần để PC bật. Cloud task/Actions vẫn chạy theo giới hạn dịch vụ; không hứa một task tự chờ vô hạn hoặc tự có quyền đọc Actions.

Codex Cloud không phải tên Windows runner. Tài liệu OpenAI hiện mô tả tạo environment, attach repo, kiểm setup rồi publish/republish. Không giả định plugin/skill cài ở PC tự xuất hiện trong Cloud: instructions cần nằm trong repo/AGENTS.md. [Official OpenAI documentation](https://learn.chatgpt.com/docs/environments/cloud-environments).

## 2. Chuẩn bị một lần bằng trình duyệt

1. Trong GitHub mở Family-Organizer, tạo branch tài liệu và upload thư mục `docs/superpowers` gồm7file hiện tại qua giao diện web nếu chúng chưa có trong repo. Có thể dùng GitHub web editor; không cần clone hoặc chạy code trên PC. Merge PR tài liệu trước task code để Codex đọc được path. File ở ổ D của chat hiện tại không tự đồng bộ vào Cloud.
2. Kết nối GitHub với Codex, chọn đúng repo, tạo Cloud environment qua giao diện đang có; attach repo, dùng setup conversation kiểm checkout và công cụ cần thiết, rồi Publish. Nếu account chỉ có giao diện legacy, dùng hướng dẫn legacy tương ứng; không áp tên menu cố định của bản khác. Không thêm production DB/keys/SSH credentials.
3. Environment setup dùng Node/npm cho đọc source, static checks và test nhanh nếu phù hợp runtime Cloud. Có thể chạy `npm ci` trong Cloud nếu policy cho phép; dependencies ở đó không được đóng gói Windows. Nếu bạn muốn chỉ chạy test trên Windows, agent chỉ sửa code và giao chạy tests cho Actions. Cloud install/setup lỗi platform không được “sửa” bằng đưa Docker/Linux dependency vào app.
4. Bật Actions cho repo, kiểm quyền tạo PR/workflow và ngân sách runner của tài khoản. Repo public/private có hạn mức khác nhau; không giả định CI luôn miễn phí hoặc vô hạn. Kết nối không cho ghi `.github/workflows` thì cần cấp quyền phù hợp trong GitHub/Codex hoặc áp diff qua web UI; không yêu cầu chạy PC.
5. Sau F05, cấu hình ruleset/branch protection: yêu cầu PR, `ci-gate`, không bypass thông thường, review theo chính sách gia đình. Sau F08, cấu hình manual release gate/environment nếu gói GitHub hỗ trợ. Test một PR cố tình lỗi trên branch synthetic để xác nhận merge bị chặn, rồi sửa/xóa branch test.
6. Chỉ ở giai đoạn3 mới điền domain/IP/VPS access, vị trí data, backup destination và kế hoạch cutover. Chưa biết các giá trị đó không cản trở giai đoạn1–2. Nếu VPS đã có app khác trên80/443 thì chọn proxy integration/port có kiểm tra, không ghi đè cấu hình đang dùng.

## 3. Contract lệnh và báo cáo cần Codex tạo

Các tên dưới đây là **mục tiêu F02/F05–F08**, không phải lệnh đã kiểm chứng trong repo hiện tại.

| Lệnh trong Windows Actions | Mục đích | Bằng chứng |
|---|---|---|
| `npm ci` | Cài đúng lockfile trên Windows | Node/npm/addon version, exit code |
| `npm run lint` | TypeScript hiện có; bổ sung lint nếu chọn | Report lỗi0 |
| `npm run test:unit` | Domain helpers/time/money/rules | JUnit + coverage |
| `npm run test:integration` | HTTP/ACL/SQLite/migration/outbox | JUnit, DB fixtures synthetic |
| `npm run build` | Frontend + backend production | dist manifest/bundle sizes |
| `npm run test:e2e` | Playwright trên production build | HTML + traces lỗi |
| `pwsh -File scripts/windows/Build-Package.ps1` | Tạo gói ZIP portable | manifest + SHA256 |
| `pwsh -File scripts/windows/Test-Package.ps1 -PackagePath <zip>` | Chạy ZIP ở workspace sạch | native-addon/CRUD/restore result |
| `pwsh -File scripts/windows/Test-Service.ps1 -PackagePath <zip>` | WinSW/start/stop/file locks | service log + report |
| `pwsh -File scripts/windows/Accept-Server2019.ps1 -PackagePath <zip>` | Chạy trên server2019 thật ở giai đoạn3 | OS/build17763 + version/hash + checklist |

Giữ `npm test` làm aggregate unit+integration để không phá thói quen repo, nhưng CI gọi suites không trùng thừa. Mỗi native command trong pwsh phải kiểm exit code ngay. Không có test nào được truy cập dữ liệu thật hoặc gửi push/Telegram/email/live AI trong PR.

Schema evidence tối thiểu:

```json
{
  "commitSha": "exact Git commit",
  "workflowRunUrl": "GitHub Actions run URL",
  "runAttempt": 1,
  "runnerOS": "Windows Server 2022",
  "nodeVersion": "exact version",
  "suites": [{"name": "integration", "passed": 0, "failed": 0, "skipped": 0}],
  "packageSha256": "actual hash when packaged",
  "server2019Acceptance": "not-run | passed | failed"
}
```

Đây là schema minh họa, số0 không phải test result. Implementation ghi số thật và validate suite bắt buộc không0tests; failed/skipped quan trọng hoặc thiếu report không được pass gate.

## 4. Vòng lặp sửa code và CI không dùng PC

1. Giao prompt nền tảng dưới đây. Codex đọc repo/docs và làm một PR đủ nhỏ để review. Không yêu cầu “clone tất cả trong một PR”.
2. Mở PR bằng GitHub integration được cấp quyền. GitHub chạy Windows jobs. Nếu Cloud không tự mở PR được, dùng nút tạo PR từ diff theo UI; thay đổi phải đến GitHub mới kích hoạt CI.
3. Agent đọc checks/logs/artifacts qua connector GitHub hoặc gh nếu Cloud có binary và auth hợp lệ. Không đặt raw PAT vào prompt; connector support không đồng nghĩa gh tự đăng nhập.
4. Khi gặp lỗi, giao follow-up kèm PR/run URL. Codex sửa cùng branch, push commit mới, kiểm run của **SHA mới**. Hoàn thành khi tất cả required checks xanh, không chỉ job build.
5. Nếu Cloud task hết lượt/thời gian, PR/Actions vẫn giữ bằng chứng. Task tiếp đọc `docs/engineering/implementation-status.md` gồm task ID, HEAD, runURL, failure, next step; không chạy lại toàn bộ khảo sát.
6. Review/merge PR đạt chuẩn. Tính năng tiếp theo làm branch mới từ main đã cập nhật. Nếu sửa cùng schema hoặc gateway, xong PR trước rồi mới task phụ thuộc; tránh agents đồng thời sửa store/migrations.

Lệnh gh tham khảo chạy **trong Cloud có auth hoặc trên GitHub-hosted runner**, không yêu cầu PC:

```powershell
gh pr checks <PR_NUMBER> --repo DongVienNguyen/Family-Organizer
gh run list --repo DongVienNguyen/Family-Organizer --commit <HEAD_SHA>
gh run view <RUN_ID> --repo DongVienNguyen/Family-Organizer --log-failed
gh run download <RUN_ID> --repo DongVienNguyen/Family-Organizer --dir ci-artifacts
```

Gh chỉ điều khiển/đọc job; Windows execution xảy ra bởi `runs-on: windows-2022`. Nếu auth/API thiếu quyền, dùng tab Actions web hoặc cung cấp log artifact cho task sau; không báo “CI pass” dựa tests trong Cloud.

## 5. Prompt đầu tiên — giai đoạn nền tảng

Copy nguyên khối này vào Codex Cloud sau khi tài liệu đã nằm trong repo:

```text
Hãy thực thi giai đoạn nền tảng Windows-native cho DongVienNguyen/Family-Organizer.
Mọi branch/PR/workflow/release thuộc đúng repo này. Trước khi sửa, kiểm repository
identity và remote/PR base; không push hoặc mở PR vào repo nguồn trước đây.

Đọc AGENTS.md/CLAUDE.md của repo và các tài liệu:
- docs/superpowers/plans/2026-10-11-family-organizer-upgrade-master.md
- docs/superpowers/plans/2026-10-11-windows-native-foundation.md
- docs/superpowers/plans/2026-10-11-codex-cloud-windows-guide-and-prompts.md

Mục tiêu tôi phê duyệt cho giai đoạn này: F01–F09 và I01, giữ mọi chức năng cũ,
chuyển runtime/CI/release sang Windows-native; chưa thêm tính năng P/W mới và chưa deploy VPS.
Bạn được sửa source, tests, docs, workflows, tạo branch/PR và push cập nhật PR.
Không merge, publish release production hoặc truy cập VPS trong task này.

Bắt đầu F01: ghi HEAD/khác biệt với SHA baseline trong plan, kiểm runtime/native addon,
thêm CI bootstrap windows-2022 và lưu failure thật. Chọn phạm vi PR nhỏ có thể review,
đừng dồn F01–F09 vào một diff khổng lồ. Nếu PR hiện tại chưa merge, hoàn thành và
báo task tiếp cần chờ merge; không tuyên bố cả giai đoạn đã hoàn thành.

Ràng buộc:
- React/Express/SQLite giữ lại; production Windows Server2019 x64, Node LTS pin.
- CI bắt buộc GitHub-hosted Windows + pwsh; không Docker/Linux/WSL/GHCR runtime.
- Không yêu cầu PC của tôi cài/chạy build, tests, browser hoặc runner.
- Cloud runtime không phải Windows thì Windows tests phải chạy bằng Actions.
- DATA_DIR tuyệt đối ngoài release; close DB/timers/file handles đúng trên Windows.
- Không public REST API, scoped integration tokens, MCP hoặc bank sync; giữ API/auth nội bộ.
- Không live secrets/dữ liệu gia đình trong tests. Không bỏ assertions/skip tests để xanh.

Với PR hiện tại: viết regression tests có ý nghĩa, implement, mở PR để Actions chạy,
đọc lỗi và sửa đến khi required checks đúng HEAD_SHA xanh. Nếu connector không hỗ trợ
đọc/ghi workflow hoặc CI chưa chạy, nêu blocker chính xác; không thay bằng lời nói đã pass.
Ghi implementation-status.md và baseline/evidence với run URL, SHA, test counts,
OS/Node, lỗi còn lại, artifacts. Không chứng nhận Server2019 trước R02.

Kết thúc bằng: phần nào đã làm, PR URL, CI run URL đúng SHA, tests đã chạy/chưa chạy,
task tiếp theo và các quyết định còn cần thiết. Đừng triển khai production.
```

## 6. Prompt tiếp tục nền tảng hoặc sửa CI

```text
Tiếp tục PR nền tảng Windows của Family-Organizer từ branch/PR hiện tại.
Đọc implementation-status.md, master và windows-native-foundation plan.
Xác minh HEAD SHA, xem required checks và log của run mới nhất đúng SHA đó.
Sửa root cause của lỗi Windows, giữ nguyên mục tiêu tests và acceptance criteria.
Nếu thiếu suite/report, thêm kiểm tra thật; không skip/continue-on-error hoặc hạ threshold.
Không dùng kết quả Node/Linux trong Cloud để tuyên bố Windows pass.
Push vào cùng PR, đọc lại CI. Nếu cần đổi thiết kế nhỏ để tương thích native-addon,
ghi lý do/version/ảnh hưởng migration và thêm regression test.
Không merge/deploy. Trả PR/run URL, exact SHA, bằng chứng và task F tiếp theo.
```

Sau khi merge PR, prompt nối tiếp:

```text
Main đã nhận PR nền tảng trước. Hãy đọc status và làm task F tiếp theo chưa hoàn tất
theo dependency trong plan Windows. Rebase/check HEAD trước khi làm. Một PR tập trung,
tests Windows tương ứng và required checks đúng SHA phải xanh. Khi F01–F09 + I01
đều hoàn tất, lập foundation-acceptance.md; còn R02 thì ghi chưa nghiệm thu Server2019.
Không tự bắt đầu phát triển tính năng hoặc deploy production.
```

## 7. Prompt phát triển — Matrix/Kanban trước

```text
Nền tảng F01–F09 + I01 đã được merge và ci-gate đạt. Hãy xác minh điều đó từ repo/CI,
không dựa riêng câu nói trong prompt. Tiếp tục milestone Matrix/Kanban theo master:
P01–P05 rồi P06–P10, UX cốt lõi P17 và tests liên quan P18.
Đọc productivity spec/plan và reuse gateway/auth/storage/Windows packaging đã có.

Chọn task phụ thuộc đã sẵn sàng đầu tiên, implement thành một PR tập trung.
Canonical task ID dùng chung List/Matrix/Kanban/Calendar; overdue derived;
Matrix drag có preview, không âm thầm đổi deadline; Kanban section tên Done
không complete; child submit phải Review, approve retry chỉ một reward/successor.
Giữ ACL ở server, money/points tách biệt, idempotency/revision/timezone đúng.

Mỗi thay đổi phải có domain/API/UI tests phù hợp và regression suite tự động.
Schema change thêm migration retry/upgrade/restore tests. Chạy trên Windows Actions,
đọc log và sửa đến khi required checks đúng PR HEAD xanh. Không merge hoặc deploy.
Trả PR/run URL, screenshots synthetic nếu đổi UI, tác động và task kế tiếp.
```

Prompt yêu cầu tính năng bất kỳ sau này:

```text
Trong Family-Organizer, hãy thực hiện yêu cầu mới sau:
[Dán mô tả tính năng, hành vi mong muốn và ví dụ của tôi ở đây.]

Đọc master/Windows plan và implementation-status. Kiểm tra reuse trước khi thêm module.
Nêu acceptance criteria cụ thể, xử lý role/privacy, timezone, retry/concurrency,
migration/rollback nếu ảnh hưởng dữ liệu. Giữ deployment Windows-native.
Viết tests tự động có ý nghĩa cho thay đổi, implement một PR có phạm vi review được,
đọc và sửa CI Windows đến khi đạt đúng SHA. Không chỉ đưa proposal khi đã đủ thông tin.
Không dùng PC của tôi, không tự đưa feature lên VPS, không tắt tests để xanh.
Cập nhật feature coverage/status/run evidence và trả PR cùng CI artifacts.
```

## 8. Prompt tối ưu database và AI

```text
Hãy tối ưu database Family-Organizer theo workload đã đo, không đổi stack chỉ để tối ưu.
Đọc I01/P02/W02, Windows plan và query benchmarks hiện có. Tạo synthetic dataset,
đo query plan/p95/rows touched/write amplification/event-loop lag trên Windows CI.
Chọn bottleneck cụ thể, thêm index/pagination/dirty writes/batching cần thiết.
Giữ một canonical store, không dual-write hoặc cache stale reward/finance.
Test transaction rollback, concurrent revisions, migration retry và backup restore.
Trả before/after cùng runner hardware/dataset/SHA; số đo hosted CI chỉ là reference,
không khẳng định hiệu năng VPS. PR Windows CI phải xanh; không deploy.
```

```text
Hãy triển khai phần AI draft được mô tả trong P17/W16 và plan Windows.
Reuse provider phía server đang được cấu hình, có timeout/cancel/cost limit,
validate structured output, lấy context theo actor ACL. AI chỉ tạo draft để người
dùng xác nhận; command ghi dữ liệu vẫn qua auth/revision/idempotency hiện hữu.
Không tự cộng điểm, duyệt task, ghi expense, chạy shell, thêm MCP hoặc API công khai.
Thêm eval fixtures tiếng Việt, ngày mơ hồ, invalid output, prompt injection từ nội dung
task, rò dữ liệu private, duplicate confirm và provider timeout. PR tests dùng mocks;
live provider test là dispatch riêng dùng key test do environment cung cấp.
Chạy Windows CI, báo eval pass/fail và latency/cost nếu đã đo; không claim chất lượng
live nếu chỉ mock. Không đưa key hoặc private prompts vào log/artifact. Không deploy.
```

## 9. Prompt chuẩn bị phát hành và nghiệm thu

Giao sau khi các tính năng bạn chọn đã hoàn chỉnh:

```text
Hãy chuẩn bị release candidate Family-Organizer Windows theo R01, chưa deploy VPS.
Đọc master/Windows plan, verify feature coverage và mọi required checks đúng commit.
Chạy full Windows regression, migration/restore, package/service tests; tạo candidate
ZIP win-x64 từ chính artifact đã test, SHA256/manifest/licenses/release notes/evidence.
Bạn được dispatch workflow release-candidate và tạo draft/prerelease để tôi nghiệm thu.
Không promote stable, không merge code ngoài phạm vi release và không chạm production.
Kiểm dependency compatibility Windows2019 nhưng ghi R02 là not-run nếu chưa có máy thật.
Chuẩn bị runbook và Accept-Server2019.ps1 đã test trên Windows CI, checklist rollback.
Trả candidate URL/hash/SHA và bước R02; không yêu cầu tôi build/test trên PC.
```

Prompt R02 dùng khi đã có Windows2019 staging/VPS và quyền truy cập qua kênh quản trị an toàn:

```text
Hãy thực hiện R02 cho candidate version/hash đã chọn qua môi trường Windows Server2019
được tôi cung cấp. Xác minh OS thực/build17763/x64 và SHA256 trước khi chạy.
Chỉ dùng synthetic/sanitized DATA_DIR và service riêng cho acceptance; không đọc/ghi
DB production. Nếu chưa có access hoặc staging, báo chính xác thiếu gì, không giả lập.
Chạy install/service restart/reboot recovery/TLS/auth/media/migration/backup restore/
rollback/permission/file lock và workloads trong plan, lưu report redacted.
Không promote hoặc cutover production. Nếu fail: sửa code qua Cloud PR, Windows CI,
candidate mới; không vá tay binary trên VPS làm lệch artifact đã test.
```

Prompt R03 chỉ gửi sau khi đã review report R02:

```text
Tôi phê duyệt triển khai candidate đã nghiệm thu R02, đúng version và SHA256 trong
report, lên VPS production được cấu hình. Thực hiện R03 theo runbook Windows.
Kiểm backup recovery, write fence, stop service, cài exact artifact, migration,
start/readiness/smoke trước mở write. Không npm install/build hoặc thay version ngầm.
Nếu pre-write smoke fail, thực hiện rollback theo schema guard; nếu có writes mới,
không tự restore snapshot cũ làm mất dữ liệu, báo recovery decision cụ thể.
Ghi release/change record, backup/monitor24–48h. Không chạy destructive test suite
trên production. Trả evidence thực và các mục vận hành còn cần theo dõi.
```

## 10. Checklist bạn dùng để đánh giá kết quả Codex

- PR có phạm vi và task ID rõ; không tự đổi hết stack hoặc bỏ module legacy.
- Có CI run URL đúng commitSHA hiện tại; required suite không bị skip, artifact đủ.
- Windows ZIP chạy được bằng runtime bên trong, giữ DB ngoài release, addon native tải được.
- Chưa có báo cáo Server2019 thì chưa được gọi là production-ready cho VPS2019.
- Task/Matrix/Kanban/Wallet giữ đúng invariants; AI có eval và confirmation thật.
- Không chứa REST API công khai/scoped integration token/MCP/bank sync bị loại bỏ.
- Mọi build/test diễn ra trên Cloud/Actions/staging; PC của bạn không là dependency.
- Deployment là giai đoạn riêng, đúng artifact được test và có rollback bảo toàn dữ liệu.

Giới hạn hiện tại: bộ plan đã được soát tĩnh, source repo đọc từ public GitHub. Chưa thiết lập Cloud environment/ruleset/workflows, chưa chạy CI hay đăng nhập VPS. Một lần bootstrap quyền tài khoản/domain/VPS vẫn cần chủ tài khoản thao tác hoặc cấp kết nối hợp lệ; prompt không tự tạo ra các quyền đó.
