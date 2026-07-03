# GastroVision AI

Demo web app cho đề tài nhận diện ảnh nội soi bằng ResNet-50 + Linear SVM và phân đoạn polyp bằng DeepLabV3+.

## Chạy frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định chạy mock API:

```txt
http://localhost:5173
```

Khi backend thật sẵn sàng, đổi trong `frontend/.env`:

```env
VITE_USE_MOCK_API=false
```

## Chạy backend sau này

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
