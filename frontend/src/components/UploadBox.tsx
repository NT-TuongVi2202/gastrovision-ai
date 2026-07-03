import { UploadCloud } from "lucide-react";
import { type RefObject, useRef, useState } from "react";

interface UploadBoxProps {
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onValidationError: (message: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

const allowedExtensions = ["jpg", "jpeg", "png"];
const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png"];
const maxUploadSizeMb = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB || 5);

export function UploadBox({ selectedFile, onFileSelect, onValidationError, inputRef }: UploadBoxProps) {
  const internalInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = inputRef || internalInputRef;
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File) {
    const error = validateFile(file);
    if (error) {
      onValidationError(error);
      return;
    }
    onFileSelect(file);
  }

  return (
    <section className="panel upload-panel">
      <div className="panel-header">
        <div>
          <h2>Upload ảnh nội soi</h2>
          <p>Chấp nhận JPG, JPEG, PNG. Dung lượng tối đa {maxUploadSizeMb} MB.</p>
        </div>
      </div>

      <button
        className={`dropzone ${isDragging ? "drag-over" : ""}`}
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <span className="drop-icon">
          <UploadCloud size={28} />
        </span>
        <strong>Chọn ảnh hoặc kéo thả vào đây</strong>
        <small>Ảnh được kiểm tra định dạng và dung lượng trước khi gửi sang mô hình.</small>
      </button>

      {selectedFile && (
        <div className="file-meta">
          <span>File đang chọn</span>
          <strong>{selectedFile.name}</strong>
          <div>
            <small>{selectedFile.type || "Không xác định"}</small>
            <small>{formatFileSize(selectedFile.size)}</small>
          </div>
        </div>
      )}
    </section>
  );
}

function validateFile(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const maxBytes = maxUploadSizeMb * 1024 * 1024;

  if (!extension || !allowedExtensions.includes(extension)) {
    return "Chỉ hỗ trợ ảnh jpg, jpeg hoặc png.";
  }

  if (file.type && !allowedMimeTypes.includes(file.type)) {
    return "MIME type không hợp lệ. Vui lòng chọn ảnh JPG hoặc PNG.";
  }

  if (file.size <= 0) {
    return "File ảnh đang rỗng.";
  }

  if (file.size > maxBytes) {
    return `File quá lớn. Dung lượng tối đa là ${maxUploadSizeMb} MB.`;
  }

  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}


