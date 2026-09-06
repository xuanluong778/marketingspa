#!/usr/bin/env python3
"""Xuất tài liệu Excel danh sách tính năng MarketingAutoAZ — chỉ dữ liệu đã audit từ code."""

from __future__ import annotations

import datetime as dt
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(
    "/var/www/marketingaut_usr/data/www/marketingautoaz.com/docs/"
    "Danh-sach-tinh-nang-va-huong-dan-MarketingAutoAZ.xlsx"
)

# Cột chuẩn: NHÓM | TÍNH NĂNG | MỤC ĐÍCH | CÁCH DÙNG NHANH | ĐIỀU KIỆN | TRẠNG THÁI
FEATURES: list[list[str]] = [
    # Tổng quan
    [
        "Tổng quan",
        "Bảng tổng quan hôm nay",
        "Xem số liệu realtime: lead mới, lịch hẹn, khách cũ, doanh thu, ads, credit, gói dùng thử.",
        "1) Vào menu Tổng quan.\n2) Xem các ô số liệu hôm nay.\n3) Cuộn xuống xem lịch hẹn và lead chưa xử lý.\n4) Bấm lối tắt (Content AI, Email, Chatbot, Phễu…) để vào nhanh.",
        "Đã đăng nhập. Có gói dùng thử hoặc gói trả phí còn hạn.",
        "Hoạt động",
    ],
    [
        "Tổng quan",
        "Trợ lý AI (Bạch Cốt Tinh)",
        "Hỏi nhanh tình hình spa, gợi ý việc cần làm. Một số thao tác ghi dữ liệu phải được bạn xác nhận.",
        "1) Bấm nút robot góc màn hình.\n2) Hỏi bằng tiếng Việt (vd: lead hôm nay, lịch hẹn).\n3) Xem gợi ý và liên kết sang trang liên quan.\n4) Nếu có nút xác nhận ghi dữ liệu — đọc rồi bấm đồng ý.",
        "Quyền trợ lý AI (assistant.use). Còn AI Credit. Cờ ASSISTANT_ENABLED đang bật.",
        "Hoạt động — chat thật; thao tác ghi/gửi inbox chỉ lưu nháp, không tự gửi Messenger",
    ],
    # CRM
    [
        "CRM / Khách hàng",
        "Danh sách khách hàng",
        "Lưu hồ sơ khách đã dùng dịch vụ: tên, SĐT, email, chi nhánh, nguồn, thẻ.",
        "1) Vào CRM & Khách hàng → Khách hàng.\n2) Lọc theo chi nhánh / nguồn / thẻ.\n3) Bấm Thêm để nhập khách mới, hoặc Sửa / Xóa.\n4) Bấm tên khách để xem chi tiết.",
        "Đã đăng nhập. Có thể import/nhập tay, không bắt buộc kết nối kênh.",
        "Hoạt động",
    ],
    [
        "CRM / Lead",
        "Quản lý lead (danh sách + Kanban)",
        "Theo dõi khách tiềm năng: tạo, lọc, gán nhân viên, đổi trạng thái, đặt lịch từ lead.",
        "1) Vào Lead.\n2) Chọn xem bảng hoặc Kanban.\n3) Bấm Thêm lead hoặc kéo thẻ đổi giai đoạn.\n4) Mở chi tiết để ghi chú, gán nhân viên, tạo lịch hẹn.\n5) Dùng bộ lọc nguồn / nhân viên / ngày.",
        "Đã đăng nhập. Nên khai báo nguồn lead và nhân viên trong Cài đặt / HRM.",
        "Hoạt động",
    ],
    [
        "CRM / Lead",
        "Phân lead & SLA",
        "Tự chia lead cho nhân viên và nhắc khi quá hạn chưa xử lý.",
        "1) Vào Cài đặt → Phân lead & SLA.\n2) Bật quy tắc chia lead (theo ca / nhân viên).\n3) Đặt thời gian SLA.\n4) Lead mới sẽ được gán theo quy tắc.",
        "Quyền cài đặt. Đã có nhân viên trong hệ thống.",
        "Hoạt động",
    ],
    [
        "Lịch hẹn & Dịch vụ",
        "Lịch hẹn spa",
        "Tạo, xem, đổi trạng thái lịch hẹn theo ngày/tuần/tháng; nhắc khách.",
        "1) Vào Lịch hẹn & Dịch vụ.\n2) Chọn xem Ngày / Tuần / Tháng.\n3) Bấm Thêm lịch — chọn khách, dịch vụ, nhân viên, giờ.\n4) Đổi trạng thái (đến / hủy / không đến).\n5) Gửi nhắc lịch nếu đã cấu hình kênh.",
        "Có khách/lead và dịch vụ. Nhắc tin cần kết nối kênh tin nhắn.",
        "Hoạt động",
    ],
    # Phễu
    [
        "Phễu Marketing",
        "Phễu của tôi — xem / sửa / thiết kế",
        "Danh sách phễu đã tạo. Sửa nội dung trực tiếp hoặc mở thiết kế canvas (ẩn/hiện).",
        "1) Vào Phễu Marketing → Phễu của tôi.\n2) Bấm Sửa trực tiếp để đổi chữ/màu trên form.\n3) Bấm Thiết kế phễu để xem luồng.\n4) Kích hoạt phễu khi sẵn sàng nhận lead.\n5) Sao chép link form công khai gửi khách.",
        "Gói còn hạn. Quota phễu theo gói (trial giới hạn số phễu).",
        "Hoạt động",
    ],
    [
        "Phễu Marketing",
        "Tạo phễu (AI hoặc mẫu)",
        "Tạo phễu mới: AI gợi ý theo mục tiêu, hoặc chọn mẫu sẵn (voucher, đặt lịch…).",
        "1) Bấm Tạo phễu.\n2) Chọn tạo bằng AI hoặc từ mẫu.\n3) Điền mục tiêu / ngành / ưu đãi.\n4) Xem bản nháp, chỉnh form (ngày giờ, kênh liên hệ…).\n5) Lưu rồi Kích hoạt để nhận lead thật.",
        "AI gợi ý trừ AI Credit. Phễu mới chỉ nhận lead khi trạng thái Đang chạy.",
        "Hoạt động — AI chỉ đề xuất; bạn phải kích hoạt mới chạy thật",
    ],
    [
        "Phễu Marketing",
        "Form thu lead công khai",
        "Trang form khách điền: họ tên, SĐT, email, ngày giờ, kênh liên hệ, ghi chú → vào CRM.",
        "1) Mở link /f/… của phễu đang chạy.\n2) Khách điền form và Gửi thông tin.\n3) Lead xuất hiện ở Lead và tab Khách hàng của phễu.\n4) Xem ngày giờ + kênh liên hệ trong ghi chú lead.",
        "Phễu phải Đang chạy (ACTIVE). Không cần đăng nhập phía khách.",
        "Hoạt động",
    ],
    [
        "Phễu Marketing",
        "Khách hàng & hành trình trong phễu",
        "Xem lead theo từng phễu, timeline (form, ads click, bước tiếp theo).",
        "1) Vào Phễu → Khách hàng.\n2) Chọn phễu.\n3) Bấm lead để xem hành trình.\n4) Đối chiếu form đã gửi với CRM.",
        "Đã có lead gửi form.",
        "Hoạt động",
    ],
    [
        "Phễu Marketing",
        "Phân tích phễu",
        "Xem số form, lead, chuyển đổi theo phễu.",
        "1) Vào Phễu → Phân tích.\n2) Chọn phễu / khoảng thời gian.\n3) Xem số liệu chuyển đổi.",
        "Phễu đã chạy và có dữ liệu.",
        "Hoạt động",
    ],
    # Content
    [
        "Content / AI",
        "Tạo content quảng cáo",
        "AI soạn bài quảng cáo (caption, góc tiếp cận) cho nhiều ngành.",
        "1) Content Marketing → Tạo content.\n2) Chọn mục tiêu / sản phẩm / giọng điệu.\n3) Bấm tạo — chỉnh sửa kết quả.\n4) Lưu vào Thư viện bài viết.\n5) Đưa sang Auto Post nếu muốn đăng.",
        "Còn AI Credit. Gói còn hạn.",
        "Hoạt động — tạo nháp/nội dung; chưa tự đăng ads",
    ],
    [
        "Content / AI",
        "Xây dựng thương hiệu (cá nhân / spa)",
        "AI viết nội dung xây thương hiệu, series bài cá nhân.",
        "1) Chọn Xây dựng thương hiệu.\n2) Khai chủ đề / chân dung.\n3) Tạo bài và lưu thư viện.\n4) Lên lịch đăng nếu đã nối Fanpage.",
        "AI Credit. Đăng thật cần kết nối Fanpage.",
        "Hoạt động",
    ],
    [
        "Content / AI",
        "Check Content Ads (Facebook)",
        "Rà nội dung ads theo hướng dẫn chính sách Facebook trước khi chạy ads.",
        "1) Vào Check Content Ads.\n2) Dán nội dung / tải ảnh.\n3) Xem cảnh báo chính sách.\n4) Sửa rồi mới dùng để đăng hoặc đưa sang Ads.",
        "Không cần tài khoản Ads. Chỉ kiểm tra — không tự đăng ads.",
        "Hoạt động — chỉ kiểm tra, không publish ads",
    ],
    [
        "Content / AI",
        "Lấy văn bản từ video",
        "Phiên âm video thành chữ để viết caption / kịch bản.",
        "1) Vào Lấy văn bản từ video.\n2) Tải video hoặc dán link hỗ trợ.\n3) Chờ phiên âm.\n4) Copy văn bản sang tạo content / teleprompter.",
        "AI Credit (phiên âm). Quota theo gói / trial.",
        "Hoạt động",
    ],
    [
        "Content / AI",
        "Thư viện bài viết",
        "Kho bài đã tạo: tìm, sửa, dùng lại cho Auto Post.",
        "1) Vào Thư viện bài viết.\n2) Tìm bài.\n3) Sửa hoặc chọn đăng / lên lịch.",
        "Đã tạo ít nhất 1 bài.",
        "Hoạt động",
    ],
    [
        "Social / Facebook",
        "Auto Post Fanpage",
        "Đăng bài lên Fanpage ngay hoặc theo lịch (đăng thật lên Facebook).",
        "1) Kết nối Fanpage (tab Kết nối Fanpage).\n2) Vào Auto Post — chọn bài / soạn.\n3) Chọn fanpage.\n4) Đăng ngay hoặc đưa sang Lịch đăng.\n5) Kiểm tra bài trên Facebook.",
        "Đăng nhập Facebook (quyền fanpage). Token còn hạn.",
        "Hoạt động — đăng thật lên Fanpage khi đã kết nối",
    ],
    [
        "Social / Facebook",
        "Lịch đăng bài",
        "Xem và quản lý bài đã lên lịch.",
        "1) Vào Lịch đăng.\n2) Xem bài chờ / đã đăng / lỗi.\n3) Sửa giờ hoặc hủy lịch.",
        "Đã kết nối Fanpage.",
        "Hoạt động",
    ],
    [
        "Social / Facebook",
        "Kết nối Fanpage",
        "Nối Facebook để Auto Post và chatbot inbox fanpage.",
        "1) Content → Kết nối Fanpage (hoặc Ads/Chatbot nếu cùng OAuth).\n2) Đăng nhập Facebook.\n3) Chọn fanpage và cấp quyền.\n4) Kiểm tra trạng thái Đã kết nối.",
        "Tài khoản Facebook quản trị fanpage. App Facebook đã cấu hình trên hệ thống.",
        "Hoạt động — cần cấu hình OAuth Facebook",
    ],
    [
        "Content / AI",
        "Kịch bản quay video (Teleprompter)",
        "Soạn kịch bản và đọc chữ trên màn hình khi quay.",
        "1) Vào Kịch bản quay video.\n2) Dán/soạn kịch bản (có thể lấy từ phiên âm).\n3) Bật teleprompter, chỉnh tốc độ.\n4) Quay video theo chữ chạy.",
        "Đăng nhập. Máy có camera/micro nếu quay trong trình duyệt.",
        "Hoạt động",
    ],
    # Ads
    [
        "Quảng cáo / Facebook & Google Ads",
        "Ads — tổng quan chiến dịch",
        "Kéo số liệu chiến dịch Facebook/Google đã kết nối: chi tiêu, lead, xem danh sách.",
        "1) Vào Ads.\n2) Tab Kết nối — đăng nhập Facebook Ads và/hoặc Google Ads.\n3) Bấm Đồng bộ.\n4) Tab Chiến dịch — lọc nền tảng / ngày.\n5) Xem chi tiêu, trạng thái.",
        "OAuth Facebook Ads và/hoặc Google Ads (developer token Google). Tài khoản ads có quyền.",
        "Hoạt động — đọc/đồng bộ số liệu khi đã kết nối",
    ],
    [
        "Quảng cáo",
        "Kết nối Facebook Ads / Google Ads",
        "Gắn tài khoản quảng cáo để đồng bộ chiến dịch.",
        "1) Ads → Kết nối.\n2) Bấm kết nối Facebook hoặc Google.\n3) Chọn tài khoản ads (Google: chọn customer / MCC).\n4) Đồng bộ lần đầu.",
        "Redirect URI Google/Facebook đã khai trên Google Cloud / Meta. Google cần developer token.",
        "Hoạt động — cần cấu hình OAuth. Google chưa kết nối thì không có số liệu Google",
    ],
    [
        "Quảng cáo",
        "Auto Mode & Rule (tự động ads)",
        "Đặt rule (tạm dừng / bật / tối ưu) theo ngưỡng. AI/rule chỉ đề xuất — không tự ghi lên Facebook/Google khi hệ thống tắt ghi.",
        "1) Ads → Auto Mode & Rule.\n2) Bật rule (vd: tạm dừng nếu CPL cao).\n3) Xem log đề xuất.\n4) Người có quyền ads.manage phê duyệt nếu có yêu cầu.\n5) Không kỳ vọng tự pause/budget trên Google/Meta trừ khi admin bật ghi.",
        "Đã kết nối ads. Phê duyệt tách người với đề xuất AI. Hiện ADS_ACTIONS_LIVE=false và ADS_ACTIONS_PROVIDER_WRITE=false.",
        "Beta / Cần cấu hình — chỉ đề xuất, chưa được phép tự ghi lên nền tảng ads",
    ],
    [
        "Quảng cáo",
        "Bản nháp AI (creative / chiến dịch)",
        "AI gợi ý nội dung/chiến dịch ads. Lưu nháp, không tự đăng.",
        "1) Ads → Bản nháp AI.\n2) Tạo gợi ý (trừ credit).\n3) Xem/sửa nháp.\n4) Không publish lên Facebook/Google trừ khi có quy trình phê duyệt + hệ thống bật ghi.",
        "AI Credit. Kết nối ads thì đối chiếu số liệu thật.",
        "Chỉ nháp / AI đề xuất — chưa tự publish",
    ],
    [
        "Quảng cáo",
        "Gmail báo cáo ads",
        "Gửi báo cáo ads định kỳ vào Gmail đã nối.",
        "1) Ads → Gmail báo cáo.\n2) Kết nối Gmail nếu được hỏi.\n3) Bật lịch gửi.\n4) Kiểm tra hộp thư.",
        "Kết nối Gmail (OAuth Google). Đã có dữ liệu ads.",
        "Hoạt động — cần cấu hình Gmail",
    ],
    [
        "Quảng cáo",
        "Audit log ads",
        "Nhật ký đồng bộ, rule, thao tác pause/enable.",
        "1) Ads → Audit log.\n2) Lọc theo ngày / hành động.\n3) Đối chiếu với chiến dịch.",
        "Đã dùng Ads.",
        "Hoạt động",
    ],
    [
        "Quảng cáo",
        "Attribution & ROAS",
        "Gán lead/doanh thu về nguồn ads (UTM, click) để ước tính hiệu quả.",
        "1) Vào Attribution & ROAS.\n2) Chọn khoảng ngày / chi nhánh.\n3) Xem chi tiêu vs lead / đặt lịch.\n4) So với Báo cáo marketing.",
        "Lead có UTM/click. Ads đã đồng bộ chi tiêu thì ROAS đầy đủ hơn.",
        "Hoạt động",
    ],
    # Messaging
    [
        "Broadcast / Tin nhắn hàng loạt",
        "Chiến dịch hàng loạt (Messenger / Zalo…)",
        "Gửi tin theo tệp khách: xem trước, lên lịch, theo dõi trạng thái.",
        "1) Tin nhắn & Chatbot → Nhắn tin hàng loạt.\n2) Chọn kênh và tệp khách.\n3) Soạn tin / chọn mẫu.\n4) Xem trước danh sách đủ điều kiện.\n5) Lên lịch hoặc gửi (tuân cửa sổ Zalo/Messenger).",
        "Kết nối Messenger/Zalo. Khách đủ điều kiện. Gửi thật chỉ khi bật MESSAGING_LIVE_SEND hoặc kênh nằm trong danh sách page/OA được phép.",
        "Cần cấu hình — mặc định dry-run (không gửi khách thật); hiện chỉ gửi thật với page/OA đã được admin cho phép",
    ],
    [
        "Broadcast",
        "Tệp khách hàng (audience)",
        "Tạo nhóm khách để gửi chiến dịch (theo tag, nguồn, phễu…).",
        "1) Vào Tệp khách hàng.\n2) Tạo tệp, chọn điều kiện.\n3) Xem số người khớp.\n4) Dùng tệp khi tạo chiến dịch.",
        "Đã có khách/lead trong CRM.",
        "Hoạt động",
    ],
    [
        "Broadcast",
        "Mẫu tin",
        "Lưu mẫu tin dùng lại cho chiến dịch / flow.",
        "1) Tab Mẫu tin.\n2) Tạo mẫu theo kênh.\n3) Gắn vào chiến dịch.",
        "Không bắt buộc kết nối trước khi soạn mẫu.",
        "Hoạt động",
    ],
    [
        "Automation",
        "Tin nhắn tự động (Automation Flow)",
        "Luồng tự động: lead mới, chưa chạm, trước lịch hẹn, không đến… → gửi tin / tạo việc.",
        "1) Vào Tin nhắn tự động.\n2) Tạo flow, chọn sự kiện kích hoạt.\n3) Thêm bước gửi tin / chờ / điều kiện.\n4) Bật flow.\n5) Xem Nhật ký.",
        "Kênh gửi đã kết nối. Flow cần được duyệt trước khi chạy. Bước gửi tin cùng quy tắc dry-run như broadcast.",
        "Hoạt động (lưu flow/giả lập); gửi tin thật theo cờ live-send / allowlist",
    ],
    [
        "Automation",
        "Nhật ký automation",
        "Xem flow/chiến dịch đã chạy, thành công hay lỗi.",
        "1) Automation → Nhật ký.\n2) Lọc theo ngày / kênh.\n3) Mở chi tiết lỗi để sửa kết nối hoặc nội dung.",
        "Đã chạy ít nhất 1 flow/chiến dịch.",
        "Hoạt động",
    ],
    [
        "Automation",
        "Kết nối kênh nhắn tin",
        "Nối kênh dùng cho automation (Messenger, Zalo…). Tab API Cài đặt còn chỗ SMS/Email dạng khung.",
        "1) Automation → Kết nối kênh hoặc Cài đặt → Kết nối.\n2) Làm theo hướng dẫn từng kênh.\n3) Test gửi 1 tin.\n4) Quay lại bật flow.",
        "Token/OA hợp lệ. Tab API (Meta Ads/Google/SMS/Email) trên Cài đặt ghi rõ chỗ giữ chỗ — ads thật nằm ở /ads.",
        "Hoạt động một phần — Zalo OA & Fanpage thật; một số thẻ API còn khung MVP",
    ],
    [
        "Chatbot CSKH",
        "Tạo chatbot & kiến thức",
        "Bot trả lời khách theo kiến thức spa; có thể gắn với phễu.",
        "1) Chatbot CSKH → Chatbot — tạo bot.\n2) Tab Kiến thức — thêm câu hỏi/đáp hoặc dán tài liệu.\n3) Tab Cài đặt AI — giọng điệu, bật AI.\n4) Thử hội thoại.\n5) Gắn website hoặc Facebook.",
        "AI trả lời trừ credit. Nên có kiến thức trước khi bật AI.",
        "Hoạt động",
    ],
    [
        "Chatbot CSKH",
        "Kênh chat & gắn website",
        "Nhúng widget lên website; nối Facebook/Zalo inbox.",
        "1) Tab Kênh chat — thêm kênh.\n2) Tab Gắn lên website — copy mã nhúng.\n3) Dán vào website spa.\n4) Inbox sẽ hiện hội thoại.",
        "Website do bạn quản trị. Facebook cần kết nối fanpage.",
        "Hoạt động",
    ],
    [
        "Chatbot CSKH",
        "Hộp thư đa kênh",
        "Xem tin khách, AI trả hoặc nhân viên tiếp quản.",
        "1) Tab Hộp thư (hoặc menu Tin nhắn).\n2) Lọc kênh.\n3) Mở hội thoại — trả lời tay hoặc để AI.\n4) Bấm tiếp quản khi cần người thật.\n5) Lead từ chat vào tab Khách tiềm năng.",
        "Đã có kênh/widget. Credit khi AI trả lời.",
        "Hoạt động",
    ],
    [
        "Email Marketing",
        "Chiến dịch email",
        "Soạn, gửi, lên lịch email cho danh bạ; mẫu và tự động hóa CRM.",
        "1) Email Marketing → Chiến dịch.\n2) Chọn danh bạ / mẫu.\n3) Soạn (AI gợi ý tiêu đề trừ credit).\n4) Gửi thử rồi gửi / lên lịch.\n5) Xem Báo cáo mở / click.",
        "Xác thực tên miền gửi (SES/Brevo). Chiến dịch tạo ở trạng thái Nháp — phải bấm gửi. Danh bạ đã import.",
        "Hoạt động — gửi thật khi đã cấu hình nhà cung cấp email + domain",
    ],
    [
        "Email Marketing",
        "Danh bạ / Mẫu / Tự động hóa / Domain",
        "Quản lý người nhận, mẫu sẵn, kịch bản tự gửi, xác thực tên miền.",
        "1) Tab Danh bạ — import hoặc lấy từ CRM.\n2) Tab Mẫu — tạo mẫu.\n3) Tab Tên miền gửi — thêm domain, làm theo DNS.\n4) Tab Tự động hóa — gắn sự kiện CRM.\n5) Tab Báo cáo — xem hiệu quả.",
        "Quyền DNS của domain spa. Chưa xác thực domain thì không gửi ổn định.",
        "Hoạt động — cần cấu hình",
    ],
    [
        "Zalo OA",
        "Zalo Marketing (Broadcast / Tư vấn / ZBS)",
        "Gửi broadcast, tin tư vấn trong cửa sổ, dùng template ZBS; quản lý OA.",
        "1) Cài đặt → Kết nối — thêm Zalo OA (mã OA + secret).\n2) Vào Zalo Marketing.\n3) Tab OA kiểm tra kết nối.\n4) Soạn Broadcast hoặc Tin tư vấn.\n5) Xem Báo cáo gửi.",
        "Zalo OA đã duyệt. Khách follow OA. Ngoài cửa sổ phải dùng ZBS. Gửi thật theo MESSAGING_LIVE_SEND hoặc OA trong allowlist.",
        "Cần cấu hình — soạn/lên lịch được; gửi khách thật chỉ khi OA được bật live",
    ],
    # HR / Work
    [
        "Nhân sự (HRM)",
        "Danh sách nhân viên",
        "Hồ sơ nhân viên: chi nhánh, phòng ban, vai trò, trạng thái.",
        "1) Quản Lý Nhân Sự → Danh sách nhân viên.\n2) Thêm nhân viên (hoặc mời vào hệ thống nếu có tài khoản).\n3) Gán chi nhánh / vai trò.\n4) Dùng khi chia lead và lịch hẹn.",
        "Quyền HRM. Nên tạo chi nhánh ở Cài đặt hệ thống.",
        "Hoạt động",
    ],
    [
        "Nhân sự (HRM)",
        "Ca làm việc",
        "Đặt ca và gán nhân viên theo ngày.",
        "1) Vào Ca làm việc.\n2) Tạo ca (giờ bắt đầu/kết thúc).\n3) Gán nhân viên theo khoảng ngày.\n4) Dùng cho phân lead theo ca.",
        "Đã có nhân viên.",
        "Hoạt động",
    ],
    [
        "Nhân sự (HRM)",
        "Bảng công",
        "Xem / sửa công chấm.",
        "1) Vào Bảng công.\n2) Chọn tháng / nhân viên.\n3) Sửa giờ vào-ra nếu sai.\n4) Xuất xem tổng công.",
        "Nhân viên đã được gán ca.",
        "Hoạt động",
    ],
    [
        "Nhân sự (HRM)",
        "Phép & OT",
        "Duyệt nghỉ phép và ngoài giờ.",
        "1) Vào Phép & OT.\n2) Tạo đơn hoặc duyệt đơn.\n3) Theo dõi số ngày phép.",
        "Đã có nhân viên.",
        "Hoạt động",
    ],
    [
        "Công việc",
        "Dự án & việc (Kanban)",
        "Tạo dự án, việc, kéo cột trạng thái, giao người.",
        "1) Công việc & Dự án.\n2) Tạo dự án.\n3) Thêm việc, giao nhân viên, hạn.\n4) Kéo thẻ đổi trạng thái.\n5) Xem Việc của tôi / Lịch / Dashboard.",
        "Đăng nhập. Trial thường vẫn vào được module công việc.",
        "Hoạt động",
    ],
    [
        "Công việc",
        "Việc của tôi / Dashboard / Lịch",
        "Việc được giao cho bạn; thống kê; lịch hạn chót.",
        "1) Vào Việc của tôi — làm việc được giao.\n2) Dashboard — tiến độ dự án.\n3) Lịch công việc — xem hạn theo ngày.",
        "Đã được giao việc.",
        "Hoạt động",
    ],
    # Finance
    [
        "Tài chính",
        "Doanh thu & Lãi lỗ",
        "Tổng doanh thu, chi ads, chi phí khác, lãi ước tính theo ngày/chi nhánh.",
        "1) Vào Doanh thu & Lãi lỗ.\n2) Chọn khoảng ngày / chi nhánh.\n3) Xem các ô tổng.\n4) Tab chi phí — thêm khoản chi.\n5) Đối chiếu đơn hàng / báo cáo ads.",
        "Doanh thu lấy từ đơn/lịch đã ghi. Chi ads đầy đủ khi đã đồng bộ Ads.",
        "Hoạt động",
    ],
    [
        "Business Goals",
        "Mục tiêu kinh doanh",
        "Đặt mục tiêu (doanh thu, lead, ads) và xem khoảng cách thực tế; có gợi ý tính toán.",
        "1) Vào Mục tiêu kinh doanh.\n2) Tạo kịch bản mục tiêu (tháng, ngân sách ads…).\n3) Lưu và xem bảng kết quả.\n4) So với số liệu Ads/CRM.\n5) Xóa kịch bản cũ nếu không dùng.",
        "Nên kết nối Ads để số chi tiêu thật. Một số gợi ý là tính toán/AI, không tự chạy ads.",
        "Hoạt động — số liệu ads cần kết nối; phần gợi ý là đề xuất",
    ],
    [
        "Affiliate",
        "Giới thiệu bạn bè / hoa hồng",
        "Lấy link giới thiệu, xem người đăng ký, hoa hồng, rút về ngân hàng.",
        "1) Vào Affiliate.\n2) Copy link giới thiệu.\n3) Chia sẻ; xem tab Người giới thiệu / Hoa hồng.\n4) Tab Ngân hàng — lưu STK.\n5) Yêu cầu rút khi đủ số tối thiểu.",
        "Tài khoản đã có mã affiliate. Hoa hồng sau thời gian giữ (hold days).",
        "Hoạt động",
    ],
    [
        "Billing / Gói",
        "Bảng giá & thanh toán SePay",
        "Xem gói, dùng thử, tạo đơn chuyển khoản, kích hoạt khi thanh toán.",
        "1) Vào Bảng giá.\n2) Bật dùng thử (nếu còn suất) hoặc chọn gói.\n3) Tạo đơn — chuyển khoản đúng nội dung.\n4) Đợi hệ thống nhận (SePay) hoặc liên hệ admin.\n5) Quay lại Tổng quan kiểm tra hạn gói.",
        "Chưa hết hạn trial/gói thì vào hầu hết tính năng. Hết hạn bị chuyển về Bảng giá.",
        "Hoạt động",
    ],
    [
        "Billing / Credit",
        "AI Credit",
        "Xem số credit, lịch sử trừ (tạo content, chatbot, phiên âm…), mua thêm.",
        "1) Vào AI Credit.\n2) Xem số còn lại và lịch sử.\n3) Chọn gói credit nếu hết.\n4) Thanh toán như gói đăng ký.\n5) Credit = 0 thì các nút AI bị khóa.",
        "Gói/trial có thể tặng credit ban đầu.",
        "Hoạt động",
    ],
    [
        "Báo cáo",
        "Báo cáo marketing (CPL, đặt lịch)",
        "Bảng chiến dịch: chi tiêu, lead, CPL, số đặt lịch.",
        "1) Vào Báo cáo.\n2) Xem từng chiến dịch / nền tảng.\n3) So với Ads và Attribution nếu thiếu số.",
        "Có dữ liệu ads + lead gắn chiến dịch. Trống nếu chưa đồng bộ ads.",
        "Hoạt động — cần dữ liệu ads/lead",
    ],
    # Settings
    [
        "Cài đặt",
        "Tài khoản (Account)",
        "Đổi thông tin đăng nhập / hồ sơ người dùng.",
        "1) Cài đặt → Account.\n2) Cập nhật tên, mật khẩu.\n3) Lưu.",
        "Đăng nhập.",
        "Hoạt động",
    ],
    [
        "Cài đặt",
        "AI Knowledge Base",
        "Kho kiến thức cho trợ lý / chatbot (tài liệu spa, giá, FAQ).",
        "1) Cài đặt → AI Knowledge Base (hoặc /knowledge-base).\n2) Thêm tài liệu / câu hỏi.\n3) Chatbot và trợ lý dùng khi trả lời.",
        "Quyền quản lý kiến thức. AI query trừ credit.",
        "Hoạt động",
    ],
    [
        "Cài đặt",
        "Kết nối Zalo OA",
        "Lưu mã OA và secret để Zalo Marketing / tin tự động.",
        "1) Cài đặt → Kết nối.\n2) Nhập mã OA + mã bảo mật.\n3) Lưu (mã hóa trên server).\n4) Test ở Zalo Marketing.",
        "Tài khoản Zalo Official Account.",
        "Hoạt động — cần cấu hình",
    ],
    [
        "Cài đặt",
        "API / Tích hợp dịch vụ",
        "Chỗ kết nối SMS, Email SMTP, và thẻ Meta/Google Ads (ads thật nằm trang Ads).",
        "1) Cài đặt → API.\n2) Xem trạng thái từng dịch vụ.\n3) Điền thông tin nếu dùng SMS/Email SMTP.\n4) Test kết nối.\n5) Ads: dùng trang Ads, không điền key tại đây.",
        "UI ghi rõ một số thẻ còn khung MVP, chưa phải API ads thật.",
        "Chưa hoàn thiện / khung MVP (trừ hướng dẫn dùng /ads cho quảng cáo)",
    ],
    [
        "Cài đặt",
        "Hệ thống tổ chức (System)",
        "Tên spa, SĐT, email, địa chỉ — dùng trên form/hóa đơn.",
        "1) Cài đặt → System.\n2) Sửa tên / liên hệ spa.\n3) Lưu (cần quyền settings.manage hoặc chủ spa).",
        "Vai trò OWNER / SUPER_ADMIN / quyền settings.manage.",
        "Hoạt động",
    ],
    # Auth
    [
        "Tài khoản",
        "Đăng ký / Đăng nhập",
        "Tạo tài khoản bằng email + OTP hoặc Google; đăng nhập vào spa.",
        "1) Vào /register — điền email, mật khẩu, tên spa.\n2) Nhận OTP email, xác nhận.\n3) Hoặc Đăng nhập Google.\n4) Vào /login lần sau.\n5) Ra Bảng giá để bật dùng thử.",
        "Email nhận OTP. Google login cần cấu hình OAuth phía hệ thống.",
        "Hoạt động",
    ],
    # Admin
    [
        "Quản trị nền tảng (chỉ SUPER_ADMIN)",
        "Admin: tổ chức, user, gói, SePay, affiliate, job, audit",
        "Vận hành SaaS: xem spa, gia hạn gói, tặng credit, đối soát thanh toán.",
        "1) Vào /admin (chỉ tài khoản quản trị nền tảng).\n2) Tổ chức / User / Gói / Thanh toán.\n3) Tặng credit hoặc đổi gói khi cần hỗ trợ khách.\n4) Xem Nhật ký hệ thống nếu lỗi.",
        "Vai trò SUPER_ADMIN. Không hiện trên menu spa thường.",
        "Hoạt động — nội bộ vận hành, không phải tính năng spa",
    ],
]

