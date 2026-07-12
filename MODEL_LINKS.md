# Liên kết tải Model

Vì các file model AI có dung lượng lớn (hàng chục đến hàng trăm MB mỗi file), repo GitHub **không chứa trực tiếp** mà được lưu trên **Google Drive**.

---

## 🔗 Google Drive folder chính

**https://drive.google.com/drive/folders/1VlQDhYWp5P6qVJocNVlUDJ4jEduM922S?usp=sharing**


---

## Danh sách file model

| File | Mô tả | Dung lượng (ước tính) | Vị trí đặt trong repo |
|---|---|---|---|
| `deeplabv3plus_polyp_final_benchmark.keras` | Model phân đoạn polyp (DeepLabV3+, encoder ResNet-50) | ~172 MB | `artifacts/models/segmentation/` |
| `svm_model.pkl` | SVM phân loại 27 lớp bệnh nội soi | ~91 MB | `artifacts/models/svm_classifier/` |
| `scaler.pkl` | StandardScaler cho feature vector ResNet-50 | ~50 KB | `artifacts/models/svm_classifier/` |

## Cách tải nhanh nhất

1. Mở link folder ở trên bằng tài khoản Google bất kỳ.
2. Bấm chuột phải folder → **Download** (Google sẽ nén thành `.zip`).
3. Giải nén.
4. Copy từng file vào vị trí tương ứng trong repo theo bảng trên.

