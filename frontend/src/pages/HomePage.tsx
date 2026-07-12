import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  FileImage,
  HeartPulse,
  History,
  RefreshCcw,
  Save,
  Sparkles,
  Stethoscope,
  UploadCloud,
  UserRound,
} from "lucide-react";
import { HistoryPanel } from "../components/HistoryPanel";
import { ImagePreview } from "../components/ImagePreview";
import { ResultPanel } from "../components/ResultPanel";
import { SegmentMetricsPanel } from "../components/SegmentMetricsPanel";
import { StructuredReportSection } from "../components/StructuredReportSection";
import { ClinicalDecisionSupport } from "../components/ClinicalDecisionSupport";
import { UploadBox } from "../components/UploadBox";
import { addAnalysisHistoryItem, clearAnalysisHistory, fileToDataUrl, loadAnalysisHistory, updateAnalysisHistoryItem } from "../services/historyService";
import { analyzeImage } from "../services/predictionService";
import { buildHistoryItemFromResult, downloadReport, openReportPdf } from "../services/reportService";
import type { BoundingBox } from "../utils/maskAnalysis";
import type { AnalysisHistoryItem, DoctorReview, EndoscopyFindings, PatientInfo } from "../types/history";
import type { PredictionResult } from "../types/prediction";

type PipelineStatus = "waiting" | "ready" | "running" | "done";
type PageKey = "analysis" | "history";

interface PipelineStep {
  label: string;
  detail: string;
  status: PipelineStatus;
}

const emptyPatient: PatientInfo = {
  full_name: "",
  age: "",
  gender: "",
  symptoms: "",
  previous_history: "",
  previous_tests: "",
};

const emptyEndoscopyFindings: EndoscopyFindings = {
  esophagus: "",
  stomach: "",
  cardia_fundus: "",
  body: "",
  antrum: "",
  pylorus: "",
  duodenal_bulb: "",
  duodenum: "",
  hp_test: "Chưa thực hiện",
  lesion_location: "",
  lesion_size: "",
  lesion_morphology: "",
  biopsy: "",
  conclusion: "",
  // Module 3: các trường phân loại cấu trúc (bác sĩ tự điền, không bị ghi đè bởi auto-draft).
  la_grade: "",
  paris_morphology: [],
  nice_classification: "",
  jnet_classification: "",
};

function createEmptyDoctorReview(): DoctorReview {
  return {
    decision: "pending",
    final_diagnosis: "",
    treatment_recommendation: "",
    note: "",
    endoscopy_findings: { ...emptyEndoscopyFindings },
  };
}

