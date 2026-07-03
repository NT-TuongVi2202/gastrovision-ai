import { Stethoscope, AlertTriangle, Info, Zap } from "lucide-react";
import type { EndoscopyFindings, PatientInfo } from "../types/history";
import type { PredictionResult } from "../types/prediction";
import { buildDecisionSupport } from "../utils/clinicalRules";

interface ClinicalDecisionSupportProps {
  result: PredictionResult;
  patient: PatientInfo;
  findings: EndoscopyFindings;
}

const SEVERITY_ICON = {
  info: <Info size={14} />,
  warning: <AlertTriangle size={14} />,
  urgent: <Zap size={14} />,
};

const SEVERITY_TEXT: Record<"info" | "warning" | "urgent", string> = {
  info: "Theo dõi",
  warning: "Cân nhắc",
  urgent: "Ưu tiên",
};

export function ClinicalDecisionSupport({ result, patient, findings }: ClinicalDecisionSupportProps) {
  const items = buildDecisionSupport({
    patient,
    result,
    findings,
    subgroupScores: result.confidence.subgroup_scores || [],
  });

  if (items.length === 0) {
    return (
      <div className="decision-support-card">
        <header>
          <span className="clinical-icon">
            <Stethoscope size={16} />
          </span>
          <h4>Gợi ý xử trí tự động</h4>
        </header>
        <p className="decision-support-empty">
          Chưa có khuyến nghị nào phù hợp với kết quả hiện tại. Khi bác sĩ nhập thêm phân loại cấu trúc (LA/Paris/NICE/JNET) hoặc test HP, hệ thống sẽ tự động đề xuất hành động lâm sàng.
        </p>
      </div>
    );
  }

  // Tìm severity cao nhất để đặt màu viền card.
  const topSeverity: "info" | "warning" | "urgent" = items.some((i) => i.severity === "urgent")
    ? "urgent"
    : items.some((i) => i.severity === "warning")
      ? "warning"
      : "info";

  return (
    <div className={`decision-support-card severity-${topSeverity}`}>
      <header>
        <span className="clinical-icon">
          <Stethoscope size={16} />
        </span>
        <h4>Gợi ý xử trí ({items.length})</h4>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>
          Từ rules-engine dựa trên phân loại nội soi chuẩn
        </span>
      </header>
      <ul>
        {items.map((item, idx) => (
          <li key={idx} className={`severity-${item.severity}`}>
            <span className="action" style={{ display: "inline-flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ marginTop: 2, color: `var(--${item.severity === "urgent" ? "danger" : item.severity === "warning" ? "warning" : "info"})` }}>
                {SEVERITY_ICON[item.severity]}
              </span>
              {item.action}
            </span>
            <span className="trigger">
              <strong>{SEVERITY_TEXT[item.severity]}:</strong> {item.trigger}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}