QUICK_START = [
    ["Bước", "Việc cần làm", "Vào đâu", "Ghi chú"],
    [
        "1. Đăng ký",
        "Tạo tài khoản bằng email + mã OTP, hoặc Đăng nhập Google.",
        "/register rồi /login",
        "Sau đăng ký vào Bảng giá để mở dùng thử.",
    ],
    [
        "2. Thiết lập doanh nghiệp",
        "Đặt tên spa, SĐT, địa chỉ. Thêm chi nhánh nếu có. Thêm nhân viên.",
        "Cài đặt → System; HRM → Nhân viên",
        "Cần để chia lead và đặt lịch đúng người.",
    ],
    [
        "3. Kết nối kênh",
        "Nối Fanpage (đăng bài + inbox). Nối Zalo OA nếu dùng Zalo. Nối Facebook/Google Ads nếu xem quảng cáo. Xác thực domain nếu gửi email.",
        "Content → Kết nối Fanpage; Cài đặt → Kết nối; Ads → Kết nối; Email → Tên miền",
        "Chưa nối kênh vẫn dùng CRM/phễu/content nháp.",
    ],
    [
        "4. Import / nhập khách hàng",
        "Thêm khách, lead tay; hoặc để form phễu / chatbot thu giúp.",
        "Khách hàng, Lead, Phễu → form công khai",
        "SĐT Việt Nam 10 số để form/CRM nhận đúng.",
    ],
    [
        "5. Tạo nội dung / chiến dịch",
        "Tạo bài bằng AI, lưu thư viện, Auto Post hoặc lên lịch. Tạo phễu và bật chạy. Soạn email/Zalo nếu đã nối.",
        "Content Studio; Phễu Marketing; Email; Zalo; Broadcast",
        "AI trừ Credit. Đăng Fanpage là đăng thật. Ads AI chỉ nháp.",
    ],
    [
        "6. Automation",
        "Bật flow: lead mới → tin chào; trước lịch hẹn → nhắc; không đến → tin lại.",
        "Tin nhắn tự động",
        "Chỉ gửi được khi kênh đã nối và khách đủ điều kiện.",
    ],
    [
        "7. Theo dõi kết quả",
        "Xem Tổng quan, Lead, Phễu → Phân tích, Báo cáo, Attribution, Ads, Tài chính.",
        "Tổng quan / Báo cáo / Ads / Attribution",
        "ROAS/CPL đủ khi vừa có lead vừa đồng bộ chi ads.",
    ],
]

