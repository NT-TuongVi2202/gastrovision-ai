import { ListChecks } from "lucide-react";
import type { EndoscopyFindings, ParisMorphology } from "../types/history";

interface StructuredReportSectionProps {
  findings: EndoscopyFindings;
  onChange: (next: EndoscopyFindings) => void;
}

const LA_GRADES: Array<{ value: "" | "A" | "B" | "C" | "D"; label: string; hint: string }> = [
  { value: "A", label: "A", hint: "Trợt ≤5mm" },
  { value: "B", label: "B", hint: "Trợt >5mm, không liền kề" },
  { value: "C", hint: "Trợt liền kề ≤75% chu vi", label: "C" },
  { value: "D", hint: "Trợt liền kề >75% chu vi", label: "D" },
];

const PARIS_OPTIONS: ParisMorphology[] = ["Ip", "Is", "Isp", "IIa", "IIb", "IIc", "III"];

const NICE_OPTIONS: Array<{ value: "" | "1" | "2" | "3"; label: string; hint: string }> = [
  { value: "1", label: "1", hint: "Tăng sản — không nghi ác tính" },
  { value: "2", label: "2", hint: "Nghi ngờ (cần đánh giá thêm)" },
  { value: "3", label: "3", hint: "Nghi ác tính cao" },
];

const JNET_OPTIONS: Array<{ value: "" | "1" | "2A" | "2B" | "3"; label: string; hint: string }> = [
  { value: "1", label: "1", hint: "Không ung thư" },
  { value: "2A", label: "2A", hint: "Nghi ngờ thấp" },
  { value: "2B", label: "2B", hint: "Nghi ngờ cao" },
  { value: "3", label: "3", hint: "Ung thư xâm nhập sâu" },
];

export function StructuredReportSection({ findings, onChange }: StructuredReportSectionProps) {
  function setLa(grade: "" | "A" | "B" | "C" | "D") {
    onChange({ ...findings, la_grade: grade });
  }

  function toggleParis(morph: ParisMorphology) {
    const next = findings.paris_morphology.includes(morph)
      ? findings.paris_morphology.filter((m) => m !== morph)
      : [...findings.paris_morphology, morph];
    onChange({ ...findings, paris_morphology: next });
  }

  function setNice(value: "" | "1" | "2" | "3") {
    onChange({ ...findings, nice_classification: value });
  }

  function setJnet(value: "" | "1" | "2A" | "2B" | "3") {
    onChange({ ...findings, jnet_classification: value });
  }

  return (
    <div className="structured-report">
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <ListChecks size={16} color="var(--primary)" />
        <h3 className="form-section-title" style={{ margin: 0 }}>Phân loại theo chuẩn chuyên khoa</h3>
      </header>

      <fieldset>
        <legend>
          Phân độ viêm thực quản (Los Angeles) <small>bắt buộc nếu có viêm</small>
        </legend>
        <div className="radio-group">
          {LA_GRADES.map((g) => (
            <button
              key={g.value}
              type="button"
              className={`radio-pill ${findings.la_grade === g.value ? "is-active" : ""}`}
              onClick={() => setLa(findings.la_grade === g.value ? "" : g.value)}
              title={g.hint}
            >
              {g.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>
          Phân loại hình thái polyp (Paris) <small>chọn nhiều nếu phù hợp</small>
        </legend>
        <div className="chip-group">
          {PARIS_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip-toggle ${findings.paris_morphology.includes(m) ? "is-active" : ""}`}
              onClick={() => toggleParis(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>
          Phân loại vi mạch máu (NICE) <small>chủ yếu dùng cho đại trực tràng</small>
        </legend>
        <div className="radio-group">
          {NICE_OPTIONS.map((n) => (
            <button
              key={n.value}
              type="button"
              className={`radio-pill ${findings.nice_classification === n.value ? "is-active" : ""}`}
              onClick={() => setNice(findings.nice_classification === n.value ? "" : n.value)}
              title={n.hint}
            >
              NICE {n.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>
          Phân loại vi mạch máu (JNET) <small>chủ yếu dùng cho thực quản / dạ dày</small>
        </legend>
        <div className="radio-group">
          {JNET_OPTIONS.map((j) => (
            <button
              key={j.value}
              type="button"
              className={`radio-pill ${findings.jnet_classification === j.value ? "is-active" : ""}`}
              onClick={() => setJnet(findings.jnet_classification === j.value ? "" : j.value)}
              title={j.hint}
            >
              JNET {j.label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}