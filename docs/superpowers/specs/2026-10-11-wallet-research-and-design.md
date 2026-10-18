# Khảo sát Wallet và thiết kế module tài chính cho Family-Organizer

Ngày khảo sát: **11/10/2026**, múi giờ **Asia/Saigon**.

**Cập nhật kiến trúc cuối cùng:** runtime/release chuyển Windows-native, code Codex Cloud, test Windows Actions, nghiệm thu Server2019 theo [master](../plans/2026-10-11-family-organizer-upgrade-master.md) và [Windows plan](../plans/2026-10-11-windows-native-foundation.md). Docker trong phần hiện trạng repo chỉ là bằng chứng lịch sử, không phải target triển khai.

**Phạm vi cập nhật 11/10/2026 theo yêu cầu người dùng:** Không triển khai REST API công khai, token tích hợp có scope, MCP hoặc đồng bộ ngân hàng. Các mô tả UI/DOC về chúng bên dưới chỉ giữ làm bằng chứng khảo sát sản phẩm tham chiếu, không phải yêu cầu triển khai. Giữ API nội bộ/auth của Family-Organizer, tài khoản ngân hàng theo dõi thủ công và nhập file; tỷ giá/giá thị trường vẫn thuộc phạm vi.

## 1. Mục tiêu và độ tin cậy

