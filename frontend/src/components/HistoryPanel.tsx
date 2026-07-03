import { Download, Eye, History, Trash2 } from "lucide-react";
import type { AnalysisHistoryItem } from "../types/history";

interface HistoryPanelProps {
  items: AnalysisHistoryItem[];
  onDownloadReport: (item: AnalysisHistoryItem) => void | Promise<void>;
  onOpenReport: (item: AnalysisHistoryItem) => void | Promise<void>;
  onClear: () => void;
}

export function HistoryPanel({ items, onDownloadReport, onOpenReport, onClear }: HistoryPanelProps) {
  return (
    <section className="history-section" id="history">
      <div className="history-header">
        <div>
          <p className="eyebrow">Hồ sơ đã lưu</p>
          <h2>Lịch sử phân tích</h2>
          <p>Lưu hồ sơ khám trên trình duyệt này. PDF chỉ xuất khi bác sĩ đã nhập và lưu kết luận cuối cùng.</p>
        </div>
        <button className="btn btn-secondary history-clear" disabled={items.length === 0} onClick={onClear} type="button">
          <Trash2 size={16} />
          Xóa lịch sử
        </button>
      </div>

      {items.length === 0 ? (
        <div className="history-empty">
          <History size={28} />
          <strong>Chưa có ca phân tích nào</strong>
          <p>Sau khi chạy phân tích thành công, kết quả sẽ tự lưu ở đây.</p>
        </div>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <article className="history-item" key={item.id}>
              {item.image_data_url ? (
                <img src={item.image_data_url} alt={`Ảnh ${item.file_name}`} />
              ) : (
                <div className="history-thumb-placeholder">Không lưu ảnh</div>
              )}
              <div className="history-content">
                <div className="history-title-row">
                  <div>
                    <strong>{item.patient?.full_name || item.result.label_display || "Confidence thấp"}</strong>
                    <span>{item.patient?.full_name ? `${item.result.label_display || "Confidence thấp"} · ${item.file_name}` : item.file_name}</span>
                  </div>
                  <time>{formatDateTime(item.created_at)}</time>
                </div>
                <p>{item.doctor_review?.final_diagnosis || item.result.clinical_assessment?.impression || item.result.message}</p>
                <div className="history-meta">
                  <span>Score {Math.round(item.result.confidence.predicted_score * 100)}%</span>
                  <span>{formatFileSize(item.file_size)}</span>
                  <span>{item.result.polyp.has_polyp ? "Có phân đoạn polyp" : "Không có phân đoạn polyp"}</span>
                </div>
              </div>
              <div className="history-actions">
                <button className="btn btn-primary" disabled={!isReportReady(item)} onClick={() => onOpenReport(item)} type="button">
                  <Eye size={16} />
                  Xem PDF
                </button>
                <button className="btn btn-secondary" disabled={!isReportReady(item)} onClick={() => onDownloadReport(item)} type="button">
                  <Download size={16} />
                  Tải PDF
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function isReportReady(item: AnalysisHistoryItem) {
  return Boolean(
    item.doctor_review?.updated_at &&
      item.doctor_review.decision !== "pending" &&
      item.doctor_review.final_diagnosis.trim() &&
      item.doctor_review.treatment_recommendation.trim(),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}