TOP10 = [
    ["#", "Tính năng", "Vì sao nên thử trước", "Đường dẫn"],
    [
        "1",
        "Tổng quan + dùng thử / gói",
        "Biết spa đã vào hệ thống, còn ngày dùng thử và credit.",
        "/overview và /pricing",
    ],
    [
        "2",
        "Cài đặt tên spa + nhân viên",
        "Mọi lead/lịch hẹn gắn đúng cơ sở và người phụ trách.",
        "/settings?tab=system và /hrm/employees",
    ],
    [
        "3",
        "Lead + Khách hàng",
        "Trái tim vận hành hàng ngày — nhập 1 lead thử.",
        "/leads và /customers",
    ],
    [
        "4",
        "Phễu Marketing + form công khai",
        "Thu lead thật từ Facebook/Zalo bio chỉ với 1 link.",
        "/funnel",
    ],
    [
        "5",
        "Tạo content AI + lưu thư viện",
        "Thấy ngay giá trị AI (trừ credit).",
        "/content?tab=create",
    ],
    [
        "6",
        "Kết nối Fanpage + Auto Post",
        "Đăng 1 bài thử lên page thật.",
        "/content?tab=channels rồi /content?tab=auto-post",
    ],
    [
        "7",
        "Chatbot CSKH + gắn website hoặc inbox",
        "Trả lời khách 24/7, lead từ chat vào CRM.",
        "/chatbot-cskh",
    ],
    [
        "8",
        "Nhắn tin hàng loạt / Automation Flow",
        "Chăm lead sau form mà không gửi tay từng người.",
        "/automation?tab=campaigns và /automation?tab=flows",
    ],
    [
        "9",
        "Ads — kết nối và xem chiến dịch",
        "Thấy chi tiêu thật. Nhớ: hệ thống chưa tự pause/publish ads.",
        "/ads",
    ],
    [
        "10",
        "Báo cáo + Mục tiêu kinh doanh",
        "Khép vòng: tiền ads → lead → lịch → doanh thu.",
        "/reports và /business-goals",
    ],
]