Yêu cầu: khảo sát Wallet by BudgetBakers thật chi tiết, xây dựng năng lực tương đương và phát triển tốt hơn trong Family-Organizer. Repo đích đã được người dùng đổi sang [DongVienNguyen/Family-Organizer](https://github.com/DongVienNguyen/Family-Organizer), public, branch `main`, giữ stack đã khảo sát. Workspace `D:/1_Dự án/wallet-app` chứa bộ tài liệu; đây là thiết kế đưa vào repo đích, chưa phải thay đổi mã nguồn ứng dụng.

Nhãn bằng chứng dùng xuyên suốt:

- **UI**: đã trực tiếp mở và đọc màn hình hoặc biểu mẫu trên tài khoản Premium đang đăng nhập.
- **DOC**: được tài liệu chính thức mô tả; chưa kiểm thử bằng thao tác lưu trong tài khoản này.
- **REPO**: đã kiểm tra source công khai của Family-Organizer.
- **NEW**: quyết định thiết kế/cải tiến đề xuất, không phải khẳng định Wallet đang hoạt động như vậy.
- **GAP**: chưa xác minh; cần kiểm tra tiếp bằng tài khoản thử nghiệm trước khi chốt tương đương.

Đã duyệt sáu mục điều hướng chính, biểu mẫu thêm tài khoản, chỉnh sửa thẻ tín dụng, ghi giao dịch và chuyển khoản, dashboard thêm thẻ, bộ lọc ghi chép, báo cáo nâng cao, trang nhập file, trang đầu tư, thêm tài khoản đầu tư, cài đặt chung, nhãn, REST API và MCP. Các mục cài đặt và tính năng còn lại được đối chiếu với tài liệu chính thức.

Không lưu giao dịch, tạo tài khoản tài chính, mua gói, kết nối ngân hàng, tạo khóa API, gửi dữ liệu hay xóa dữ liệu trong Wallet. Không sao chép số dư, tên tài khoản riêng, email hoặc khóa vào tài liệu. Có đổi khoảng thời gian xem báo cáo và mở/đóng biểu mẫu; đây là thao tác khảo sát giao diện.

**Giới hạn quan trọng:** khảo sát giao diện không cho biết source, cơ sở dữ liệu, mô hình AI, thuật toán nội bộ hay toàn bộ tổ hợp lỗi của BudgetBakers. Vì vậy tài liệu đặc tả hành vi quan sát được và thiết kế độc lập để đạt năng lực tương đương; không tuyên bố đã hiểu 100% logic nội bộ. Các thao tác tạo/sửa/xóa chưa chạy end-to-end; luồng cần tài khoản đầu tư hoặc ngân hàng có dữ liệu chỉ được kiểm chứng qua DOC. Browser đôi lúc timeout; đã dùng Computer Use để tiếp tục đọc UI.

## 2. Bản đồ tính năng Wallet web

### 2.1. Khung ứng dụng và dashboard — UI

Điều hướng chính: Tổng quan, Tài khoản, Ghi chép, Phân tích, Đầu tư, Nhập khẩu. Nút ghi giao dịch dùng chung; menu hồ sơ dẫn đến Cài đặt, Trợ giúp, ứng dụng di động và Đăng xuất. Tên dịch “Nhập khẩu” và “Thêm ghi chú” trong UI tương ứng nhập dữ liệu và thêm bản ghi tài chính, không phải nhập hàng hoặc ghi chú văn bản.

Dashboard có các tài khoản tóm tắt, số dư, dòng tiền, chi tiêu, xu hướng số dư và cơ cấu chi tiêu. Khoảng thời gian có điều hướng trước/sau. Khi không có bản ghi trong kỳ, biểu đồ hiển thị trạng thái không có dữ liệu, trong khi số dư vẫn có thể tồn tại từ lịch sử hoặc số dư ban đầu.

Danh sách xem trước khi **Thêm thẻ** đã quan sát:

| Nhóm | Thẻ/chỉ tiêu | Cách triển khai tương đương |
|---|---|---|
| Dòng tiền | Dòng tiền; So sánh kỳ; Xu hướng dòng tiền | Thu, chi, chênh lệch; kỳ trước/cùng kỳ năm trước; chuỗi theo ngày |
| Chi tiêu | Cơ cấu chi tiêu; Bản chất chi tiêu | Nhóm danh mục; phân loại must/need/want |
| Chung | Ghi nhận gần nhất; Tài khoản | Bản ghi gần nhất và liên kết chi tiết tài khoản |
| Số dư | Số dư theo tiền tệ | Tổng từng tiền tệ, không cộng trực tiếp VND với USD |
| Tín dụng | Chi tiêu theo danh mục; Sử dụng hạn mức tín dụng | Khoản nợ thẻ/hạn mức và tỷ lệ sử dụng |
| Dashboard sẵn có | Tổng quan; Xu hướng số dư; Cơ cấu chi tiêu | Widget cấu hình và cùng bộ máy truy vấn |

Các giá trị trong thư viện thẻ là **dữ liệu mẫu xem trước**, không thể dùng để suy luận công thức thực tế. Chưa lưu thêm/xóa/sắp xếp thẻ hoặc kiểm tra tính bền vững của cấu hình sau đăng nhập lại (**GAP**).

**NEW:** mỗi người có bố cục riêng; widget lưu `type`, vị trí, kích thước, bộ lọc và cấu hình. Cho thêm/ẩn/sắp xếp lại, mở bản ghi từ biểu đồ và hiển thị chú giải công thức.

### 2.2. Tài khoản — UI + DOC

Bốn luồng thêm: thủ công, đồng bộ ngân hàng, nhập file, đầu tư. Form thủ công gồm tên, màu, loại, số dư ban đầu, tiền tệ, loại khỏi thống kê. Form chỉnh sửa thêm lưu trữ. Tiền tệ bị khóa trong form chỉnh sửa tài khoản thẻ đã có; không suy rộng điều kiện khóa cho mọi tài khoản.

Các loại trong danh sách: chung, tiền mặt, thanh toán, thẻ tín dụng, tiết kiệm, thưởng, bảo hiểm nhân thọ, đầu tư, khoản vay, thế chấp và thấu chi. Đây là cách phân loại tài khoản theo dõi; không phải sản phẩm ngân hàng thực được mở bởi ứng dụng.

Chi tiết tài khoản có Số dư và Ghi chép, biểu đồ số dư, so với kỳ trước, chỉnh sửa và xóa. Danh sách có tùy chọn hiển thị tài khoản lưu trữ. Chưa thao tác xóa để xác minh cascade/khôi phục (**GAP**).

Thẻ tín dụng đã quan sát có hạn mức, ngày đến hạn trong tháng và hai chế độ trình bày: số nợ cần trả hoặc hạn mức khả dụng. Số dư chuẩn và cách hiển thị cần tách riêng để tránh cộng hạn mức tín dụng vào tài sản. DOC xác nhận thấu chi cũng có hạn mức và chế độ hiển thị. [Hướng dẫn thấu chi](https://support.budgetbakers.com/hc/en-us/articles/7148318384530-Overdraft-Account-Types).

DOC mô tả sửa số dư web bằng số dư ban đầu. **NEW:** cung cấp thêm điều chỉnh số dư có dấu vết kiểm toán, thay vì tạo thu nhập/chi phí giả làm lệch báo cáo. [Điều chỉnh số dư](https://support.budgetbakers.com/hc/en-us/articles/7149497597970-Adjust-Incorrect-Balance).

### 2.3. Bản ghi, chuyển khoản, mẫu — UI + DOC

Form đã đọc có: chi tiêu/thu nhập/chuyển khoản; số tiền; tiền tệ theo tài khoản; tài khoản; danh mục; nhãn; ngày và giờ; ghi chú; người trả; loại thanh toán; trạng thái thanh toán; tạo mẫu từ bản ghi; lưu và tạo tiếp. Trạng thái trong dropdown: đã đối soát, đã ghi nhận, chưa ghi nhận.

Chuyển khoản đổi form thành tài khoản nguồn/đích và hai số tiền/tiền tệ. Có lựa chọn **Ngoài Wallet** cho đối ứng. Chưa tạo chuyển khoản đa tiền tệ hoặc xác minh cách Wallet tự tính tỷ giá (**GAP**).

**NEW:** một chuyển khoản nội bộ là một thực thể với hai bút toán đối ứng trong một transaction DB. Không tạo hai bản ghi độc lập bằng hai request. Đối ứng ngoài hệ thống dùng một bút toán và gắn loại external transfer; người dùng quyết định cách đưa nó vào báo cáo.

DOC xác nhận web có sửa hàng loạt và xuất các bản ghi được chọn. Cách chọn tất cả cần làm rõ là các bản ghi đã tải hay toàn bộ kết quả truy vấn (**GAP**). **NEW:** hiển thị chính xác phạm vi chọn, số bản ghi và thay đổi trước khi áp dụng. [Sửa hàng loạt](https://support.budgetbakers.com/hc/en-us/articles/7150568033938-Bulk-Edit-Records), [xuất dữ liệu](https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet).

Mẫu web được DOC mô tả như bộ giá trị điền sẵn cho bản ghi thủ công. Mẫu không tự sinh bản ghi định kỳ. **NEW:** clone mở bản nháp có ID mới, ngày mặc định hôm nay; người dùng xác nhận lưu, không sao chép khóa nguồn nhập hoặc liên kết đối soát. [Mẫu](https://support.budgetbakers.com/hc/en-us/articles/7077050225042-Using-Templates).

DOC nói split chưa có trên web; ảnh hóa đơn/OCR, vị trí và xác nhận bằng dấu tích xanh có khác biệt nền tảng. Không suy từ mobile rằng chúng có trong form web đã thấy. **NEW:** giữ ảnh hóa đơn của Family-Organizer và thêm split, hàng đợi duyệt bản ghi trên web. [Giao dịch và split](https://support.budgetbakers.com/hc/en-us/articles/7149271363090-Everything-About-Transactions-Add-edit-clone-split-duplicates), [dấu xác nhận](https://support.budgetbakers.com/hc/en-us/articles/9740038391186-Record-Confirmation-Green-check-mark).

### 2.4. Bộ lọc, tìm kiếm, phân tích — UI

Bộ lọc ghi chép và phân tích đã đọc: tìm kiếm, tài khoản, danh mục, nhãn, tiền tệ, loại bản ghi, khoảng số tiền, bao gồm/loại chuyển khoản, trạng thái, loại thanh toán; reset và lưu bộ lọc. Ghi chép có sắp xếp mặc định thời gian mới nhất. Khoảng số tiền UI là số tuyệt đối theo tiền tham chiếu, không phải chỉ lọc số âm của chi phí. Khoảng thời gian: tuần, tháng, năm, tùy chỉnh.

Bốn tab phân tích: báo cáo thu nhập & chi tiêu, xu hướng số dư, dòng tiền, biểu đồ và báo cáo nâng cao. Tab nâng cao có bộ biểu đồ lưu riêng, chỉ tiêu Balance/Cashflow/Cumulative Cashflow, kiểu Line/Bar/Area, Group by và Granularity (mặc định Day). Danh sách đầy đủ tùy chọn Group by/Granularity chưa đọc được do lỗi browser (**GAP**).

**NEW:** định nghĩa trước các chiều nhóm tài khoản/danh mục/nhãn/thành viên và độ hạt ngày/tuần/tháng/năm. Bộ lọc cùng semantics giữa danh sách, biểu đồ, ngân sách và export. Theo DOC có thể lưu bộ lọc trên web. [Bộ lọc](https://support.budgetbakers.com/hc/en-us/articles/7076754432146-Working-with-Filters).

### 2.5. Nhập dữ liệu — UI + DOC

UI đã xem: chọn tài khoản, chọn file/kéo thả, danh sách lần nhập, làm mới danh sách, hướng dẫn; tài khoản đang xem chưa có lịch sử nhập. Không upload file thật hoặc file thử vào tài khoản này.

DOC mô tả hỗ trợ CSV/XLS/XLSX/OFX; chọn dòng tiêu đề và phạm vi dòng, ánh xạ số tiền/ngày, tùy chọn ghi chú/người nhận/tiền tệ, preview rồi import. Có mapping tái sử dụng và xóa một lần nhập cùng bản ghi của nó. Khuyến nghị khoảng 1.000 dòng/file. [Hướng dẫn nhập](https://support.budgetbakers.com/hc/en-us/articles/7077275632274-Import-your-transactions-or-files).

DOC nói nhập vào General account, nhưng UI phiên này cho chọn một tài khoản thẻ. **GAP:** selector chưa chứng minh tài khoản đó được phép import thành công. Không áp restriction bằng suy đoán; cần test trên tài khoản thử nghiệm.

**NEW:** cải thiện parsing số kiểu Việt Nam, chọn định dạng ngày rõ ràng, báo lỗi từng dòng, chống trùng theo nguồn, preview không ghi dữ liệu, commit nguyên tử, undo có kiểm tra bản ghi đã chỉnh sửa. Hỗ trợ import 10.000 dòng bằng tác vụ xử lý chia khối; con số này là mục tiêu của dự án, không phải khả năng đã đo của Wallet.

### 2.6. Đầu tư — UI + DOC

UI có tài khoản cổ phiếu/ETF, Mua/Bán (bị khóa khi chưa có tài khoản), giá trị tài khoản đầu tư, cơ cấu danh mục, so sánh tăng trưởng giá. Form thêm tài khoản có tên, màu, loại đầu tư, loại tài sản cổ phiếu & ETF, số dư ban đầu, tiền tệ và loại khỏi thống kê.

DOC web mô tả ghi nhận mua/bán với sàn, chứng khoán, số lượng, ngày, đơn giá và tổng. Đơn giá gợi ý là giá đóng cửa, không nhất thiết realtime. Có chuyển khoản tiền mặt vào tài khoản đầu tư. Không mua chứng khoán thật qua Wallet. Luồng giao dịch đầu tư có dữ liệu chưa kiểm thử UI (**GAP**). [Đầu tư](https://support.budgetbakers.com/hc/en-us/articles/14785418453522-Investments-Stocks-ETF).

**NEW:** dùng lại tài sản vàng/crypto/bất động sản/xe trong Family-Organizer, thêm sổ giao dịch cổ phiếu/ETF, tiền mặt trong tài khoản đầu tư, giá lịch sử và lãi/lỗ. Không đếm một tài sản cả trong bảng Assets lẫn danh mục đầu tư.

### 2.7. Cài đặt và tích hợp — UI + DOC

Menu cài đặt đã đọc: Tiền tệ, Danh mục, Mẫu, Nhãn, Quy tắc tự động; Chung, REST API, Máy chủ MCP, Thanh toán, Dữ liệu cá nhân & quyền riêng tư, Trợ giúp.

Chung có hồ sơ, ngôn ngữ, khoảng thời gian mặc định dashboard, ẩn phần thập phân, tự đăng xuất khi không hoạt động 5 phút, xóa dữ liệu cục bộ. UI nói xóa cục bộ sẽ đăng xuất và xóa dữ liệu đã lưu trên thiết bị. Không thử các nút xóa hoặc lưu cài đặt.

Danh mục trong sidebar mở thành cây các nhóm. DOC web có đổi tên/icon/màu, ẩn, thêm cấp con và từ chối xóa mục còn tham chiếu. Nhãn có tên, màu và lưu trữ trong form đã đọc; DOC còn mô tả mặc định gắn nhãn lên bản ghi mới. [Danh mục](https://support.budgetbakers.com/hc/en-us/articles/7077082048146-All-about-Categories-and-Subcategories), [nhãn](https://support.budgetbakers.com/hc/en-us/articles/7076564578066-Utilising-Labels).

Quy tắc tự động theo DOC khớp từ khóa và loại bản ghi để gán danh mục/nhãn, cho xem bản ghi khớp trước khi áp dụng lại. DOC giới hạn quy tắc Wallet cho dữ liệu đồng bộ ngân hàng. **NEW:** ứng dụng mới không đồng bộ ngân hàng nên chỉ chọn nguồn import/manual; mặc định import, manual phải bật rõ. Mặc định không sửa bản ghi đã phân loại thủ công. [Quy tắc](https://support.budgetbakers.com/hc/en-us/articles/7149319175826-Automatic-Rules).

REST API đã mở được trang quyền truy cập nâng cao và thấy nút tạo. Trang MCP có địa chỉ máy chủ, hướng dẫn tích hợp và nút tạo token MCP mới. Không đọc/lưu giá trị khóa, không tạo mới. Scope chính xác, xác thực và giới hạn công cụ cần khảo sát tiếp (**GAP**). Billing/privacy/help mới xác nhận điều hướng, chưa kiểm thử quy trình hỗ trợ, mua gói, xuất dữ liệu cá nhân hoặc xóa tài khoản (**GAP**).

**NEW:** giữ auth và quản trị hiện có; API nội bộ dùng vai trò và quyền tài khoản, có audit. Không thêm REST API công khai, token tích hợp có scope, MCP hoặc đồng bộ ngân hàng; không sao chép các mục cài đặt này. Billing không cần cho mô hình self-host gia đình; nếu phát triển SaaS mới thiết kế entitlement riêng. Hiển thị trợ giúp và chính sách xử lý dữ liệu, export/erase có kiểm soát. Không bê nguyên thương hiệu, nội dung tiếp thị hoặc điều khoản của BudgetBakers.

### 2.8. Phân biệt web, mobile và cải tiến

| Năng lực | Wallet web theo DOC ngày khảo sát | Hướng Family-Organizer |
|---|---|---|
| Ngân sách | Chưa có | Đã có; nâng cấp nhiều điều kiện, dự báo, carry-forward |
| Planned payments | Chưa có | Đã có recurring bills; thêm income/transfer và lịch phát sinh |
| Goals | Chưa có | Đã có; liên kết góp tiền với sổ tài khoản |
| Debt tracker cá nhân | Chưa có | Đã có; liên kết bút toán trả gốc/lãi |
| Group sharing | Chưa có | Tận dụng thành viên và quyền tài khoản |
| Split bản ghi | Chưa có | Thêm phân bổ nhiều danh mục trên web |
| Dấu reviewed riêng | Mobile | Thêm trên web, tách khỏi trạng thái thanh toán |
| Ảnh/OCR/warranty/shopping | Khác biệt nền tảng; chưa xác minh đầy đủ web | Giữ ảnh và shopping hiện có; OCR/warranty là nâng cấp |

Nguồn cho các giới hạn: [ngân sách](https://support.budgetbakers.com/hc/en-us/articles/7076953735314-Setup-Budgets), [định kỳ](https://support.budgetbakers.com/hc/en-us/articles/7149523920786-Setup-Planned-Payments), [goals](https://support.budgetbakers.com/hc/en-us/articles/7181571852690-Setting-up-Goals), [nợ](https://support.budgetbakers.com/hc/en-us/articles/7149520322706-Setting-up-Debts-and-Loans), [chia sẻ nhóm](https://support.budgetbakers.com/hc/en-us/articles/7149394922002-Everything-about-Group-Sharing).

## 3. Kiểm tra Family-Organizer — REPO

Source tham chiếu: branch `main`, commit **b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91** khi khảo sát. Mọi đường dẫn triển khai bên dưới là đường dẫn tương đối trong repo Family-Organizer, không có sẵn trong thư mục wallet-app. Cần checkout và xác nhận lại HEAD trước thực thi.

Stack đã kiểm tra từ package/source: React 19, TypeScript 5.8, Vite 6, Tailwind 4, Motion, Lucide; Node/Express 4; better-sqlite3 11; i18next; Vitest; pdfmake; Docker và volume dữ liệu. Dùng signed Bearer token; frontend có `family_token`, `family_active_tab` và state tại App. Không có bằng chứng repo đang dùng Next.js, Prisma, PostgreSQL, Zustand hoặc thư viện chart chuyên dụng.

| File hiện có | Điểm tích hợp đã kiểm tra |
|---|---|
| `src/App.tsx` | Điều hướng tab, fetch `/api/finance`, ngân sách, recurring, assets, goals, debts, categories |
| `src/components/Finance.tsx` | Màn thu chi và các phần lập kế hoạch tài chính |
| `src/components/Assets.tsx` | Tài sản gia đình và định giá |
| `src/components/DebtTracker.tsx` | Khoản nợ và lần trả |
| `src/components/SavingsGoals.tsx` | Mục tiêu và contributions |
| `src/types.ts` | Các type tài chính cùng type ứng dụng |
| `src/utils/financePeriod.ts` | Logic kỳ báo cáo có test riêng |
| `src/utils/debt.ts`, `src/utils/assetValue.ts` | Logic nợ và giá trị tài sản có test |
| `server.ts` | Express, xác thực, phân quyền, endpoint tài chính |
| `server/db.ts` | DB facade, normalize, lưu bản ghi, audit, backup/restore |
| `server/sqlite.ts` | Bảng mỗi collection `(id, seq, data JSON)`, SQLite WAL, ghi full snapshot nguyên tử |

Type giao dịch hiện có dùng `amount: number`, `date: YYYY-MM-DD`, account là enum cash/bank/e_wallet; chưa phải entity tài khoản có ID và số dư riêng. TransactionType hiện chỉ income/expense. BudgetLimit theo tháng/danh mục; debt payments và goal contributions nằm trong collection của đối tượng.

Quyền hiện có admin/member/child/guest; child và guest bị chặn tài chính. Không tự mở quyền tài chính cho trẻ khi thêm module. Kiểm tra quyền phải ở server, gồm cả export, báo cáo và file hóa đơn.

Nguồn kiểm tra: repo đích đã xác minh có cùng commit baseline; [package](https://github.com/DongVienNguyen/Family-Organizer/blob/b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91/package.json), [types](https://github.com/DongVienNguyen/Family-Organizer/blob/b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91/src/types.ts), [SQLite](https://github.com/DongVienNguyen/Family-Organizer/blob/b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91/server/sqlite.ts), [App](https://github.com/DongVienNguyen/Family-Organizer/blob/b2c26516c6d6c6cc3edf3e83391eb84cfaa2cd91/src/App.tsx).

## 4. Các phương án kiến trúc — NEW

1. **Mở rộng collections JSON hiện tại:** ít thay đổi, dễ dùng backup cũ; mỗi thao tác vẫn đọc/ghi nhiều dữ liệu, khó ràng buộc chuyển khoản và query lớn. Chỉ phù hợp bản thử rất nhỏ.
2. **Module tài chính có bảng quan hệ trong cùng SQLite — khuyến nghị:** giữ stack/auth/UI, chuyển Windows-native; FK/index/transaction cho tài chính, migration và backup theo I01/F07. Phù hợp nâng cấp lâu dài trên VPS Windows.
3. **Dịch vụ riêng với DB mới:** tách tải và triển khai nhưng thêm vận hành, auth và đồng bộ; chưa có nhu cầu đủ mạnh trong bài toán này.

Chọn phương án 2. Không rewrite ứng dụng hay nâng đồng loạt phiên bản dependency. Giữ bản đang khóa trong package-lock lúc triển khai; chỉ bổ sung thư viện thật sự cần cho parser XLS/XLSX/OFX và kiểm thử browser sau khi kiểm tra nguồn chính thức.

Frontend module mới dưới `src/features/wallet`, backend dưới `server/wallet`. `Finance.tsx` chuyển dần thành shell tương thích. Routes mới `/api/wallet/*`; `/api/finance*` còn lại dùng adapter đọc/ghi cùng canonical store khi cutover, không giữ hai sổ độc lập. Các module nợ, goals, recurring, assets được nối vào lõi, giữ deep-link và chức năng cũ.

## 5. Mô hình dữ liệu và hợp đồng — NEW

Mỗi record có ID UUID, `createdAt`, `updatedAt`, actor và `revision`. Bảng tài chính dùng prefix `wallet_` để không bị `sqliteSave` của collection cũ xóa. Timestamp UTC ISO, ngày nghiệp vụ và timezone lưu riêng. Một deployment vẫn là một gia đình; chưa thêm multi-tenant SaaS trong phiên đầu.

| Entity | Trường chính và ràng buộc |
|---|---|
| Account | name, type, currency, ownerUserId, accessMode(shared/private), openingMinor, openingDate, excludedFromStats, archivedAt, creditLimitMinor, dueDay, balanceDisplay |
| AccountGrant | accountId, userId, quyền read/contribute/manage; unique account+user |
| Record | kind, occurredAt, effectiveDate, timezone, source(manual/import/schedule/legacy), categoryId, payee, note, paymentMethod, settlementStatus, reviewedAt, importBatchId, recurrenceOccurrenceId |
| Posting | recordId, accountId, deltaMinor; transfer có hai posting hoặc một với external đối ứng |
| Allocation | recordId, categoryId, amountMinor; tổng phân bổ đúng tổng expense/income, không tự thêm posting |
| Category / Label | parentId, name, icon, color, hidden/archived; category nature must/need/want/unspecified; record-label many-to-many |
| Currency / FxRate | ISO code, exponent, baseCurrency; ngày/rational rate/source/manual override; không sửa rate giao dịch cũ khi refresh |
| Template / Rule | bản nháp type an toàn; rule criteria/actions/sources/priority/version/dry-run |
| Filter / Chart / Widget | userId, tên, cấu hình typed và version; không lưu kết quả số dư vào cấu hình |
| ImportBatch / ImportRow | hash/mapping/parserVersion/state, errors, commit snapshot, reference các record đã tạo |
| Schedule / Occurrence | recurrence rule, timezone, confirmationMode, dueDate, linkedRecordId, status; unique schedule+dueDate |
| Budget | kỳ, hạn mức, filter, carry policy, các ngưỡng nhắc; không cộng các budget chồng nhau làm tổng chi |
| DebtLink / GoalLink | liên kết record đã có hoặc tạo cùng transaction; trả gốc/lãi tách nhau; contribution không tự nhân đôi tài sản |
| Instrument / Trade / Quote | instrumentId=(exchange,symbol,type), số lượng/giá dạng decimal string, tradeDate, fees, currency, quoteDate/source |
| Audit / Idempotency | before/after actor, request key/payload hash/result; không ghi secret vào audit; không có bảng token tích hợp |

### 5.1. Tiền và tỷ giá

API dùng `minor: string`, ví dụ VND 150000 là `"150000"`, USD 12.34 là `"1234"`. Arithmetic dùng bigint; DB dùng INTEGER với kiểm tra range signed 64-bit và binding BigInt. API serialize string; không JSON.stringify BigInt trực tiếp. Input decimal được parse theo currency exponent; VND exponent 0, USD 2. Từ chối NaN/Infinity, số âm trong form amount unsigned, overflow và precision vượt mức. Posting có dấu.

Quantity và price chứng khoán dùng decimal string tối đa 8 chữ số thập phân cho bản đầu; số tiền tổng vẫn theo currency exponent. Phép nhân dùng decimal chính xác hoặc integer scale; chốt rounding half-up một lần tại biên money. Tỷ giá là cặp integer numerator/denominator >0, có source/date. FX giao dịch là snapshot; FX định giá hôm nay là series riêng. Thiếu giá/rate hiển thị chưa định giá và subtotal có coverage, không coi bằng 0.

### 5.2. Các công thức phải thống nhất

- Số dư book của tài khoản tại ngày D = opening + tổng posting hợp lệ đến D, không phụ thuộc bộ lọc danh mục/nhãn trên danh sách.
- Income/expense kinh tế = tổng record thuộc loại đó, loại adjustment và internal transfer; chi phí transfer fee là expense riêng.
- Dòng tiền ròng toàn bộ tài khoản = external inflow - external outflow; chuyển nội bộ cả hai đầu không làm tăng chi tiêu. Dòng tiền của subset tài khoản hiển thị movement qua ranh giới subset nhưng gắn nhãn transfer riêng.
- Với transfer cùng tiền tệ, tổng delta hai posting bằng 0; khác tiền tệ bảo toàn từng amount đã xác nhận, không cộng số khác currency để kiểm tra zero.
- Net worth = giá trị tài khoản book + giá tài sản được chọn - nợ ngoài sổ; tài sản/nợ đã nằm trong account không cộng lần nữa. Credit limit không phải tài sản.
- Thẻ: debtDue=max(0,-bookBalance); available=limit+bookBalance. Số dư dương do trả dư tăng available; biểu đồ utilization thể hiện >100% khi vượt hạn mức, không che bằng clamp.
- Carry forward mặc định = max(0, hạn mức kỳ trước - actual spent); chỉ ghi một lần mỗi cặp budget+period; không tự cộng phần âm. Chính sách khác cần cấu hình rõ.
- Budget actual và forecast riêng: remaining=limit-actual; expected=limit-(actual+unpaid planned+estimated other). Planned đã liên kết record không được tính lại.
- Tỷ lệ so sánh kỳ dùng mẫu số abs(previous); previous=0 hiển thị “chưa có cơ sở so sánh” và chênh lệch tuyệt đối.
- Lãi/lỗ portfolio dùng average cost trong bản đầu, tách realized/unrealized, cashflow/capital gains; không gắn nhãn return nếu đang hiển thị biến động tổng giá trị có góp/rút vốn.

Đây là công thức đề xuất. Cần kiểm nghiệm bằng fixture trước khi đối chiếu các số báo cáo Wallet; không khẳng định là thuật toán nội bộ của Wallet.

### 5.3. Trạng thái và quyền

Settlement `uncleared/cleared/reconciled/voided` và `reviewedAt` là hai trục riêng. Book balance mặc định gồm uncleared/cleared/reconciled; available report loại uncleared; voided không tính. Đây là policy NEW cần được UI giải thích.

Quyền là giao của role hiện tại và grant tài khoản, dùng phiên đăng nhập của repo; không có token scope tích hợp. Child/guest luôn bị chặn. Admin giữ quyền quản trị theo chính sách repo; vì admin có quyền backup/restore, UI không được hứa tài khoản riêng tư tuyệt đối trước admin. Member xem/tạo theo grant; chỉnh record của người khác cần manage. Export/chart/tìm kiếm chỉ trên account được phép; transfer phải có contribute cả hai đầu. Nếu chỉ được đọc một đầu, không lộ tên/số dư tài khoản kia. Attachment bắt buộc kiểm tra quyền record và không dùng URL tĩnh công khai cho hóa đơn mới.

## 6. Di trú, backup, vận hành

Migration trên snapshot thử trước: enum cash/bank/e_wallet thành ba account shared VND mặc định, giữ ID record cũ, map creator, ngày cũ giữ effectiveDate và đánh dấu thời gian legacy không rõ. Không bịa số dư ban đầu hoặc giờ giao dịch. Legacy amount chuyển exact theo exponent; bản ghi sai đưa vào báo cáo cách ly, không bỏ âm thầm.

Migration có version, checksum và mapping persistent; chạy lại không nhân đôi. Backfill opening=0 có nhãn chưa đối soát; người dùng nhập số dư mở sổ sau. Existing savings/debt payments có mode legacy_unlinked trước khi liên kết record, không tự tạo posting vì có thể đã tồn tại trong transactions.

Backup JSON mới có `schemaVersion`, `wallet` section, legacy data, media manifest và checksum. Restore parse/validate tất cả trước khi viết, transaction nhất quán cho collection cũ + bảng mới; raw SQLite backup dùng online backup API để gồm WAL. Không chỉ copy main .sqlite khi WAL đang hoạt động. Chụp backup trước migration, thử restore bản cũ và mới, ghi rõ bản app hỗ trợ. Feature flag `walletV2` tắt lúc đầu; chỉ một store canonical sau cutover. Rollback code sau khi có giao dịch mới cần reverse projection hoặc restore có chấp thuận, không gọi “rollback không mất dữ liệu” nếu chưa có cách bảo toàn các write mới.

SQLite WAL, busy timeout, foreign_keys ON; transaction ghi ngắn, network/parse ngoài transaction; imported rows stage riêng. Không thêm Redis/microservices khi chưa có nhu cầu. Worker nhẹ có bảng lease/job/idempotency cho schedule, FX, quote/import, sau restart tiếp tục. DATA_DIR ngoài release Windows ZIP; một Node process/DB. CI windows-2022 chỉ kiểm tra; release/Server2019 acceptance/cutover theo F08/R01–R03.

## 7. Trải nghiệm tốt hơn và nghiệm thu

1. Web đầy đủ ngân sách/định kỳ/nợ/goals/chia sẻ, cùng ngôn ngữ và format ngày Việt Nam.
2. Một bộ filter dùng mọi nơi; click chart mở chính xác bản ghi tạo ra con số; tooltip công thức và độ mới dữ liệu.
3. Nhập file có preview/error/duplicate/undo; tiền và ngày không đoán mơ hồ.
4. Lịch ngày 31 dùng policy clamp-to-last-day được chọn rõ; restart/multi-client không tạo trùng occurrence.
5. Hóa đơn/receipt nối shopping và warranty tùy chọn; OCR chỉ tạo draft chờ xác nhận.
6. Quyền tài khoản tại server; audit và optimistic revision tránh ghi đè trên nhiều thiết bị.
7. PWA ban đầu đọc dữ liệu cache an toàn; ghi offline chỉ khi có queue idempotent và xử lý conflict.

Mục tiêu hiệu năng NEW:100.000 record synthetic, page50 p95<500ms trên Windows CI reference ghi cấu hình; tổng hợp tháng<1s; import10.000 không chặn event loop và có progress. Đo VPS Server2019 riêng ở R02, không suy từ CI2022. Export streaming; lỗi provider không làm mất dữ liệu ghi tay.

Nghiệm thu với dữ liệu giả, không dùng số dư tài khoản cá nhân: money/FX exact; transfer atomic; reports/export cùng filter; migration chạy hai lần; restore; quyền bị chặn cả đường API; scheduler không trùng; UI responsive/keyboard/light-dark; lint/test/build hiện có đều pass.

## 8. Backlog khảo sát còn thiếu trước khi cam kết tương đương toàn bộ

| Mã | Điều cần xác minh | Cách làm |
|---|---|---|
| G01 | Lưu/reorder/remove widget và persistence | Tài khoản thử, tạo dữ liệu giả, reload/đăng nhập lại |
| G02 | CRUD account, archive, delete/cascade | Tài khoản thử; kiểm tra lịch sử và khả năng khôi phục |
| G03 | Transfer VND/USD, external, fee | Tạo bộ giao dịch giả có tỷ giá định trước; linked bank ngoài phạm vi |
| G04 | Chọn tất cả, bulk edit, export, clone | Bộ dữ liệu >1 trang; so ID exported |
| G05 | Rules priority/case/keyword matching | Fixture import/manual cho thiết kế mới; dry-run và apply; bank-only của Wallet ngoài phạm vi |
| G06 | Filter OR/AND, Group by/Granularity, periods | Fixture có nhiều nhãn/danh mục và ngày biên |
| G07 | Import account restrictions, formats, undo | CSV/XLSX/OFX giả; không tải tài chính thật |
| G08 | Portfolio buy/sell, phí, FX, corporate actions | Tài khoản đầu tư thử; không giao dịch tiền thật |
| G09 | Currency refresh và historical revaluation | Fixture nhiều ngày; kiểm tra ảnh hưởng báo cáo cũ |
| G10 | REST API công khai/token scope/MCP | Ngoài phạm vi theo yêu cầu người dùng; không khảo sát hoặc triển khai tiếp |
| G11 | Privacy export/erase/local data semantics | Tài khoản thử có dữ liệu disposable; xác nhận xóa riêng |
| G12 | Mobile-only OCR/warranty/shopping/pay integrations | Khảo sát riêng nếu muốn parity toàn bộ sản phẩm |

Nghiệm thu theo phạm vi đã chọn: G10 và các phần bank-only/linked bank là excluded, không phải task chờ thực hiện. Các GAP còn áp dụng phải có trạng thái rõ; không dán nhãn “clone 100% Wallet”. Bằng chứng mới phải cập nhật ma trận UI/DOC/GAP trước khi sửa spec.

Plan thực thi đi kèm: [2026-10-11-wallet-family-organizer.md](../plans/2026-10-11-wallet-family-organizer.md).

Điều phối mới: [Family-Organizer Upgrade master](../plans/2026-10-11-family-organizer-upgrade-master.md) bổ sung Matrix/Kanban/task core theo TickTick; shared gateway/snapshot do I01 sở hữu. Không mở lại các tính năng tài chính đã loại bỏ.
