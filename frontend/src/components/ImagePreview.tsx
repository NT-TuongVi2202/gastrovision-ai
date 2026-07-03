interface ImagePreviewProps {
  previewUrl: string | null;
}

export function ImagePreview({ previewUrl }: ImagePreviewProps) {
  if (!previewUrl) {
    return (
      <section className="panel preview-panel empty-preview">
        <div className="panel-header compact">
          <h2>Ảnh xem trước</h2>
          <p>Ảnh nội soi sẽ xuất hiện tại đây sau khi chọn file.</p>
        </div>
        <div className="preview-placeholder" />
      </section>
    );
  }

  return (
    <section className="panel preview-panel">
      <div className="panel-header compact">
        <h2>Ảnh xem trước</h2>
        <p>Kiểm tra nhanh chất lượng ảnh trước khi phân tích.</p>
      </div>
      <div className="preview-frame">
        <img src={previewUrl} alt="Ảnh nội soi đã chọn" />
      </div>
    </section>
  );
}
