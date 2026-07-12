# Hướng dẫn cài đặt & chạy GastroVision AI

Tài liệu này hướng dẫn **từng bước** để cài đặt và chạy sản phẩm ĐATN **GastroVision AI** — hệ thống nhận diện ảnh nội soi đường tiêu hoá (ResNet-50 + Linear SVM) kết hợp phân đoạn polyp (DeepLabV3+).

> Thời gian cài đặt ước tính: **15–25 phút** (tuỳ tốc độ mạng và máy).

---

## 1. Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu | Ghi chú |
|---|---|---|
| **OS** | Windows 10/11, macOS 12+, Ubuntu 20.04+ | Đã test trên Windows 11 |
| **Python** | 3.10 – 3.11 | TensorFlow 2.15 chưa hỗ trợ 3.12+ ổn định |
| **Node.js** | 18 LTS trở lên | Cần cho frontend (Vite + React) |
| **npm** | 9 trở lên | Đi kèm Node.js |
| **RAM** | 8 GB trở lên | Khuyến nghị 16 GB nếu chạy model segmentation |
| **Ổ cứng trống** | ~5 GB | Cho venv + node_modules + model checkpoints |
| **GPU (tuỳ chọn)** | NVIDIA CUDA 11.8+ | Inference vẫn chạy trên CPU, nhưng chậm hơn |

---

## 2. Tải source code

```bash
git clone https://github.com/NT-TuongVi2202/gastrovision-ai.git
cd gastrovision-ai
```

Nếu dùng GitHub Desktop / VS Code: **File → Clone repository** rồi dán URL trên.

---

## 3. Tải model (file `.keras`, `.pkl`)

Vì mỗi model vài chục đến vài trăm MB, repo không chứa trực tiếp. Tải từ Google Drive:

🔗 **Link tải model:** xem file [`MODEL_LINKS.md`](./MODEL_LINKS.md)

Sau khi tải về, **copy các file vào đúng vị trí** trong repo:

```
gastrovision-ai/
└── artifacts/
    └── models/
        ├── segmentation/
        │   └── deeplabv3plus_polyp_final_benchmark.keras
        └── svm_classifier/
            ├── svm_model.pkl
            ├── scaler.pkl
            └── labels.json (đã có sẵn trong repo)
```

Nếu tên file khác, đổi tên cho khớp hoặc cập nhật đường dẫn trong `backend/.env`.

---

## 4. Cài đặt Backend (FastAPI + PyTorch + TensorFlow)

### 4.1. Tạo virtual environment

```bash
cd backend
python -m venv .venv
```

**Kích hoạt venv:**

- Windows (PowerShell):
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- Windows (CMD):
  ```bat
  .venv\Scripts\activate.bat
  ```
- macOS / Linux:
  ```bash
  source .venv/bin/activate
  ```

### 4.2. Cài dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> ⚠️ PyTorch và TensorFlow khá nặng (~1.5 GB). Nếu **chỉ chạy inference** (không train):
> ```bash
> pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
> pip install tensorflow-cpu
> ```

### 4.3. Kiểm tra

```bash
python -c "import torch, tensorflow, fastapi, sklearn; print('OK', torch.__version__, tensorflow.__version__)"
```

---

## 5. Cài đặt Frontend (React + Vite + TypeScript)

Mở **terminal mới**:

```bash
cd frontend
npm install
```

Nếu gặp lỗi peer dependency:
```bash
npm install --legacy-peer-deps
```

---

## 6. Cấu hình biến môi trường

### 6.1. Backend `.env`

```bash
cd backend
cp .env.example .env
# Sửa các đường dẫn trong .env cho khớp với máy của bạn
```

Các biến quan trọng:
```env
SVM_MODEL_PATH=./artifacts/models/svm_classifier/svm_model.pkl
SVM_SCALER_PATH=./artifacts/models/svm_classifier/scaler.pkl
SEG_MODEL_PATH=./artifacts/models/segmentation/deeplabv3plus_polyp_final_benchmark.keras
```

### 6.2. Frontend `.env`

```bash
cd frontend
cp .env.example .env
```

Mặc định:
```env
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8080
```

---

## 7. Chạy ứng dụng

### 7.1. Khởi động Backend

```bash
cd backend
source .venv/bin/activate   # hoặc .venv\Scripts\Activate.ps1 trên Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

API docs tự động: **http://localhost:8080/docs**

### 7.2. Khởi động Frontend

Mở terminal mới:
```bash
cd frontend
npm run dev
```

Mở trình duyệt: **http://localhost:5173** (hoặc 5174 nếu 5173 đã bận)

---

## 8. Kiểm tra nhanh

1. Truy cập `http://localhost:5173` — giao diện upload ảnh hiện ra.
2. Upload 1 ảnh nội soi bất kỳ (JPG/PNG, < 10 MB).
3. Bấm **"Phân tích"**.
4. Kết quả hiển thị:
   - **Phân loại**: tên lớp + độ tin cậy (%)
   - **Phân đoạn**: ảnh có vùng polyp được khoanh vùng

---

## 9. Cấu trúc thư mục repo

```
gastrovision-ai/
├── backend/                # FastAPI server
│   ├── app/
│   ├── training/
│   ├── tests/
│   ├── storage/
│   ├── requirements.txt
│   └── .env.example
├── frontend/               # React + Vite UI
│   ├── src/
│   ├── package.json
│   └── .env.example
├── artifacts/
│   └── models/             # Model checkpoints (tải từ Google Drive)
├── docs/                   # Tài liệu bổ sung
├── "Báo cáo DATN"/         # Báo cáo PDF
├── INSTALL.md              # File hướng dẫn này
├── MODEL_LINKS.md          # Link Google Drive cho model
└── README.md
```

---

## 10. Xử lý lỗi thường gặp

**`ModuleNotFoundError: No module named 'torch'`**
→ Chưa kích hoạt venv hoặc chưa `pip install -r requirements.txt`.

**`Address already in use` khi chạy uvicorn**
→ Đổi cổng: `uvicorn app.main:app --port 8001`

**Lỗi load model `.keras`: `FileNotFoundError`**
→ Model chưa được tải về `artifacts/models/`. Xem mục 3.

**Frontend báo "Cannot connect to backend"**
→ Backend chưa chạy, hoặc `VITE_API_BASE_URL` sai.

**`npm install` treo hoặc fail**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

---

## 11. Test tự động (tuỳ chọn)

```bash
cd backend
pytest tests/ -v
```

---

## 12. Liên hệ hỗ trợ

Tạo **Issue** trên GitHub: https://github.com/NT-TuongVi2202/gastrovision-ai/issues

Kèm theo: log lỗi, OS + phiên bản Python/Node, các bước tái hiện.