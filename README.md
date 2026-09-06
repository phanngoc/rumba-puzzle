# ☀️🌙 Rumba — puzzle logic nhị phân

Puzzle lưới N×N thuộc họ **Binairo / Tohu-wa-Vohu** (cùng họ với "Tango"): điền mặt trời ☀️ và
mặt trăng 🌙 sao cho thoả mọi ràng buộc. Vanilla JS, không dependency, chơi được offline.

**Chơi thử: https://rumba.bomclaw.org**

## Luật
1. **Cân bằng** — mỗi hàng và mỗi cột có số ☀️ bằng số 🌙.
2. **Không 3 liên tiếp** — không được có 3 ô giống nhau kề nhau theo hàng hoặc cột.
3. **Ràng buộc cạnh** — `=` hai ô bằng nhau, `×` hai ô khác nhau.
4. Mỗi đề có **đúng một nghiệm**, và giải được **bằng suy luận thuần** — không cần thử-sai.

## Tính năng
- Lưới **6×6** và **8×8**, ba độ khó easy / medium / hard.
- Chế độ **daily** (đề theo ngày, ai cũng chung một đề) và free play.
- Gợi ý theo bước suy luận, đồng hồ, lưu kỷ lục cá nhân.
- Đề sinh có seed → tái lập được.

## Chạy
```bash
node server.js        # mặc định PORT=8788, HOST=127.0.0.1
```
Mở `http://127.0.0.1:8788` — hoặc mở thẳng `index.html`.

## Cấu trúc
| File | Vai trò |
|---|---|
| `engine.js` | Logic thuần: sinh đề, solver kiểm tra **nghiệm duy nhất**, logic solver cho gợi ý. Không chạm DOM. |
| `game.js` | UI: render lưới, input, đồng hồ, kỷ lục |
| `index.html` | UI dark portrait tiếng Việt |
| `server.js` | Static file server zero-dependency |

Tách engine khỏi UI là có chủ đích: sửa giao diện không thể làm sai luật, và solver kiểm tra
nghiệm duy nhất chạy được độc lập trên hàng nghìn seed.

## License
MIT