export function HomePage() {
  const [page, setPage] = useState<PageKey>(() => getPageFromHash());
  const [patient, setPatient] = useState<PatientInfo>(emptyPatient);
  const [doctorReview, setDoctorReview] = useState<DoctorReview>(() => createEmptyDoctorReview());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [currentHistoryItem, setCurrentHistoryItem] = useState<AnalysisHistoryItem | null>(null);
  const [historyItems, setHistoryItems] = useState<AnalysisHistoryItem[]>(() => loadAnalysisHistory());
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    function handleHashChange() {
      setPage(getPageFromHash());
      setHistoryItems(loadAnalysisHistory());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pipelineSteps = useMemo<PipelineStep[]>(() => {
    const hasFile = Boolean(selectedFile);
    const hasResult = Boolean(result);

    return [
      { label: "Tạo hồ sơ", detail: "Thông tin bệnh nhân", status: isPatientComplete(patient) ? "done" : "waiting" },
      { label: "Upload ảnh", detail: "Ảnh nội soi dạ dày", status: hasFile ? "done" : "waiting" },
      { label: "Hệ thống xử lý", detail: "Tiền xử lý, đặc trưng, dự đoán", status: isLoading ? "running" : hasResult ? "done" : hasFile ? "ready" : "waiting" },
      { label: "Bác sĩ kết luận", detail: "Đối chiếu và lưu hồ sơ", status: doctorReview.final_diagnosis ? "done" : hasResult ? "ready" : "waiting" },
    ];
  }, [doctorReview.final_diagnosis, isLoading, patient, result, selectedFile]);

  function handleFileSelect(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setCurrentHistoryItem(null);
    setDoctorReview(createEmptyDoctorReview());
    setSaveMessage(null);
    setError(null);
  }

  async function handleAnalyze() {
    if (!isPatientComplete(patient)) {
      setError("Vui lòng nhập đủ họ tên, tuổi, giới tính và triệu chứng trước khi phân tích.");
      return;
    }
    if (!selectedFile || !previewUrl) {
      fileInputRef.current?.click();
      return;
    }

    setIsLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      const [response, imageDataUrl] = await Promise.all([analyzeImage(selectedFile, previewUrl, patient), fileToDataUrl(selectedFile)]);
      const nextDoctorReview: DoctorReview = createEmptyDoctorReview();
      const item = buildHistoryItemFromResult({
        file: selectedFile,
        imageDataUrl,
        result: response.result,
        requestId: response.request_id,
        patient,
        doctorReview: nextDoctorReview,
      });
      setResult(response.result);
      setDoctorReview(nextDoctorReview);
      setCurrentHistoryItem(item);
      setHistoryItems(addAnalysisHistoryItem(item));
    } catch (err) {
      setResult(null);
      setCurrentHistoryItem(null);
      setError(err instanceof Error ? err.message : "Không thể phân tích ảnh.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSaveRecord() {
    if (!currentHistoryItem) return;
    if (!isDoctorReviewComplete(doctorReview) || doctorReview.decision !== "edit") {
      setError("Bác sĩ cần chỉnh sửa, nhập đủ chẩn đoán cuối cùng và khuyến nghị điều trị trước khi lưu/xuất PDF.");
      return;
    }
    const updated: AnalysisHistoryItem = {
      ...currentHistoryItem,
      patient,
      doctor_review: {
        ...doctorReview,
        updated_at: new Date().toISOString(),
      },
    };
    setCurrentHistoryItem(updated);
    setHistoryItems(updateAnalysisHistoryItem(updated));
    setSaveMessage("Đã lưu hồ sơ khám. Báo cáo PDF sẽ dùng kết luận mới nhất.");
    setError(null);
  }

  function handleReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPatient(emptyPatient);
    setDoctorReview(createEmptyDoctorReview());
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setCurrentHistoryItem(null);
    setSaveMessage(null);
    setError(null);
  }

  function handleClearHistory() {
    clearAnalysisHistory();
    setHistoryItems([]);
  }

  return (
    <main className="app-shell">
      <Sidebar page={page} historyCount={historyItems.length} />

      {page === "history" ? (
        <HistoryWorkspace historyItems={historyItems} onClear={handleClearHistory} />
      ) : (
        <AnalysisWorkspace
          currentHistoryItem={currentHistoryItem}
          doctorReview={doctorReview}
          error={error}
          historyCount={historyItems.length}
          isLoading={isLoading}
          onAnalyze={handleAnalyze}
          onDoctorReviewChange={setDoctorReview}
          onFileSelect={handleFileSelect}
          onPatientChange={setPatient}
          onReset={handleReset}
          onSaveRecord={handleSaveRecord}
          patient={patient}
          pipelineSteps={pipelineSteps}
          previewUrl={previewUrl}
          result={result}
          saveMessage={saveMessage}
          selectedFile={selectedFile}
          setError={setError}
          fileInputRef={fileInputRef}
        />
      )}
    </main>
  );
}

/* =========================================================================
   Sidebar
   ========================================================================= */

export function Sidebar({ page, historyCount }: { page: PageKey; historyCount: number }) {
  return (
    <aside className="sidebar" aria-label="Điều hướng">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark"><HeartPulse size={20} /></span>
        <div className="sidebar-brand-text">
          <strong>GastroVision AI</strong>
          <span>Không gian lâm sàng</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Điều hướng chính">
        <p className="sidebar-nav-label">Quy trình</p>
        <a className={`sidebar-nav-item ${page === "analysis" ? "is-active" : ""}`} href="#/analysis">
          <span className="sidebar-nav-icon"><FileImage size={18} /></span>
          Phân tích ảnh
        </a>
        <a className={`sidebar-nav-item ${page === "history" ? "is-active" : ""}`} href="#/history">
          <span className="sidebar-nav-icon"><History size={18} /></span>
          Lịch sử {historyCount > 0 ? <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--sidebar-muted)" }}>({historyCount})</span> : null}
        </a>
      </nav>

      <div className="sidebar-footer" aria-hidden="true" />
    </aside>
  );
}

/* =========================================================================
   Analysis workspace (wizard)
   ========================================================================= */

function AnalysisWorkspace({
  currentHistoryItem,
  doctorReview,
  error,
  historyCount,
  isLoading,
  onAnalyze,
  onDoctorReviewChange,
  onFileSelect,
  onPatientChange,
  onReset,
  onSaveRecord,
  patient,
  pipelineSteps,
  previewUrl,
  result,
  saveMessage,
  selectedFile,
  setError,
  fileInputRef,
}: {
  currentHistoryItem: AnalysisHistoryItem | null;
  doctorReview: DoctorReview;
  error: string | null;
  historyCount: number;
  isLoading: boolean;
  onAnalyze: () => void;
  onDoctorReviewChange: (review: DoctorReview) => void;
  onFileSelect: (file: File) => void;
  onPatientChange: (patient: PatientInfo) => void;
  onReset: () => void;
  onSaveRecord: () => void;
  patient: PatientInfo;
  pipelineSteps: PipelineStep[];
  previewUrl: string | null;
  result: PredictionResult | null;
  saveMessage: string | null;
  selectedFile: File | null;
  setError: (message: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="workspace">
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">Quy trình khám có hỗ trợ hình ảnh</p>
          <h1>Hồ sơ nội soi dạ dày</h1>
          <p>Nhập hồ sơ bệnh nhân, tải ảnh nội soi, để mô hình dự đoán nhãn, rồi bác sĩ đối chiếu và lưu hồ sơ cuối cùng.</p>
        </div>
        <div className="page-header-actions">
          <a className="btn btn-secondary btn-compact" href="#/history">
            <History size={16} />{historyCount} hồ sơ
          </a>
        </div>
      </header>

      {/* <WizardStepper steps={pipelineSteps} /> */}

      {/* Step 1 + 2: Patient + Upload */}
      <div className="workspace-grid">
        <PatientForm patient={patient} onChange={onPatientChange} />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
          <UploadBox selectedFile={selectedFile} onFileSelect={onFileSelect} onValidationError={setError} inputRef={fileInputRef} />
          <ImagePreview previewUrl={previewUrl} />
        </div>
      </div>

      {/* Action bar */}
      <div className="action-bar">
        <div>
          {isPatientComplete(patient)
            ? selectedFile
              ? "Sẵn sàng phân tích ảnh đã chọn."
              : "Đã nhập hồ sơ. Tiếp tục chọn ảnh nội soi."
            : "Cần nhập đủ họ tên, tuổi, giới tính và triệu chứng để tiếp tục."}
        </div>
        <div className="action-bar-buttons">
          <button className="btn btn-ghost" onClick={onReset}>
            <RefreshCcw size={16} />Tạo hồ sơ mới
          </button>
          <button className="btn btn-primary btn-lg" disabled={!isPatientComplete(patient) || isLoading} onClick={onAnalyze}>
            <Sparkles size={18} />{isLoading ? "Đang phân tích" : selectedFile ? "Chạy phân tích" : "Chọn ảnh"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {error ? <div className="error-banner"><CircleAlert size={20} /><div><strong>Không thể phân tích ảnh</strong>{error}</div></div> : null}

      {/* Step 3 + 4: Result + Doctor review */}
      <ResultPanel
        result={result}
        isLoading={isLoading}
        previewUrl={previewUrl}
      />

      {result ? (
        <DoctorReviewPanel
          review={doctorReview}
          result={result}
          patient={patient}
          onChange={onDoctorReviewChange}
          onSave={onSaveRecord}
          saveMessage={saveMessage}
          hasUnsavedChanges={hasSavedDoctorReviewChanged(currentHistoryItem, doctorReview)}
          canSave={Boolean(currentHistoryItem)}
          onDownloadReport={isReportReady(currentHistoryItem) ? () => downloadReport(currentHistoryItem) : undefined}
          onOpenReport={isReportReady(currentHistoryItem) ? () => openReportPdf(currentHistoryItem) : undefined}
          previewUrl={previewUrl}
        />
      ) : null}
    </section>
  );
}

/* =========================================================================
   Wizard stepper
   ========================================================================= */

function WizardStepper({ steps }: { steps: PipelineStep[] }) {
  const statusToClass = (status: PipelineStatus, index: number, currentActive: number) => {
    if (status === "done") return "is-done";
    if (status === "running") return "is-active";
    if (index === currentActive) return "is-active";
    return "";
  };

  // Find current active step (first non-done, non-waiting)
  const currentActive = steps.findIndex((s) => s.status !== "done" && s.status !== "waiting");

  return (
    <div className="wizard-steps" aria-label="Tiến trình 4 bước">
      {steps.map((step, index) => (
        <div className={`wizard-step ${statusToClass(step.status, index, currentActive)}`} key={step.label}>
          <span className="wizard-step-number">
            {step.status === "done" ? <CheckCircle2 size={14} /> : index + 1}
          </span>
          <div className="wizard-step-text">
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
   Step 1: Patient form
   ========================================================================= */

function PatientForm({ patient, onChange }: { patient: PatientInfo; onChange: (patient: PatientInfo) => void }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Hồ sơ bệnh nhân</p>
          <h2>Thông tin lâm sàng ban đầu</h2>
        </div>
        <span className="step-badge"><UserRound size={12} />Cần nhập đủ</span>
      </div>

      <div className="form-grid">
        <div className="form-field">
          <label>Họ tên <span className="required-mark">*</span></label>
          <input value={patient.full_name} onChange={(event) => onChange({ ...patient, full_name: event.target.value })} placeholder="Nguyễn Văn A" />
        </div>
        <div className="form-field">
          <label>Tuổi <span className="required-mark">*</span></label>
          <input value={patient.age} onChange={(event) => onChange({ ...patient, age: event.target.value })} placeholder="45" inputMode="numeric" />
        </div>
        <div className="form-field">
          <label>Giới tính <span className="required-mark">*</span></label>
          <select value={patient.gender} onChange={(event) => onChange({ ...patient, gender: event.target.value })}>
            <option value="">Chọn giới tính</option>
            <option>Nam</option>
            <option>Nữ</option>
          </select>
        </div>
        <div className="form-field full">
          <label>Triệu chứng hiện tại <span className="required-mark">*</span></label>
          <textarea value={patient.symptoms} onChange={(event) => onChange({ ...patient, symptoms: event.target.value })} placeholder="Đau thượng vị, buồn nôn, sụt cân, xuất huyết tiêu hóa..." />
        </div>
        <div className="form-field full">
          <label>Tiền sử bệnh dạ dày / lần khám trước</label>
          <textarea value={patient.previous_history} onChange={(event) => onChange({ ...patient, previous_history: event.target.value })} placeholder="Ví dụ: Viêm dạ dày năm 2024, đã điều trị HP, từng nội soi/cắt polyp..." />
        </div>
        <div className="form-field full">
          <label>Số liệu/kết quả dạ dày trước đó</label>
          <textarea value={patient.previous_tests} onChange={(event) => onChange({ ...patient, previous_tests: event.target.value })} placeholder="Ví dụ: HP dương tính/âm tính, vị trí tổn thương, kích thước polyp, kết quả sinh thiết, thuốc đang dùng..." />
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   Step 4: Doctor review panel
   ========================================================================= */

function DoctorReviewPanel({ review, result, patient, onChange, onSave, saveMessage, hasUnsavedChanges, canSave, onDownloadReport, onOpenReport, previewUrl }: { review: DoctorReview; result: PredictionResult; patient: PatientInfo; onChange: (review: DoctorReview) => void; onSave: () => void; saveMessage: string | null; hasUnsavedChanges: boolean; canSave: boolean; onDownloadReport?: () => void | Promise<void>; onOpenReport?: () => void | Promise<void>; previewUrl?: string | null; }) {
  const findings = review.endoscopy_findings || emptyEndoscopyFindings;
  const [bbox, setBbox] = useState<BoundingBox | null>(null);

  // "Đồng ý kết quả hệ thống" chỉ fill placeholder do AI gợi ý. Bác sĩ vẫn phải chỉnh sửa
  // (decision !== "agree") thì mới đủ điều kiện lưu/xuất PDF.
  function handleAgreeWithAi() {
    const draft = buildSystemAgreementDraft(patient, result);
    onChange({
      ...review,
      decision: "agree",
      final_diagnosis: review.final_diagnosis.trim() || draft.finalDiagnosis,
      treatment_recommendation: review.treatment_recommendation.trim() || draft.recommendation,
      note: review.note.trim() || draft.note,
      endoscopy_findings: mergeFindings(findings, buildEndoscopyDraft(result)),
    });
  }

  const decisionPillClass = `decision-pill ${review.decision}`;
  const reviewComplete = isDoctorReviewComplete(review);
  // Bác sĩ chỉ xuất PDF khi: đã chỉnh sửa (decision === "edit") + đã lưu + đủ nội dung.
  const canExportPdf = reviewComplete && review.decision === "edit" && Boolean(saveMessage) && !hasUnsavedChanges && Boolean(onDownloadReport) && Boolean(onOpenReport);

  return (
    <section className="panel review-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Bác sĩ đối chiếu</p>
          <h2>Kết luận cuối cùng</h2>
          <p>Bác sĩ nhập chẩn đoán và khuyến nghị điều trị. Khi lưu hồ sơ, báo cáo PDF sẽ dùng các trường dưới đây.</p>
        </div>
        <span className={decisionPillClass}>
          <Stethoscope size={12} />
          {review.decision === "agree" ? "Đồng ý hệ thống (cần chỉnh sửa)" : review.decision === "edit" ? "Đã chỉnh sửa" : "Chưa đối chiếu"}
        </span>
      </div>

      <div className="review-actions">
        <button className={`btn ${review.decision === "agree" ? "btn-primary" : "btn-secondary"}`} onClick={handleAgreeWithAi} type="button">
          <CheckCircle2 size={16} />Đồng ý kết quả hệ thống
        </button>
        <button className={`btn ${review.decision === "edit" ? "btn-primary" : "btn-secondary"}`} onClick={() => onChange({ ...review, decision: "edit" })} type="button">
          <ClipboardCheck size={16} />Chỉnh sửa kết quả hệ thống
        </button>
      </div>

      <div className="form-grid">
        <div className="form-field full">
          <label>Chẩn đoán cuối cùng <span className="required-mark">*</span></label>
          <textarea value={review.final_diagnosis} onChange={(event) => onChange({ ...review, final_diagnosis: event.target.value, decision: review.decision === "pending" || review.decision === "agree" ? "edit" : review.decision })} placeholder="Ví dụ: Viêm dạ dày, polyp dạ dày, viêm thực quản..." />
        </div>
        <div className="form-field full">
          <label>Khuyến nghị điều trị <span className="required-mark">*</span></label>
          <textarea value={review.treatment_recommendation} onChange={(event) => onChange({ ...review, treatment_recommendation: event.target.value, decision: review.decision === "pending" || review.decision === "agree" ? "edit" : review.decision })} placeholder="Theo dõi, nội soi lại, sinh thiết, điều trị thuốc, chuyển chuyên khoa..." />
        </div>
        <div className="form-field full">
          <label>Ghi chú thêm</label>
          <textarea value={review.note} onChange={(event) => onChange({ ...review, note: event.target.value, decision: review.decision === "pending" || review.decision === "agree" ? "edit" : review.decision })} placeholder="Bối cảnh lâm sàng, chất lượng ảnh, cần thêm xét nghiệm..." />
        </div>
      </div>

      <StructuredReportSection
        findings={findings}
        onChange={(next) => onChange({
          ...review,
          decision: review.decision === "pending" || review.decision === "agree" ? "edit" : review.decision,
          endoscopy_findings: next,
        })}
      />

      <ClinicalDecisionSupport result={result} patient={patient} findings={findings} />

      <div>
        <h3 className="form-section-title">Thông số nội soi chi tiết</h3>
        <div className="form-grid">
          <div className="form-field">
            <label>Thực quản</label>
            <textarea value={findings.esophagus} onChange={(event) => onChange(updateFinding(review, "esophagus", event.target.value))} placeholder="Niêm mạc bình thường, đường Z rõ đều..." />
          </div>
          <div className="form-field">
            <label>Dạ dày</label>
            <textarea value={findings.stomach} onChange={(event) => onChange(updateFinding(review, "stomach", event.target.value))} placeholder="Dịch trong, niêm mạc xung huyết/phù nề/trợt..." />
          </div>
          <div className="form-field">
            <label>Tâm vị, phình vị</label>
            <textarea value={findings.cardia_fundus} onChange={(event) => onChange(updateFinding(review, "cardia_fundus", event.target.value))} placeholder="Niêm mạc bình thường hoặc bất thường..." />
          </div>
          <div className="form-field">
            <label>Thân vị</label>
            <textarea value={findings.body} onChange={(event) => onChange(updateFinding(review, "body", event.target.value))} placeholder="Mô tả niêm mạc thân vị..." />
          </div>
          <div className="form-field">
            <label>Hang vị</label>
            <textarea value={findings.antrum} onChange={(event) => onChange(updateFinding(review, "antrum", event.target.value))} placeholder="Niêm mạc sung huyết, rải rác trợt nông..." />
          </div>
          <div className="form-field">
            <label>Môn vị</label>
            <textarea value={findings.pylorus} onChange={(event) => onChange(updateFinding(review, "pylorus", event.target.value))} placeholder="Tròn, đóng mở bình thường..." />
          </div>
          <div className="form-field">
            <label>Hành tá tràng</label>
            <textarea value={findings.duodenal_bulb} onChange={(event) => onChange(updateFinding(review, "duodenal_bulb", event.target.value))} placeholder="Niêm mạc phù nề/xung huyết/bình thường..." />
          </div>
          <div className="form-field">
            <label>Tá tràng</label>
            <textarea value={findings.duodenum} onChange={(event) => onChange(updateFinding(review, "duodenum", event.target.value))} placeholder="Niêm mạc đoạn DII bình thường..." />
          </div>
          <div className="form-field">
            <label>Test HP</label>
            <select value={findings.hp_test} onChange={(event) => onChange(updateFinding(review, "hp_test", event.target.value))}>
              <option>Chưa thực hiện</option>
              <option>Âm tính</option>
              <option>Dương tính</option>
              <option>Không rõ</option>
            </select>
          </div>
          <div className="form-field">
            <label>Vị trí tổn thương</label>
            <input value={findings.lesion_location} onChange={(event) => onChange(updateFinding(review, "lesion_location", event.target.value))} placeholder="Hang vị, thân vị, thực quản..." />
          </div>
          <div className="form-field">
            <label>Kích thước tổn thương</label>
            <input value={findings.lesion_size} onChange={(event) => onChange(updateFinding(review, "lesion_size", event.target.value))} placeholder="Ví dụ: 5 mm, 1 cm, chưa đo" />
          </div>
          <div className="form-field">
            <label>Hình thái tổn thương</label>
            <input value={findings.lesion_morphology} onChange={(event) => onChange(updateFinding(review, "lesion_morphology", event.target.value))} placeholder="Polyp có cuống/không cuống, trợt, loét..." />
          </div>
          <div className="form-field full">
            <label>Sinh thiết / can thiệp</label>
            <textarea value={findings.biopsy} onChange={(event) => onChange(updateFinding(review, "biopsy", event.target.value))} placeholder="Có/không sinh thiết, cắt polyp, cầm máu..." />
          </div>
          <div className="form-field full">
            <label>Kết luận nội soi</label>
            <textarea value={findings.conclusion} onChange={(event) => onChange(updateFinding(review, "conclusion", event.target.value))} placeholder="Ví dụ: Viêm dạ dày. Test HP dương tính. Theo dõi kết quả mô bệnh học..." />
          </div>
        </div>
      </div>

      <SegmentMetricsPanel result={result} onBbox={setBbox} />

      <div className="panel-footer">
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {!reviewComplete
            ? "Cần chọn trạng thái đối chiếu, nhập chẩn đoán cuối cùng và khuyến nghị điều trị trước khi lưu."
            : review.decision !== "edit"
              ? "Đã điền nội dung. Nhấn \"Chỉnh sửa kết quả hệ thống\" để xác nhận đây là kết luận của bác sĩ, rồi lưu hồ sơ."
              : saveMessage
                ? "Đã lưu hồ sơ. Báo cáo PDF sẵn sàng tải/xem bên dưới."
                : "Đã xác nhận chỉnh sửa. Nhấn \"Lưu hồ sơ khám\" để hoàn tất và mở khóa xuất PDF."}
        </div>
        <button className="btn btn-primary" disabled={!canSave || !reviewComplete || review.decision !== "edit"} onClick={onSave} type="button">
          <Save size={17} />Lưu hồ sơ khám
        </button>
      </div>

      {saveMessage ? <div className="success-box" style={{ background: "var(--success-soft)", color: "var(--success)", padding: "12px 16px", borderRadius: "var(--r-md)", fontSize: 13 }}>{saveMessage}</div> : null}

      {/* Xuất PDF: chỉ hiện sau khi lưu + đã chỉnh sửa */}
      <div className={`pdf-actions ${canExportPdf ? "is-ready" : "is-locked"}`}>
        <div className="pdf-actions-label">
          <span className="pdf-actions-icon">{canExportPdf ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</span>
          <div>
            <strong>{canExportPdf ? "Báo cáo PDF đã sẵn sàng" : "Báo cáo PDF đang khóa"}</strong>
            <span>
              {canExportPdf
                ? "Dùng nội dung kết luận cuối cùng bác sĩ đã lưu."
                : hasUnsavedChanges
                  ? "Nội dung vừa sửa chưa được lưu. Lưu hồ sơ trước khi xem hoặc tải báo cáo."
                  : "Chỉnh sửa kết quả hệ thống và lưu hồ sơ để mở xem hoặc tải báo cáo."}
            </span>
          </div>
        </div>
        <div className="pdf-actions-buttons">
          <button className="btn btn-primary" disabled={!canExportPdf} onClick={onOpenReport} type="button">
            <Eye size={16} />Xem PDF
          </button>
          <button className="btn btn-secondary" disabled={!canExportPdf} onClick={onDownloadReport} type="button">
            <Download size={16} />Tải PDF
          </button>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   History workspace
   ========================================================================= */

function HistoryWorkspace({ historyItems, onClear }: { historyItems: AnalysisHistoryItem[]; onClear: () => void }) {
  return (
    <section className="workspace">
      <header className="page-header">
        <div className="page-header-text">
          <p className="eyebrow">Lịch sử hồ sơ</p>
          <h1>Hồ sơ khám đã lưu</h1>
          <p>Xem lại hồ sơ đã lưu trên trình duyệt này. Báo cáo PDF chỉ xuất khi bác sĩ đã nhập và lưu kết luận cuối cùng.</p>
        </div>
        <div className="page-header-actions">
          <a className="btn btn-primary" href="#/analysis">
            <UploadCloud size={16} />Phân tích ảnh mới
          </a>
        </div>
      </header>
      <HistoryPanel items={historyItems} onClear={onClear} onDownloadReport={downloadReport} onOpenReport={openReportPdf} />
    </section>
  );
}

/* =========================================================================
   Utilities & draft builders
   ========================================================================= */

function updateFinding<Key extends keyof EndoscopyFindings>(review: DoctorReview, key: Key, value: EndoscopyFindings[Key]): DoctorReview {
  return {
    ...review,
    decision: review.decision === "pending" || review.decision === "agree" ? "edit" : review.decision,
    endoscopy_findings: {
      ...(review.endoscopy_findings || emptyEndoscopyFindings),
      [key]: value,
    },
  };
}

function mergeFindings(current: EndoscopyFindings, draft: EndoscopyFindings): EndoscopyFindings {
  return Object.fromEntries(
    Object.entries(draft).map(([key, value]) => {
      const currentValue = current[key as keyof EndoscopyFindings];
      // Bỏ qua nếu user đã có nội dung. Với mảng (paris_morphology): chỉ merge khi user rỗng.
      if (Array.isArray(currentValue)) {
        return [key, currentValue.length > 0 ? currentValue : value];
      }
      if (typeof currentValue === "string") {
        return [key, currentValue.trim() ? currentValue : value];
      }
      return [key, currentValue || value];
    }),
  ) as EndoscopyFindings;
}

function formatSubgroupSummary(result: PredictionResult) {
  const scores = result.confidence.subgroup_scores || [];
  if (!scores.length) return "Chưa có nhãn phụ chuyên khoa từ mô hình.";
  return scores
    .slice(0, 6)
    .map((item) => `${item.label_display || item.label} ${Math.round(item.score * 100)}%`)
    .join("; ");
}

function subgroupText(item: NonNullable<PredictionResult["confidence"]["subgroup_scores"]>[number]) {
  return normalizeVietnamese(`${item.label || ""} ${item.label_display || ""}`);
}

function sumSubgroupScores(
  result: PredictionResult,
  predicate: (item: NonNullable<PredictionResult["confidence"]["subgroup_scores"]>[number]) => boolean,
) {
  return (result.confidence.subgroup_scores || []).reduce((total, item) => total + (predicate(item) ? item.score : 0), 0);
}

function isToolSubgroup(item: NonNullable<PredictionResult["confidence"]["subgroup_scores"]>[number]) {
  const text = subgroupText(item);
  return /accessory|tool|instrument|dung cu|noi soi/.test(text) && /dung cu|tool|instrument|accessory/.test(text);
}

function getClinicalSignals(result: PredictionResult) {
  const toolScore = sumSubgroupScores(result, isToolSubgroup);
  const polypScore = sumSubgroupScores(result, (item) => item.group === "polyps" || subgroupText(item).includes("polyp"));
  const normalScore = sumSubgroupScores(result, (item) => item.group === "normal");
  const mucosaAbnormalScore = sumSubgroupScores(
    result,
    (item) => item.group === "esophagitis" && !isToolSubgroup(item),
  );

  return { toolScore, polypScore, normalScore, mucosaAbnormalScore };
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function hasSubgroupKeyword(result: PredictionResult, keywords: string[]) {
  const normalized = (result.confidence.subgroup_scores || [])
    .map((item) => subgroupText(item))
    .join(" ");
  return keywords.some((keyword) => normalized.includes(normalizeVietnamese(keyword)));
}

function primarySubgroupText(result: PredictionResult) {
  const first = result.confidence.subgroup_scores?.[0];
  return first ? `${first.label_display || first.label} (${Math.round(first.score * 100)}%)` : "chưa có nhãn phụ ưu tiên";
}

function buildEndoscopyDraft(result: PredictionResult): EndoscopyFindings {
  const confidencePercent = Math.round(result.confidence.predicted_score * 100);
  const subgroupSummary = formatSubgroupSummary(result);
  const primarySubgroup = primarySubgroupText(result);
  const signals = getClinicalSignals(result);
  const hasUlcerSignal = hasSubgroupKeyword(result, ["ulcer", "loét"]);
  const hasCancerSignal = hasSubgroupKeyword(result, ["cancer", "ung thư"]);
  const hasBarrettSignal = hasSubgroupKeyword(result, ["barrett"]);
  const polypNote = signals.polypScore > 0
    ? `Tín hiệu liên quan polyp khoảng ${formatPercent(signals.polypScore)}.`
    : "Chưa có tín hiệu polyp nổi bật.";
  const maskNote = result.polyp.area_ratio
    ? `Vùng phân đoạn chiếm khoảng ${Math.round(result.polyp.area_ratio * 1000) / 10}% diện tích ảnh.`
    : "Chưa có vùng phân đoạn đủ rõ để đo diện tích.";

  const base: EndoscopyFindings = {
    esophagus: "Chưa đủ dữ liệu từ một ảnh đơn để mô tả đầy đủ thực quản.",
    stomach: `Nhãn phụ tham khảo: ${subgroupSummary}. Cần bác sĩ đối chiếu trên toàn bộ ca nội soi.`,
    cardia_fundus: "Chưa đủ dữ liệu từ ảnh hiện tại.",
    body: "Chưa đủ dữ liệu từ ảnh hiện tại.",
    antrum: "Chưa đủ dữ liệu từ ảnh hiện tại.",
    pylorus: "Chưa đủ dữ liệu từ ảnh hiện tại.",
    duodenal_bulb: "Chưa đủ dữ liệu từ ảnh hiện tại.",
    duodenum: "Chưa đủ dữ liệu từ ảnh hiện tại.",
    hp_test: "Chưa thực hiện",
    lesion_location: "Chưa xác định rõ vị trí giải phẫu trên ảnh đơn.",
    lesion_size: "Chưa đo được trên ảnh đơn.",
    lesion_morphology: `Nhãn phụ ưu tiên: ${primarySubgroup}.`,
    biopsy: "Chưa có thông tin sinh thiết hoặc can thiệp.",
    conclusion: `Kết quả cần bác sĩ nội soi đối chiếu. Nhãn phụ tham khảo: ${subgroupSummary}.`,
    // Module 3: các trường phân loại cấu trúc — auto-draft KHÔNG ghi đè, để trống cho bác sĩ tự điền.
    la_grade: "",
    paris_morphology: [],
    nice_classification: "",
    jnet_classification: "",
  };

  if (signals.toolScore >= 0.35) {
    return {
      ...base,
      esophagus: "Ảnh hiện tại không tập trung vào thực quản nên chưa đánh giá được thực quản.",
      stomach: `Trong khung hình có dụng cụ nội soi/can thiệp chiếm tín hiệu cao (${formatPercent(signals.toolScore)}). Phần niêm mạc quan sát được chưa đủ để kết luận bệnh cụ thể. Tín hiệu bình thường khoảng ${formatPercent(signals.normalScore)}; ${polypNote}`,
      lesion_location: "Chưa xác định rõ. Nếu bác sĩ nghi tổn thương, cần xác định lại vị trí theo đoạn giải phẫu khi nội soi.",
      lesion_size: maskNote,
      lesion_morphology: `Ảnh có dụng cụ nội soi trong khung hình, có thể là thời điểm thao tác hoặc can thiệp. ${polypNote} Tín hiệu bất thường niêm mạc không tính dụng cụ khoảng ${formatPercent(signals.mucosaAbnormalScore)}.` ,
      biopsy: "Chưa có kết quả sinh thiết. Nếu quan sát trực tiếp thấy tổn thương thật, bác sĩ cân nhắc sinh thiết hoặc cắt polyp theo chỉ định.",
      conclusion: `Ảnh nghiêng về tình huống có dụng cụ/can thiệp nội soi hơn là một chẩn đoán bệnh riêng biệt. Chưa đủ cơ sở kết luận polyp hoặc viêm rõ ràng từ một ảnh đơn. ${polypNote}`,
    };
  }

  if (result.label === "polyps") {
    return {
      ...base,
      stomach: `Ảnh gợi ý có vùng lồi niêm mạc nghi polyp. ${polypNote} Nhóm phụ tham khảo: ${subgroupSummary}.`,
      lesion_location: "Vùng nghi polyp trên ảnh nội soi; cần bác sĩ xác định vị trí giải phẫu chính xác.",
      lesion_size: maskNote,
      lesion_morphology: `Nghi tổn thương dạng polyp. Nhãn phụ ưu tiên: ${primarySubgroup}. Cần mô tả thêm có cuống/không cuống, bề mặt, màu sắc và chảy máu nếu có.`,
      biopsy: "Cân nhắc sinh thiết hoặc cắt polyp theo kích thước, hình thái và chỉ định của bác sĩ.",
      conclusion: `Nghi polyp đường tiêu hóa theo ảnh nội soi (${confidencePercent}%). ${polypNote} Cần xác nhận bằng bác sĩ nội soi và mô bệnh học nếu có chỉ định.`,
    };
  }

  if (result.label === "esophagitis") {
    return {
      ...base,
      esophagus: "Có tín hiệu nghi viêm/bất thường niêm mạc; cần bác sĩ xác định lại vị trí thực quản hay dạ dày trên ca nội soi.",
      lesion_location: "Vị trí cần bác sĩ xác định trên toàn bộ ca nội soi.",
      lesion_morphology: `Nghi bất thường niêm mạc. Nhãn phụ ưu tiên: ${primarySubgroup}${hasUlcerSignal ? "; có tín hiệu gợi ý loét cần kiểm tra kỹ" : ""}${hasBarrettSignal ? "; có tín hiệu Barrett cần bác sĩ đối chiếu" : ""}${hasCancerSignal ? "; có tín hiệu nguy cơ cao cần bác sĩ ưu tiên xem lại" : ""}.`,
      conclusion: `Nghi viêm hoặc bất thường niêm mạc theo ảnh nội soi (${confidencePercent}%). Nhóm phụ tham khảo: ${subgroupSummary}. Cần bác sĩ xác định vị trí và mức độ tổn thương.`,
    };
  }

  if (result.label === "normal") {
    return {
      ...base,
      stomach: `Ảnh hiện tại chưa ghi nhận bất thường rõ trong nhóm chính. Tín hiệu bình thường khoảng ${formatPercent(signals.normalScore)}. Nhóm phụ tham khảo: ${subgroupSummary}.`,
      lesion_morphology: "Chưa thấy hình thái tổn thương rõ trên ảnh hiện tại.",
      conclusion: `Chưa ghi nhận bất thường rõ trên ảnh nội soi (${confidencePercent}%). Không loại trừ bệnh ngoài phạm vi ảnh đơn và mô hình.`,
    };
  }

  return base;
}

function buildSystemAgreementDraft(patient: PatientInfo, result: PredictionResult) {
  const symptoms = patient.symptoms.trim();
  const normalizedSymptoms = normalizeVietnamese(symptoms);
  const age = Number(patient.age);
  const confidencePercent = Math.round(result.confidence.predicted_score * 100);
  const subgroupSummary = formatSubgroupSummary(result);
  const signals = getClinicalSignals(result);
  const alarmSigns = /sut can|xuat huyet|phan den|non ra mau|thieu mau|nuot nghen/.test(normalizedSymptoms);
  const dyspepsiaSigns = /dau|thuong vi|buon non|kho tieu|o chua|nong rat|day bung/.test(normalizedSymptoms);
  const refluxSigns = /trao nguoc|o chua|nong rat|nuot dau/.test(normalizedSymptoms);

  // result.label_display can be null when is_low_confidence=true — never stringify null.
  const labelText = result.label_display || "hệ thống chưa đủ căn cứ để nhận định";
  const confidenceText = result.is_low_confidence
    ? `Kết quả hình ảnh: ${labelText} (độ tin cậy ${confidencePercent}% — thấp, cần bác sĩ đối chiếu).`
    : `Kết quả hình ảnh gợi ý ${labelText} với xác suất ${confidencePercent}%.`;

  const contextNotes = [
    `Triệu chứng ghi nhận: ${symptoms}.`,
    confidenceText,
    `Nhãn phụ tham khảo: ${subgroupSummary}.`,
  ];

  if (result.is_low_confidence) contextNotes.push("Độ tin cậy hệ thống thấp, cần bác sĩ xem lại ảnh/video nội soi và chất lượng ảnh.");
  if (Number.isFinite(age) && age >= 50) contextNotes.push("Tuổi từ 50 trở lên làm tăng nhu cầu đánh giá kỹ tổn thương niêm mạc.");
  if (alarmSigns) contextNotes.push("Có triệu chứng cảnh báo, cần ưu tiên đối chiếu lâm sàng và cân nhắc thăm dò thêm.");
  if (dyspepsiaSigns) contextNotes.push("Triệu chứng đau thượng vị/khó tiêu cần đối chiếu với vị trí tổn thương trên nội soi.");
  if (refluxSigns && result.label === "esophagitis") contextNotes.push("Triệu chứng trào ngược tương thích với nhóm viêm/bất thường niêm mạc hệ thống gợi ý.");

  if (signals.toolScore >= 0.35) {
    return {
      finalDiagnosis: `Hình ảnh có dụng cụ nội soi/can thiệp trong khung hình (${formatPercent(signals.toolScore)}). Chưa đủ cơ sở kết luận bệnh cụ thể từ một ảnh đơn; tín hiệu polyp khoảng ${formatPercent(signals.polypScore)}.`,
      recommendation: alarmSigns
        ? "Bác sĩ cần xem lại toàn bộ ca nội soi vì có triệu chứng cảnh báo. Nếu thấy tổn thương thật, cân nhắc sinh thiết, cắt polyp hoặc thăm dò bổ sung theo chỉ định."
        : "Bác sĩ đối chiếu lại trên video/ảnh nội soi đầy đủ, xác định vị trí giải phẫu và kiểm tra vùng nghi ngờ nếu có. Không nên kết luận bệnh chỉ dựa trên khung hình có dụng cụ.",
      note: contextNotes.join(" "),
    };
  }

  if (result.label === "polyps") {
    return {
      finalDiagnosis: `Nghi polyp đường tiêu hóa theo ảnh nội soi (${confidencePercent}%). Cần bác sĩ xác nhận vị trí, kích thước, hình thái tổn thương và chỉ định mô bệnh học khi phù hợp.`,
      recommendation: alarmSigns
        ? "Ưu tiên bác sĩ xem lại toàn bộ ca nội soi; cân nhắc sinh thiết/cắt polyp hoặc chuyển chuyên khoa tiêu hóa theo chỉ định. Đánh giá thêm dấu hiệu xuất huyết, thiếu máu và nguy cơ ác tính."
        : "Bác sĩ xác nhận vùng nghi polyp trên ảnh/video nội soi; cân nhắc sinh thiết hoặc cắt polyp theo kích thước, hình thái và hướng dẫn chuyên môn. Hẹn theo dõi/nội soi lại theo nguy cơ.",
      note: contextNotes.join(" "),
    };
  }

  if (result.label === "esophagitis") {
    return {
      finalDiagnosis: `Nghi viêm hoặc bất thường niêm mạc theo ảnh nội soi (${confidencePercent}%). Cần bác sĩ xác định vị trí, mức độ tổn thương và đối chiếu triệu chứng.`,
      recommendation: "Bác sĩ đánh giá mức độ viêm, yếu tố nguy cơ và triệu chứng; cân nhắc điều trị theo phác đồ phù hợp, thay đổi lối sống, theo dõi đáp ứng hoặc nội soi lại khi có dấu hiệu cảnh báo.",
      note: contextNotes.join(" "),
    };
  }

  return {
    finalDiagnosis: `Chưa ghi nhận bất thường rõ trên ảnh nội soi (${confidencePercent}%). Kết luận cuối cùng vẫn cần dựa trên bác sĩ đọc toàn bộ ca nội soi và triệu chứng bệnh nhân.`,
    recommendation: alarmSigns
      ? "Dù ảnh gợi ý bình thường, triệu chứng cảnh báo cần bác sĩ xem lại toàn bộ ca, cân nhắc xét nghiệm/thăm dò bổ sung hoặc theo dõi sát."
      : "Theo dõi theo triệu chứng; điều trị hỗ trợ nếu phù hợp và tái khám/nội soi lại khi triệu chứng kéo dài, nặng lên hoặc xuất hiện dấu hiệu cảnh báo.",
    note: contextNotes.join(" "),
  };
}

/* Phase 2 (Module 2 — Auto-Text Generation) đã được loại bỏ theo yêu cầu người dùng. */

function normalizeVietnamese(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

function isDoctorReviewComplete(review: DoctorReview) {
  return review.decision !== "pending" && Boolean(review.final_diagnosis.trim()) && Boolean(review.treatment_recommendation.trim());
}

function isReportReady(item: AnalysisHistoryItem | null | undefined): item is AnalysisHistoryItem {
  return Boolean(item?.doctor_review?.updated_at && isDoctorReviewComplete(item.doctor_review));
}

function hasSavedDoctorReviewChanged(item: AnalysisHistoryItem | null | undefined, review: DoctorReview) {
  if (!item?.doctor_review?.updated_at) return false;
  return serializeDoctorReview(item.doctor_review) !== serializeDoctorReview(review);
}

function serializeDoctorReview(review: DoctorReview) {
  return JSON.stringify({
    decision: review.decision,
    final_diagnosis: review.final_diagnosis,
    treatment_recommendation: review.treatment_recommendation,
    note: review.note,
    endoscopy_findings: review.endoscopy_findings || emptyEndoscopyFindings,
  });
}
function isPatientComplete(patient: PatientInfo) {
  return Boolean(patient.full_name.trim() && patient.age.trim() && patient.gender.trim() && patient.symptoms.trim());
}

function getPageFromHash(): PageKey {
  return window.location.hash === "#/history" ? "history" : "analysis";
}