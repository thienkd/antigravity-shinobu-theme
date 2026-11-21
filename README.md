# 🦋 Antigravity Custom Theme — Shinobu Wisteria & Interactive Chibi NPC

Bộ tùy biến giao diện **60fps Zero-Live-Blur** dành cho ứng dụng **Google Antigravity 2.x** (đóng gói đồng thời làm **AI Agent Skill**), tích hợp sẵn chủ đề **Shinobu Wisteria**, lớp **Live Wallpaper** và **NPC Chibi Shinobu Kocho tương tác & trò chuyện 2 chiều** ngay trên góc khung hội thoại mà không sửa đổi tệp nhị phân của ứng dụng.

---

## ✨ Tính năng nổi bật

- **Chủ đề mặc định `Shinobu Wisteria`** *(kèm thêm `WLOP Cosmic` & `Midnight Obsidian`)*:
  - Hình nền **Shinobu Kocho** dưới ánh trăng tròn & giàn hoa tử đằng tím, kiến trúc kính mờ dựng sẵn (**Zero Live Blur** — cuộn mượt 60/120fps).
  - **Live Wallpaper 60fps**: Bướm phát sáng tím–xanh ngọc vỗ cánh bay lượn, cánh hoa tử đằng rơi, đom đóm lơ lửng và sao băng xẹt qua bầu trời đêm.
  - **Iridescent Composer Strip**: Dải màu chuyển sắc tím – hồng – xanh ngọc trên thanh Composer cùng bộ Avatar tròn đồng bộ (User: Cánh bướm neon, AI: Shinobu Kocho).
- **NPC Chibi Shinobu Kocho (`themes/assets/shinobu_ornament.svg`)**:
  - Ngồi tựa hai bàn tay lên góc phải của cả **khung nhập Composer** (`.surface-composer`) và **bong bóng tin nhắn đã gửi** (`.group/user-input-step`).
  - Chuyển động nghiêng người nhẹ nhàng (`chibiSway`) + bướm vỗ cánh (`wingFlapL` / `wingFlapR`), nảy vui vẻ khi chạm vào.
- **Hộp thoại RPG & Chat 2 chiều (`Shinobu Kocho • NPC`)**:
  - Hiệu ứng gõ chữ từng ký tự (*Visual Novel style*).
  - 4 nút tương tác nhanh: `✨ Cổ vũ`, `🍵 Pha trà`, `🦋 Điệp Phủ`, `💬 Trò chuyện`.
  - Nhắn tin Tiếng Việt 2 chiều theo ngữ cảnh trực tiếp với Shinobu, nút đổi câu ngẫu nhiên `🎲`, tạm dừng chuyển động `⏸`/`▶`, thu gọn thành huy hiệu `🦋 Shinobu` (`✕`).
- **Tự biên dịch linh hoạt**: Hỗ trợ cả Node.js thuần (`scripts/build_payload.js`) lẫn Python (`scripts/build_payload.py`) — sang máy mới **chỉ cần Node.js >= 22** (không bắt buộc cài Python).

---

## 🚀 Cài đặt nhanh trên máy mới (1 bước)

> **Yêu cầu duy nhất:** Máy có **Git** và **Node.js >= 22** (`node -v`).

### Trên Windows (PowerShell)

Mở **PowerShell** và dán cụm lệnh sau để vừa tải về thư mục Skill toàn cục của Antigravity vừa tự động biên dịch & kích hoạt giao diện chạy ngầm:

```powershell
git clone https://github.com/thienkd/antigravity-shinobu-theme.git "$HOME\.gemini\config\skills\antigravity-custom-theme"
powershell -ExecutionPolicy Bypass -File "$HOME\.gemini\config\skills\antigravity-custom-theme\scripts\install-win.ps1"
```

**Sau khi chạy lệnh lần đầu tiên:**
1. Nhìn xuống khay hệ thống góc dưới bên phải Windows (**System Tray**), bấm chuột phải vào biểu tượng **Antigravity** → chọn **`Quit`** (Thoát hẳn).
2. Mở lại **Antigravity** từ **Desktop** hoặc **Start Menu** *(nếu dùng icon ghim dưới Taskbar, hãy bỏ ghim cũ rồi ghim lại từ Start Menu để nhận cờ `--remote-debugging-port=0`)*.
3. Giao diện **Shinobu Wisteria** và **NPC Chibi Shinobu** sẽ tự động hiện lên! Bấm mục **`Custom theme`** ở thanh bên trái để mở bảng **Custom Theme Studio** tùy chỉnh bất cứ lúc nào.

---

### Trên macOS / Linux (Terminal)

```bash
git clone https://github.com/thienkd/antigravity-shinobu-theme.git "$HOME/.gemini/config/skills/antigravity-custom-theme"
bash "$HOME/.gemini/config/skills/antigravity-custom-theme/scripts/install-unix.sh"
```

*(Khởi chạy Antigravity kèm cờ `--remote-debugging-port=0`, ví dụ trên macOS: `open -a Antigravity --args --remote-debugging-port=0`).*

---

## 🔄 Cập nhật giao diện khi có chỉnh sửa mới

Khi kéo bản cập nhật mới từ GitHub về máy khác:

```powershell
cd "$HOME\.gemini\config\skills\antigravity-custom-theme"
git pull
node scripts/build_payload.js
```

*(Daemon đang chạy ngầm sẽ tự phát hiện `dist/theme_payload.js` mới và hot-reload trực tiếp lên cửa sổ Antigravity ngay lập tức mà không cần khởi động lại app!)*

---

## 🧹 Gỡ cài đặt (Khôi phục Antigravity mặc định)

```powershell
node "$HOME\.gemini\config\skills\antigravity-custom-theme\scripts\uninstall.js"
```

---

## 📄 Giấy phép & Ghi công

Phát hành theo giấy phép **MIT**, phát triển mở rộng dựa trên kiến trúc gốc của [antigravity-custom-theme-skill](https://github.com/giakiet22102006/antigravity-custom-theme-skill).
