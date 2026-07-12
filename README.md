# 🩺 GastroVision AI

> Đồ án tốt nghiệp — Hệ thống nhận diện ảnh nội soi đường tiêu hoá & phân đoạn polyp.

Web app hỗ trợ:
- 🔬 **Phân loại** ảnh nội soi thành 8 lớp bệnh bằng **ResNet-50 + Linear SVM**
- 🎯 **Phân đoạn polyp** (polyp segmentation) bằng **DeepLabV3+**
- 📊 **Xuất báo cáo PDF** với kết quả dự đoán & ảnh minh hoạ
- 🌐 Giao diện React + Vite + TypeScript, gọi FastAPI backend

---

## 🚀 Bắt đầu nhanh

Xem hướng dẫn cài đặt **từng bước** tại **[INSTALL.md](./INSTALL.md)** (15–25 phút).

Tóm tắt nhanh:

```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate   # hoặc .venv\Scripts\Activate.ps1 trên Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (terminal khác)
cd frontend && npm install && npm run dev
```

Mở `http://localhost:5173` để dùng.

> ⚠️ Cần tải model từ Google Drive trước — xem **[MODEL_LINKS.md](./MODEL_LINKS.md)**.

---

## 📦 Nội dung repo

```
gastrovision-ai/
├── backend/         # FastAPI server (Python 3.10+)
├── frontend/        # React + Vite UI (Node.js 18+)
├── artifacts/
│   └── models/      # Model checkpoints (tải từ Google Drive)
├── docs/
│   └── bao_cao.pdf  # Báo cáo ĐATN đã chỉnh sửa
├── INSTALL.md       # Hướng dẫn cài đặt chi tiết
├── MODEL_LINKS.md   # Link Google Drive chứa model
└── README.md        # File này
```

---

## 📚 Tài liệu tham khảo trong repo

| File | Mô tả |
|---|---|
| **[INSTALL.md](./INSTALL.md)** | Hướng dẫn cài đặt & chạy chi tiết từng bước |
| **[MODEL_LINKS.md](./MODEL_LINKS.md)** | Link Google Drive tải model |
| **[docs/bao_cao.pdf](./docs/bao_cao.pdf)** | Báo cáo ĐATN (bản PDF) |

---

## 🎥 Video demo

Video thuyết minh demo sản phẩm: **<dán link YouTube/Google Drive vào đây sau khi quay xong>**

---

## 🛠️ Công nghệ sử dụng

**Backend:** Python 3.10 · FastAPI · PyTorch · TensorFlow/Keras · scikit-learn · Pillow · NumPy

**Frontend:** React 19 · TypeScript · Vite 7 · jsPDF · lucide-react

**Model AI:**
- Feature extractor: **ResNet-50** (ImageNet pre-trained, ImageNet weights — fine-tuned trên tập nội soi)
- Classifier: **Linear SVM** (one-vs-rest) trên vector 2048-d
- Segmentation: **DeepLabV3+** (encoder ResNet-50, output binary mask cho polyp)

---

## 📄 Báo cáo ĐATN

Xem file **[docs/bao_cao.pdf](./docs/bao_cao.pdf)** trong repo.

---

## 👤 Tác giả

- **Họ tên:** Nguyễn Tường Vi
- **GitHub:** [@NT-TuongVi2202](https://github.com/NT-TuongVi2202)
- **Trường:** *(bổ sung thông tin nếu cần)*

---

## 📜 License

Sản phẩm ĐATN — chỉ sử dụng cho mục đích học thuật.