CLASSIFY = [
    ["Phân loại", "Tính năng", "Ý nghĩa với người dùng"],
    [
        "Đang chạy thật",
        "CRM Lead/Khách, Lịch hẹn, Form phễu ACTIVE, Auto Post Fanpage (OAuth đang bật), Chatbot inbox/web, Email khi SES/Brevo+domain, HRM, Công việc, Billing SePay, Affiliate, Báo cáo/Attribution khi có data, Ads đọc/đồng bộ số liệu",
        "Dữ liệu vào DB/CRM hoặc gửi ra kênh thật khi đã cấu hình.",
    ],
    [
        "Chỉ nháp / AI đề xuất / dry-run",
        "Tạo phễu AI chưa kích hoạt; bản nháp ads; Check Content Ads; rule ads đề xuất; trợ lý soạn trả lời inbox (không gửi Meta); broadcast/Zalo/automation gửi tin khi không thuộc allowlist (MESSAGING_LIVE_SEND=false)",
        "Thấy trong app hoặc log dry-run. Khách không nhận tin / ads không đổi trên nền tảng.",
    ],
    [
        "Chưa được phép tự publish/write ads",
        "Pause/Enable/Budget/Publish draft lên Meta/Google",
        "Cờ hệ thống ADS_ACTIONS_LIVE và ADS_ACTIONS_PROVIDER_WRITE đang tắt. Cần người duyệt + admin bật mới ghi lên nền tảng.",
    ],
    [
        "Cần cấu hình mới dùng đủ",
        "Fanpage, Zalo OA, Facebook/Google Ads OAuth, Domain email, Gmail báo cáo, OpenAI (server)",
        "Menu vẫn mở; thiếu kết nối thì trống số liệu hoặc không gửi được.",
    ],
    [
        "Chưa hoàn thiện / khung",
        "Cài đặt → API: thẻ Meta Ads / Google Ads / SMS / Email SMTP ghi MVP placeholder",
        "Không dùng chỗ này để nối ads thật — dùng trang Ads.",
    ],
    [
        "Không có trên menu",
        "Không có mục tên đúng “Marketing Autopilot”",
        "Phần gần nhất: Ads → Auto Mode & Rule, và Content → Auto Post.",
    ],
]

