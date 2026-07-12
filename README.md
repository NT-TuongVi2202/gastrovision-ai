# GastroVision AI

Đồ án tốt nghiệp: nhận diện ảnh nội soi dạ dày bằng ResNet-50 + SVM, kèm phân đoạn polyp bằng DeepLabV3+. Có giao diện web để bác sĩ upload ảnh, xem kết quả AI, đối chiếu và xuất báo cáo PDF.

---

## Demo nhanh (cho thầy/cô muốn xem ngay)

Web đang chạy tại `http://localhost:5174` (đã có sẵn trong repo), backend ở `http://localhost:8080`.

Nếu máy thầy/cô chưa chạy thì kéo xuống mục **"Cài đặt và chạy"** bên dưới.

### Demo gồm các bước

1. Vào `http://localhost:5174/#/analysis`
2. Điền hồ sơ bệnh nhân (họ tên, tuổi, giới tính, triệu chứng)
3. Upload 1 ảnh nội soi (jpg/png)
4. Bấm "Chạy phân tích", chờ 3–8 giây
5. Xem kết quả: nhãn phân loại + % tin cậy, vùng polyp được khoanh đỏ
6. Bấm "Đồng ý kết quả hệ thống" hoặc sửa lại, rồi "Lưu hồ sơ khám"
7. Bấm "Xem PDF" hoặc "Tải PDF" để xuất báo cáo

Ảnh mẫu để test có trong thư mục `backend/storage/datasets/gastrovision/extracted/Gastrovision/`.

---

## Cài đặt và chạy

### Yêu cầu

- Python 3.10 hoặc 3.11
- Node.js 18 trở lên (cho frontend)
- Windows / macOS / Linux đều được

### Bước 1: Clone code về

```bash
git clone https://github.com/NT-TuongVi2202/gastrovision-ai.git
cd gastrovision-ai
```

### Bước 2: Tải model

Model nặng nên em không để trong repo, thầy/cô tải từ Google Drive ở đây:

**Link:** xem file [`MODEL_LINKS.md`](./MODEL_LINKS.md)

Tải về rồi copy 3 file vào đúng chỗ:

```
gastrovision-ai/
├── artifacts/
│   └── models/
│       ├── segmentation/
│       │   └── deeplabv3plus_polyp_final_benchmark.keras   ← từ Drive
│       └── svm_classifier/
│           ├── svm_model.pkl                               ← từ Drive
│           ├── scaler.pkl                                  ← từ Drive
│           └── labels.json                                 ← đã có trong repo
```

### Bước 3: Chạy backend

```bash
cd backend

# Tạo môi trường ảo
python -m venv .venv

# Kích hoạt (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Hoặc Windows CMD
.venv\Scripts\activate.bat

# Hoặc macOS/Linux
source .venv/bin/activate

# Cài thư viện
pip install -r requirements.txt

# Tạo file .env (copy từ .env.example rồi sửa đường dẫn nếu cần)
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

# Chạy
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

Nếu thấy dòng `Uvicorn running on http://0.0.0.0:8080` là backend ổn.

Backend chạy lần đầu sẽ hơi chậm (10–30 giây) vì phải load model ResNet-50 + DeepLabV3+.

### Bước 4: Chạy frontend

Mở **terminal mới** (terminal cũ vẫn đang chạy backend):

```bash
cd frontend

npm install

# Tạo file .env
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux

npm run dev
```

Mở trình duyệt: **http://localhost:5173** (hoặc 5174 nếu 5173 đã chiếm)

---

## Kiểm tra nhanh

Mở `http://localhost:8080/api/health` — nếu thấy `{"status":"ok", "models_loaded":true}` là mọi thứ OK.

---

## Cấu trúc repo

```
gastrovision-ai/
├── backend/              # FastAPI server (Python)
│   ├── app/              # Code chính: routes, models
│   ├── tests/            # Unit test
│   ├── training/         # Script train lại model
│   └── requirements.txt
├── frontend/             # React + Vite UI (TypeScript)
│   ├── src/
│   │   ├── components/   # Các UI component
│   │   ├── pages/        # Trang chính
│   │   └── services/     # Gọi API
│   └── package.json
├── artifacts/models/     # Model (tải từ Google Drive)
├── "Báo cáo DATN"/       # Báo cáo PDF
├── INSTALL.md            # Hướng dẫn cài đặt chi tiết
├── MODEL_LINKS.md        # Link Google Drive tải model
└── README.md             # File này
```

---

## Công nghệ dùng

**Backend**: Python 3.11, FastAPI, PyTorch, TensorFlow/Keras, scikit-learn

**Frontend**: React 19, TypeScript, Vite 7, jsPDF

**Model**:
- ResNet-50 (ImageNet pre-trained) → feature 2048-d → Linear SVM (RBF) → 27 lớp
- DeepLabV3+ (encoder ResNet-50) → mask polyp

---

## Các lệnh thường dùng

**Chạy test backend:**

```bash
cd backend
pytest tests/ -v
```

**Train lại SVM** (cần có dataset):

```bash
cd backend
python training/train_svm_classifier.py
```

**Train lại segmentation**:

```bash
cd backend
python training/train_segmentation.py
```

---

## Lỗi thường gặp

**Backend không load được model** → tải lại 3 file model từ Google Drive (xem Bước 2).

**Lỗi `Address already in use`** → đổi port khác: `uvicorn app.main:app --port 8081`

**Frontend báo "Cannot connect"** → kiểm tra backend còn chạy không, hoặc sửa `VITE_API_BASE_URL` trong `frontend/.env`.

**`npm install` bị lỗi** → thêm cờ: `npm install --legacy-peer-deps`

---

## Thông tin

- Sinh viên: Nguyễn Thị Tường Vi
- MSSV: 6351071077
- GitHub: [@NT-TuongVi2202](https://github.com/NT-TuongVi2202)
- Trường: ĐH Sư phạm Kỹ thuật TP.HCM
- Báo cáo: xem folder "Báo cáo DATN"
