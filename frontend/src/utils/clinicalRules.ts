import type { EndoscopyFindings, PatientInfo } from "../types/history";
import type { PredictionResult, SubgroupScore } from "../types/prediction";

export interface DecisionSupportItem {
  trigger: string;
  action: string;
  severity: "info" | "warning" | "urgent";
}

interface BuildParams {
  patient: PatientInfo;
  result: PredictionResult;
  findings: EndoscopyFindings;
  subgroupScores?: SubgroupScore[];
}

function hasSubgroup(scores: SubgroupScore[], keyword: string): SubgroupScore | null {
  const kw = keyword.toLowerCase();
  for (const s of scores) {
    const text = `${s.label} ${s.label_display || ""}`.toLowerCase();
    if (text.includes(kw)) return s;
  }
  return null;
}

/**
 * Rules engine trả về danh sách gợi ý xử trí dựa trên:
 *   - patient (age, gender, symptoms)
 *   - result (label, polyp, subgroup_scores)
 *   - findings (LA grade, Paris, NICE/JNET, HP test)
 *
 * Severity:
 *   - info     → theo dõi / lưu ý
 *   - warning  → cân nhắc chỉ định
 *   - urgent   → ưu tiên xử trí ngay
 *
 * Rules xếp theo severity: urgent trước, warning, info.
 */
export function buildDecisionSupport(params: BuildParams): DecisionSupportItem[] {
  const { patient, result, findings, subgroupScores = [] } = params;
  const items: DecisionSupportItem[] = [];
  const age = Number(patient.age);
  const areaRatio = result.polyp.area_ratio || 0;

  // ----- Polyp rules -----
  if (result.polyp.has_polyp) {
    if (areaRatio > 0.10) {
      items.push({
        trigger: `Diện tích vùng nghi tổn thương ${Math.round(areaRatio * 1000) / 10}% (>10% diện tích ảnh)`,
        action: "Cân nhắc can thiệp cắt polyp qua nội soi (Polypectomy) hoặc sinh thiết ngay trong ca.",
        severity: "urgent",
      });
    } else if (areaRatio > 0.05) {
      items.push({
        trigger: `Diện tích vùng nghi tổn thương ${Math.round(areaRatio * 1000) / 10}% (>5% diện tích ảnh)`,
        action: "Sinh thiết bờ lỗ loét / polyp làm giải phẫu bệnh để xếp loại lành tính – ác tính.",
        severity: "warning",
      });
    }
    if (Number.isFinite(age) && age >= 50) {
      items.push({
        trigger: `Bệnh nhân ${age} tuổi có vùng nghi polyp`,
        action: "Theo dõi nội soi định kỳ 3 năm theo hướng dẫn giám sát quốc tế, đặc biệt nếu kích thước ≥10mm.",
        severity: "info",
      });
    }
    if (findings.paris_morphology.length > 0) {
      items.push({
        trigger: `Hình thái polyp theo Paris: ${findings.paris_morphology.join(", ")}`,
        action: "Hình thái Paris Is / Ip / Isp ưu tiên cắt polyp bằng snare; IIa/IIb/IIc cần đánh giá EMR/ESD.",
        severity: "warning",
      });
    }
  }

  // ----- NICE / JNET rules -----
  if (findings.nice_classification === "3" || findings.jnet_classification === "3" || findings.jnet_classification === "2B") {
    items.push({
      trigger: `Phân loại vi mạch máu cao: NICE ${findings.nice_classification || "?"} / JNET ${findings.jnet_classification || "?"}`,
      action: "Chuyển chuyên khoa ung bướu / tiêu hóa can thiệp; sinh thiết mô bệnh học và staging nếu nghi ác tính.",
      severity: "urgent",
    });
  } else if (findings.nice_classification === "2" || findings.jnet_classification === "2A") {
    items.push({
      trigger: `Phân loại vi mạch máu trung gian: NICE ${findings.nice_classification || "?"} / JNET ${findings.jnet_classification || "?"}`,
      action: "Cân nhắc sinh thiết chẩn đoán hoặc cắt polyp để làm giải phẫu bệnh; theo dõi sát sau can thiệp.",
      severity: "warning",
    });
  }

  // ----- LA grade rules -----
  if (findings.la_grade) {
    const severity: DecisionSupportItem["severity"] = findings.la_grade === "C" || findings.la_grade === "D" ? "urgent" : "warning";
    items.push({
      trigger: `Phân độ viêm thực quản Los Angeles ${findings.la_grade}`,
      action: severity === "urgent"
        ? "PPI liều cao 8–12 tuần, nội soi kiểm tra sau điều trị; tìm nguyên nhân (trào ngược, nhiễm trùng, thuốc)."
        : "PPI 4–8 tuần + thay đổi lối sống; tái khám nếu triệu chứng kéo dài.",
      severity,
    });
  }

  // ----- HP test rules -----
  if (findings.hp_test === "Dương tính") {
    items.push({
      trigger: "Test Helicobacter pylori dương tính",
      action: "Điều trị HP theo phác đồ (PPI + amoxicillin + clarithromycin, hoặc bismuth quadruple) 14 ngày; test lại sau 4 tuần ngưng thuốc.",
      severity: "warning",
    });
  }

  // ----- Subgroup-based rules -----
  const ulcerScore = hasSubgroup(subgroupScores, "ulcer") || hasSubgroup(subgroupScores, "loét");
  if (ulcerScore && ulcerScore.score > 0.2) {
    items.push({
      trigger: `Tín hiệu loét niêm mạc (${Math.round(ulcerScore.score * 100)}%)`,
      action: "Test HP + PPI + theo dõi xuất huyết tiêu hóa; nếu ổ loét sâu/có mạch máu lộ, xếp Forrest và cầm máu theo chỉ định.",
      severity: "urgent",
    });
  }

  const cancerScore = hasSubgroup(subgroupScores, "cancer") || hasSubgroup(subgroupScores, "ung thư");
  if (cancerScore) {
    items.push({
      trigger: `Tín hiệu nghi ác tính (${Math.round(cancerScore.score * 100)}%)`,
      action: "Sinh thiết mô bệnh học + chuyển chuyên khoa ung bướu; CT/MRI staging nếu cần.",
      severity: "urgent",
    });
  }

  const barrettScore = hasSubgroup(subgroupScores, "barrett");
  if (barrettScore && barrettScore.score > 0.2) {
    items.push({
      trigger: `Tín hiệu Barrett thực quản (${Math.round(barrettScore.score * 100)}%)`,
      action: "Sinh thiết theo phác đồ Seattle (4 góc mỗi 1–2cm) để đánh giá dysplasia; theo dõi nội soi định kỳ.",
      severity: "warning",
    });
  }

  const varicesScore = hasSubgroup(subgroupScores, "varices");
  if (varicesScore && varicesScore.score > 0.2) {
    items.push({
      trigger: `Tín hiệu giãn tĩnh mạch thực quản (${Math.round(varicesScore.score * 100)}%)`,
      action: "Đánh giá mức độ giãn; cân nhắc thắt vòng cao su và dự phòng xuất huyết bằng thuốc chẹn beta.",
      severity: "urgent",
    });
  }

  return items;
}