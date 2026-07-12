import { CircleAlert, ClipboardList, Image as ImageIcon, Microscope, ScanLine, Stethoscope } from "lucide-react";
import type { ClinicalAssessment, PredictionLabel, PredictionResult, SubgroupScore } from "../types/prediction";

interface ResultPanelProps {
  result: PredictionResult | null;
  isLoading: boolean;
  previewUrl?: string | null;
}

const labelDisplay: Record<PredictionLabel, string> = {
  normal: "Bình thường",
  esophagitis: "Viêm / bất thường niêm mạc",
  polyps: "Polyp",
};

/* Mô tả ý nghĩa lâm sàng cho từng nhãn chuyên khoa (rút gọn, mỗi nhãn 1 dòng).
   Key = tên EN từ labels.json của backend. */
const SUBGROUP_MEANINGS: Record<string, string> = {
  "Accessory tools": "Khung hình có dụng cụ nội soi đang che một phần niêm mạc — mô hình không nên kết luận từ ảnh này.",
  "Angiectasia": "Giãn mạch máu nhỏ dưới niêm mạc, thường gây xuất huyết tiêu hóa âm thầm và thiếu máu.",
  "Barrett's esophagus": "Biểu mô thực quản thay thế bằng biểu mô dạng ruột — tiền ung thư, cần sinh thiết theo phác đồ Seattle.",
  "Blood in lumen": "Có máu đọng trong lòng ống tiêu hóa — ưu tiên xác định nguồn chảy máu.",
  "Cecum": "Vị trí giải phẫu: manh tràng — vùng khó quan sát, dễ bỏ sót polyp nhỏ.",
  "Colon diverticula": "Túi thừa thành đại tràng — thường lành tính; biến chứng viêm/ chảy máu.",
  "Colon polyps": "Polyp đại tràng — cần đo kích thước, mô tả hình thái Paris, sinh thiết/ cắt polyp.",
  "Colorectal cancer": "Khối u ác tính đại trực tràng nghi ngờ — cần sinh thiết mô bệnh học và đánh giá giai đoạn.",
  "Duodenal bulb": "Vị trí giải phẫu: hành tá tràng — hay gặp loét và sẹo cũ.",
  "Dyed-lifted-polyps": "Polyp đã nhuộm màu và nâng tổn thương — bước chuẩn bị cắt EMR/ ESD.",
  "Dyed-resection-margins": "Rìa cắt sau nhuộm — đánh giá diện cắt còn tế bào u hay không.",
  "Erythema": "Vùng niêm mạc sung huyết đỏ — dấu hiệu sớm của viêm, kích ứng.",
  "Esophageal varices": "Giãn tĩnh mạch thực quản — biến chứng nặng của xơ gan, cân nhắc thắt vòng cao su.",
  "Esophagitis": "Viêm thực quản (trào ngược/ nhiễm trùng/ thuốc) — phân độ Los Angeles và điều trị PPI.",
  "Gastric polyps": "Polyp dạ dày — sinh thiết xác định typ mô bệnh; polyp tuyến >1 cm có nguy cơ ác tính cao hơn.",
  "Gastroesophageal_junction_normal z-line": "Vùng nối dạ dày – thực quản bình thường, đường Z rõ sắc nét.",
  "Ileocecal valve": "Vị trí giải phẫu: van hồi-manh tràng — dễ nhầm với polyp to.",
  "Mucosal inflammation large bowel": "Viêm niêm mạc đại tràng — phân biệt IBD/ nhiễm trùng/ thiếu máu cục bộ qua sinh thiết.",
  "Normal esophagus": "Niêm mạc thực quản bình thường, không trợt/ loét.",
  "Normal mucosa and vascular pattern in the large bowel": "Niêm mạc và mạch máu đại tràng bình thường.",
  "Normal stomach": "Niêm mạc dạ dày bình thường trên ảnh đơn — vẫn cần bác sĩ đọc toàn bộ ca.",
  "Pylorus": "Vị trí giải phẫu: môn vị — đánh giá độ mở, nhu động.",
  "Resected polyps": "Polyp đã cắt — đánh giá đáy và rìa cắt, theo dõi theo protocol.",
  "Resection margins": "Rìa cắt tổn thương — đánh giá R0/ R1/ R2 để quyết định can thiệp thêm.",
  "Retroflex rectum": "Quan sát trực tràng ở tư thế retroflex — cần thiết để đánh giá polyp đường lược.",
  "Small bowel_terminal ileum": "Vị trí giải phẫu: hồi tràng cuối — loét/ viêm ở đây gợi ý bệnh Crohn.",
  "Ulcer": "Ổ loét niêm mạc — xếp loại Forrest để quyết định cầm máu, test HP và PPI.",
};