MENU = [
    ["Nhóm menu", "Mục", "Đường dẫn"],
    ["Tổng quan", "Tổng quan", "/overview"],
    ["CRM & Khách hàng", "Khách hàng", "/customers"],
    ["CRM & Khách hàng", "Lead", "/leads"],
    ["CRM & Khách hàng", "Phễu Marketing", "/funnel"],
    ["Lịch hẹn", "Lịch hẹn & Dịch vụ", "/appointments"],
    ["Content Marketing", "Tạo content", "/content?tab=create&section=ad"],
    ["Content Marketing", "Xây dựng thương hiệu", "/content?tab=create&section=personal"],
    ["Content Marketing", "Check Content Ads", "/content?tab=create&section=facebook-check"],
    ["Content Marketing", "Lấy văn bản từ video", "/content?tab=create&section=video-transcript"],
    ["Content Marketing", "Thư viện bài viết", "/content?tab=library"],
    ["Content Marketing", "Auto Post", "/content?tab=auto-post"],
    ["Content Marketing", "Lịch đăng", "/content?tab=schedule"],
    ["Content Marketing", "Kết nối Fanpage", "/content?tab=channels"],
    ["Content Marketing", "Kịch bản quay video", "/teleprompter"],
    ["Quảng cáo", "Ads", "/ads"],
    ["Quảng cáo", "Attribution & ROAS", "/attribution"],
    ["Tin nhắn & Chatbot", "Nhắn tin hàng loạt", "/automation?tab=campaigns"],
    ["Tin nhắn & Chatbot", "Tệp khách hàng", "/automation?tab=audience"],
    ["Tin nhắn & Chatbot", "Tin nhắn tự động", "/automation?tab=flows"],
    ["Tin nhắn & Chatbot", "Chatbot CSKH", "/chatbot-cskh"],
    ["Tin nhắn & Chatbot", "Email Marketing", "/email-marketing"],
    ["Tin nhắn & Chatbot", "Zalo Marketing", "/zalo-marketing"],
    ["Nhân sự", "Danh sách nhân viên", "/hrm/employees"],
    ["Nhân sự", "Ca làm việc", "/hrm/shifts"],
    ["Nhân sự", "Bảng công", "/hrm/attendance"],
    ["Nhân sự", "Phép & OT", "/hrm/leave"],
    ["Nhân sự", "Công việc & Dự án", "/work-management"],
    ["Nhân sự", "Việc của tôi", "/work-management/my"],
    ["Nhân sự", "Dashboard công việc", "/work-management/dashboard"],
    ["Nhân sự", "Lịch công việc", "/work-management/calendar"],
    ["Tài chính", "Doanh thu & Lãi lỗ", "/finance"],
    ["Tài chính", "Mục tiêu kinh doanh", "/business-goals"],
    ["Tài chính", "Affiliate", "/affiliate"],
    ["Tài chính", "Bảng giá", "/pricing"],
    ["Tài chính", "AI Credit", "/credits"],
    ["Báo cáo", "Báo cáo", "/reports"],
    ["Cài đặt", "Account", "/settings?tab=account"],
    ["Cài đặt", "AI Knowledge Base", "/settings?tab=knowledge"],
    ["Cài đặt", "Kết nối", "/settings?tab=connections"],
    ["Cài đặt", "API", "/settings?tab=api"],
    ["Cài đặt", "System", "/settings?tab=system"],
    ["Cài đặt", "Phân lead & SLA", "/settings?tab=assignment"],
    ["Khác (có trang, không luôn hiện sidebar)", "Tin nhắn / Inbox", "/messages"],
    ["Khác", "Form phễu công khai", "/f/[id]"],
    ["Khác", "Đăng nhập / Đăng ký", "/login , /register"],
    ["Admin nền tảng", "Chỉ SUPER_ADMIN", "/admin …"],
]

