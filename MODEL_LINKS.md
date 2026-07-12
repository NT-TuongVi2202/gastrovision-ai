# Liên kết tải Model

Vì các file model AI có dung lượng lớn (hàng chục đến hàng trăm MB mỗi file), repo GitHub **không chứa trực tiếp** mà được lưu trên **Google Drive**.

---

## 🔗 Google Drive folder chính

**https://drive.google.com/drive/folders/`<FOLDER_ID>`**

> ⚠️ **Hướng dẫn dành cho người chấm:** Truy cập link trên, tải toàn bộ folder về máy, rồi copy đúng từng file vào đúng vị trí như mô tả trong [INSTALL.md §3](./INSTALL.md#3-tải-model-file-keras-pkl).

---

## Danh sách file model

| File | Mô tả | Dung lượng (ước tính) | Vị trí đặt trong repo |
|---|---|---|---|
| `deeplabv3plus_polyp_final_benchmark.keras` | Model phân đoạn polyp (DeepLabV3+, encoder ResNet-50) | ~172 MB | `artifacts/models/segmentation/` |
| `svm_model.pkl` | SVM phân loại 27 lớp bệnh nội soi | ~91 MB | `artifacts/models/svm_classifier/` |
| `scaler.pkl` | StandardScaler cho feature vector ResNet-50 | ~50 KB | `artifacts/models/svm_classifier/` |

> **Ghi chú:** Nếu bạn dùng Git LFS trong tương lai, các file này có thể được đẩy trực tiếp vào repo. Hiện tại chọn Google Drive để dễ truy cập.

---

## Cách tải nhanh nhất

1. Mở link folder ở trên bằng tài khoản Google bất kỳ.
2. Bấm chuột phải folder → **Download** (Google sẽ nén thành `.zip`).
3. Giải nén.
4. Copy từng file vào vị trí tương ứng trong repo theo bảng trên.

**Không có tài khoản Google?** Dùng [downloader bên thứ ba](https://github.com/jonathontoon/4chan-downloader) hoặc truy cập ẩn danh vào link chia sẻ công khai.

---

## Phiên bản & cập nhật

| Phiên bản | Ngày | Ghi chú |
|---|---|---|
| v1.0 | 2026-07-12 | Bản nộp ĐATN đợt 1 |