function lookupMeaning(rawLabel: string, labelDisplay: string | null): string {
  return SUBGROUP_MEANINGS[rawLabel] || SUBGROUP_MEANINGS[labelDisplay || ""] || (labelDisplay || rawLabel || "Dấu hiệu chuyên khoa");
}

export function ResultPanel({ result, isLoading, previewUrl }: ResultPanelProps) {
  if (isLoading) {
    return (
      <section className="panel result-panel">
        <LoadingContent />
      </section>
    );
  }

  if (!result) {
    return (
      <section className="panel result-panel">
        <div className="result-heading">
          <div>
            <p className="eyebrow">Kết quả phân tích</p>
            <h2>Chờ phân tích ảnh</h2>
          </div>
          <span className="step-badge"><ScanLine size={12} />AI</span>
        </div>
        <div className="empty-state">
          <div className="empty-mark">
            <ScanLine size={34} />
          </div>
          <strong>Chưa có ảnh được phân tích</strong>
          <p>Chọn ảnh nội soi ở bước 2 rồi nhấn phân tích để xem kết quả dự đoán, xác suất và vùng nghi ngờ nếu có.</p>
        </div>
      </section>
    );
  }

  const confidencePercent = Math.round(result.confidence.predicted_score * 100);
  const displayLabel = result.label_display || "Chưa đủ căn cứ";

  return (
    <section className="panel result-panel">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Kết quả phân tích</p>
          <h2>{displayLabel} · {confidencePercent}%</h2>
        </div>
        {result.is_low_confidence ? <span className="confidence-chip low">Cần bác sĩ đối chiếu</span> : <span className="confidence-chip">Độ tin cậy {confidencePercent}%</span>}
      </div>

      {result.is_low_confidence ? (
        <div className="result-section low-confidence-banner" role="alert">
          <p>
            <CircleAlert size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Mô hình chưa đủ căn cứ để kết luận (độ tin cậy {confidencePercent}%, các nhóm phụ gần nhau).
            Cần chọn ảnh rõ hơn hoặc nhờ bác sĩ nội soi đọc trực tiếp.
          </p>
        </div>
      ) : null}

      {/* Nhóm chính + chi tiết dấu hiệu gộp vào 1 panel */}
      <div className="result-section result-section-first">
        <div className="section-title-row">
          <h3 className="section-title">Nhóm chính &amp; dấu hiệu chuyên khoa</h3>
          <span>Xếp theo mức độ mô hình chú ý</span>
        </div>
        <div className="score-list">
          {Object.entries(result.confidence.scores).map(([label, score]) => (
            <div className="score-item" key={label}>
              <strong>{labelDisplay[label as PredictionLabel]}</strong>
              <span className="score-track">
                <span className={`score-fill ${label}`} style={{ width: `${Math.round(score * 100)}%` }} />
              </span>
              <strong className="score-value">{Math.round(score * 100)}%</strong>
            </div>
          ))}
        </div>

        {result.confidence.subgroup_scores?.length ? <SubgroupScorePanel scores={result.confidence.subgroup_scores} /> : null}
      </div>

      <ImageEvidencePanel result={result} previewUrl={previewUrl} />

      {result.clinical_assessment ? <ClinicalAssessmentPanel assessment={result.clinical_assessment} /> : null}
    </section>
  );
}

/* Subgroup: danh sách ngang gọn, mỗi dòng 1 dấu hiệu.
   Layout: tên + ý nghĩa (trái) | % số to (phải) */
function SubgroupScorePanel({ scores }: { scores: SubgroupScore[] }) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return (
    <div className="subgroup-list">
      {sorted.map((item) => <SubgroupItem item={item} key={item.label} />)}
    </div>
  );
}

function SubgroupItem({ item }: { item: SubgroupScore }) {
  const percent = Math.round(item.score * 100);
  const meaning = lookupMeaning(item.label, item.label_display);
  const categoryLabel = labelDisplay[item.group];
  const level = percent >= 20 ? "high" : percent >= 5 ? "medium" : "low";

  return (
    <div className={`subgroup-row ${level}`}>
      <div className="subgroup-row-text">
        <div className="subgroup-row-title">
          <strong>{item.label_display || item.label}</strong>
          <span className="subgroup-row-tag">{categoryLabel}</span>
        </div>
        <p>{meaning}</p>
      </div>
      <div className="subgroup-row-score" aria-label={`Tỉ lệ ${percent}%`}>
        <strong>{percent}</strong>
        <span>%</span>
      </div>
    </div>
  );
}