INTRO = [
    ["Mục", "Nội dung"],
    [
        "Tên tài liệu",
        "Danh sách tính năng + Hướng dẫn sử dụng nhanh — MarketingAutoAZ",
    ],
    [
        "Ngày xuất",
        dt.date.today().strftime("%d/%m/%Y"),
    ],
    [
        "Cách làm tài liệu",
        "Quét menu sidebar, route Next.js, tab từng trang, module API đang có trong code. Không ghi tính năng chưa có.",
    ],
    [
        "Không có trên menu",
        "Không có mục tên “Marketing Autopilot”. Phần gần nhất: Ads → Auto Mode & Rule và Content → Auto Post.",
    ],
    [
        "Gói & trial",
        "Hết hạn gói/trial bị khóa hầu hết API (trừ thanh toán). Trial có thể chặn một số module theo cấu hình admin (mặc định hay mở content, auto-post, phiên âm, công việc).",
    ],
    [
        "Ads write",
        "Hiện hệ thống tắt ghi lên Facebook/Google Ads (ADS_ACTIONS_LIVE=false, ADS_ACTIONS_PROVIDER_WRITE=false). Đồng bộ số liệu và xem chiến dịch vẫn dùng được khi đã OAuth.",
    ],
    [
        "Tin nhắn hàng loạt / Zalo",
        "MESSAGING_LIVE_SEND=false. Gửi thật chỉ với Fanpage/OA nằm trong allowlist (MESSAGING_LIVE_PAGE_IDS / MESSAGING_LIVE_OA_IDS). Các kênh khác là dry-run.",
    ],
    [
        "Cấu trúc bảng chính",
        "NHÓM TÍNH NĂNG | TÍNH NĂNG | MỤC ĐÍCH | CÁCH DÙNG NHANH | ĐIỀU KIỆN | TRẠNG THÁI",
    ],
]


def col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def cell_xml(r: int, c: int, value: str, header: bool = False) -> str:
    ref = f"{col_letter(c)}{r}"
    style = ' s="1"' if header else ""
    t = escape(value).replace("\n", "&#10;")
    return f'<c r="{ref}" t="inlineStr"{style}><is><t xml:space="preserve">{t}</t></is></c>'


def sheet_xml(name: str, rows: list[list[str]], col_widths: list[float]) -> str:
    max_c = max(len(r) for r in rows)
    max_r = len(rows)
    cols = "".join(
        f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>'
        for i, w in enumerate(col_widths, 1)
    )
    row_xml = []
    for ri, row in enumerate(rows, 1):
        cells = "".join(cell_xml(ri, ci, (row[ci - 1] if ci - 1 < len(row) else ""), ri == 1) for ci in range(1, max_c + 1))
        ht = 18 if ri == 1 else min(90, 16 + 12 * max((c.count("\n") for c in row), default=0))
        row_xml.append(f'<row r="{ri}" ht="{ht}" customHeight="1">{cells}</row>')
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>{cols}</cols>
  <sheetData>{''.join(row_xml)}</sheetData>
  <pageSetup orientation="landscape" paperSize="9"/>
</worksheet>"""


def workbook_xml(sheets: list[str]) -> str:
    parts = []
    for i, name in enumerate(sheets, 1):
        parts.append(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>')
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>{''.join(parts)}</sheets>
</workbook>"""