function ClinicalAssessmentPanel({ assessment }: { assessment: ClinicalAssessment }) {
  return (
    <div className="result-section clinical-panel">
      <div className="clinical-header">
        <span className="clinical-icon">
          <Stethoscope size={18} />
        </span>
        <h3>Nhận định hỗ trợ</h3>
        <span className="urgency-chip">{assessment.urgency}</span>
      </div>

      <p className="clinical-impression">{assessment.impression}</p>

      <div className="clinical-grid">
        <ClinicalList title="Dấu hiệu mô hình ghi nhận" items={assessment.evidence} />
        <ClinicalList title="Thông tin cần đối chiếu" items={assessment.recommendations} />
      </div>
    </div>
  );
}

function ImageEvidencePanel({ result, previewUrl }: { result: PredictionResult; previewUrl?: string | null }) {
  const inflammation = result.inflammation;
  const hasPolypSegmentation = Boolean(result.polyp.overlay_base64 || result.polyp.mask_base64);
  const hasInflammationHighlight = Boolean(inflammation?.overlay_base64 || inflammation?.mask_base64);
  const hasSegmentation = hasPolypSegmentation || hasInflammationHighlight;
  const overlaySrc = result.polyp.overlay_base64 || inflammation?.overlay_base64 || null;
  const maskSrc = result.polyp.mask_base64 || inflammation?.mask_base64 || null;
  const areaRatio = result.polyp.area_ratio ?? inflammation?.area_ratio ?? null;
  const imageCount = [previewUrl, overlaySrc, maskSrc].filter(Boolean).length;
  const title = hasPolypSegmentation ? "Phân đoạn DeepLabV3+" : hasInflammationHighlight ? "Khoanh vùng viêm tham khảo" : "Ảnh chẩn đoán";
  const subtitle = hasSegmentation ? "Ảnh gốc, vùng khoanh và mask" : "Ảnh gốc";

  return (
    <div className={`ai-image-panel result-section ${hasSegmentation ? "segmentation-ready" : ""}`}>
      <div className="section-title-row">
        <h3 className="section-title">{title}</h3>
        <span><ImageIcon size={14} />{subtitle}</span>
      </div>

      {result.polyp.has_polyp || inflammation?.has_inflammation ? (
        <div className="metric-row">
          <span><Microscope size={16} />{result.polyp.has_polyp ? "Diện tích vùng nghi tổn thương" : "Diện tích vùng viêm tham khảo"}</span>
          <strong>{areaRatio ? `${Math.round(areaRatio * 1000) / 10}%` : "N/A"}</strong>
        </div>
      ) : null}

      <div className={`image-pair ${imageCount >= 3 ? "three-images" : ""}`}>
        {previewUrl ? (
          <figure className="diagnostic-figure">
            <img src={previewUrl} alt="Ảnh nội soi gốc" />
            <figcaption>Ảnh gốc</figcaption>
          </figure>
        ) : null}
        {overlaySrc ? (
          <figure className="diagnostic-figure segmentation-figure">
            <img src={overlaySrc} alt={result.polyp.has_polyp ? "Vùng khoanh tổn thương" : "Vùng khoanh viêm tham khảo"} />
            <figcaption>{result.polyp.has_polyp ? "Vùng khoanh" : "Vùng viêm tham khảo"}</figcaption>
          </figure>
        ) : null}
        {maskSrc ? (
          <figure className="diagnostic-figure segmentation-figure">
            <img src={maskSrc} alt={result.polyp.has_polyp ? "Mask phân đoạn" : "Mask viêm tham khảo"} />
            <figcaption>{result.polyp.has_polyp ? "Mask" : "Mask viêm"}</figcaption>
          </figure>
        ) : null}
      </div>

      {result.polyp.has_polyp && !hasPolypSegmentation ? (
        <div className="quiet-note warning-note">
          <CircleAlert size={16} />Ảnh xếp nhóm polyp nhưng chưa có mask/ vùng khoanh. Thử ảnh rõ hơn.
        </div>
      ) : null}
      {!result.polyp.has_polyp && !inflammation?.has_inflammation ? (
        <div className="quiet-note">
          <CircleAlert size={16} />Kết quả không thuộc nhóm polyp hoặc viêm nên không tạo vùng khoanh.
        </div>
      ) : null}
    </div>
  );
}
function ClinicalList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="clinical-list">
      <h4>
        <ClipboardList size={14} />
        {title}
      </h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function LoadingContent() {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <strong>Đang xử lý ảnh</strong>
      <p>Mô hình đang tạo nhãn dự đoán và kiểm tra vùng polyp.</p>
    </div>
  );
}