def rels_xml(n: int) -> str:
    items = []
    for i in range(1, n + 1):
        items.append(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
        )
    items.append(
        '<Relationship Id="rIdStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{''.join(items)}
</Relationships>"""


STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0A3D30"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="2">
    <xf xfId="0"/>
    <xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment wrapText="1" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>
"""

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
"""


def main() -> None:
    header = [
        "NHÓM TÍNH NĂNG",
        "TÍNH NĂNG",
        "MỤC ĐÍCH",
        "CÁCH DÙNG NHANH",
        "ĐIỀU KIỆN",
        "TRẠNG THÁI",
    ]
    feature_rows = [header] + FEATURES

    sheets: list[tuple[str, list[list[str]], list[float]]] = [
        ("Huong dan doc", INTRO, [28, 90]),
        ("Bat dau nhanh", QUICK_START, [16, 55, 40, 50]),
        ("Top 10", TOP10, [6, 36, 55, 40]),
        ("Danh sach tinh nang", feature_rows, [22, 38, 48, 58, 42, 42]),
        ("Phan loai that-nhap-write", CLASSIFY, [32, 70, 55]),
        ("Menu va duong dan", MENU, [36, 36, 50]),
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    ct = CONTENT_TYPES
    for i in range(1, len(sheets) + 1):
        ct += f'  <Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\n'
    ct += "</Types>\n"

    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""

    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook_xml([s[0] for s in sheets]))
        z.writestr("xl/_rels/workbook.xml.rels", rels_xml(len(sheets)))
        z.writestr("xl/styles.xml", STYLES)
        for i, (_name, rows, widths) in enumerate(sheets, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", sheet_xml(_name, rows, widths))

    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes) sheets={len(sheets)} features={len(FEATURES)}")


if __name__ == "__main__":
    main()
