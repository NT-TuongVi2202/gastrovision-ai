import type { PatientInfo } from "../types/history";
import type { ClinicalAssessment, PredictionLabel, PredictionResponse, PredictionResult, ScoreMap } from "../types/prediction";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== "false";

const labelDisplay: Record<PredictionLabel, string> = {
  normal: "Bình thường",
  esophagitis: "Viêm thực quản",
  polyps: "Polyp",
};

export async function analyzeImage(file: File, previewUrl: string, patient?: PatientInfo): Promise<PredictionResponse> {
  if (USE_MOCK_API) {
    return mockAnalyzeImage(file, previewUrl);
  }

  const formData = new FormData();
  formData.append("file", file);
  if (patient) {
    formData.append("patient_age", patient.age);
    formData.append("patient_gender", patient.gender);
    formData.append("patient_symptoms", patient.symptoms);
  }

  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    body: formData,
  });

  const payload = await response.json();

  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message || "Không thể phân tích ảnh.");
  }

  return payload;
}

async function mockAnalyzeImage(file: File, previewUrl: string): Promise<PredictionResponse> {
  await delay(900);

  const cases = [
    buildResult("normal", { normal: 0.89, esophagitis: 0.07, polyps: 0.04 }),
    buildResult("esophagitis", { normal: 0.11, esophagitis: 0.8, polyps: 0.09 }),
    buildResult("polyps", { normal: 0.05, esophagitis: 0.08, polyps: 0.87 }),
    buildLowConfidenceResult({ normal: 0.31, esophagitis: 0.42, polyps: 0.27 }),
  ];

  const hash = [...file.name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const result = cases[hash % cases.length];

  if (result.polyp.has_polyp) {
    const assets = await createMockPolypAssets(previewUrl);
    result.polyp.mask_base64 = assets.mask;
    result.polyp.overlay_base64 = assets.overlay;
    result.polyp.area_ratio = 0.075;
    result.clinical_assessment = buildClinicalAssessment(
      result.label,
      result.is_low_confidence,
      result.confidence.predicted_score,
      result.polyp.area_ratio,
    );
  }

  if (result.label === "esophagitis") {
    const assets = await createMockInflammationAssets(previewUrl);
    result.inflammation = {
      has_inflammation: true,
      mask_base64: assets.mask,
      overlay_base64: assets.overlay,
      area_ratio: 0.12,
      method: "mock-redness-heuristic",
    };
  }

  return {
    success: true,
    request_id: crypto.randomUUID(),
    result,
  };
}

function buildResult(label: PredictionLabel, scores: ScoreMap): PredictionResult {
  const messages: Record<PredictionLabel, string> = {
    normal: "Không phát hiện bất thường trong phạm vi ba nhóm dữ liệu được huấn luyện.",
    esophagitis: "Nghi ngờ viêm thực quản.",
    polyps: "Phát hiện nghi ngờ polyp. Hệ thống đã sinh vùng phân đoạn tổn thương.",
  };

  return {
    label,
    label_display: labelDisplay[label],
    message: messages[label],
    is_low_confidence: false,
    confidence: {
      predicted_label: label,
      predicted_score: scores[label],
      scores,
    },
    polyp: {
      has_polyp: label === "polyps",
      mask_base64: null,
      overlay_base64: null,
      area_ratio: null,
    },
    inflammation: {
      has_inflammation: label === "esophagitis",
      mask_base64: null,
      overlay_base64: null,
      area_ratio: null,
      method: null,
    },
    clinical_assessment: buildClinicalAssessment(label, false, scores[label], null),
    disclaimer: "Kết quả chỉ hỗ trợ nghiên cứu, không thay thế chẩn đoán của bác sĩ.",
  };
}

function buildLowConfidenceResult(scores: ScoreMap): PredictionResult {
  return {
    label: null,
    label_display: null,
    message: "Chưa đủ căn cứ để nhận diện rõ ràng. Vui lòng sử dụng ảnh rõ hơn hoặc tham khảo ý kiến bác sĩ.",
    is_low_confidence: true,
    confidence: {
      predicted_label: "esophagitis",
      predicted_score: scores.esophagitis,
      scores,
    },
    polyp: {
      has_polyp: false,
      mask_base64: null,
      overlay_base64: null,
      area_ratio: null,
    },
    inflammation: {
      has_inflammation: false,
      mask_base64: null,
      overlay_base64: null,
      area_ratio: null,
      method: null,
    },
    clinical_assessment: buildClinicalAssessment(null, true, scores.esophagitis, null),
    disclaimer: "Kết quả chỉ hỗ trợ nghiên cứu, không thay thế chẩn đoán của bác sĩ.",
  };
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function createMockInflammationAssets(src: string): Promise<{ mask: string; overlay: string }> {
  const image = await loadImage(src);
  const width = 640;
  const height = Math.max(360, Math.round((image.height / image.width) * width));

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Không thể tạo mask viêm mô phỏng.");

  maskCtx.fillStyle = "#000";
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  maskCtx.ellipse(width * 0.48, height * 0.42, width * 0.2, height * 0.15, 0.25, 0, Math.PI * 2);
  maskCtx.ellipse(width * 0.62, height * 0.56, width * 0.16, height * 0.11, -0.4, 0, Math.PI * 2);
  maskCtx.fill();

  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  const overlayCtx = overlayCanvas.getContext("2d");
  if (!overlayCtx) throw new Error("Không thể tạo overlay viêm mô phỏng.");

  overlayCtx.drawImage(image, 0, 0, width, height);
  overlayCtx.fillStyle = "rgba(245, 120, 35, 0.38)";
  overlayCtx.beginPath();
  overlayCtx.ellipse(width * 0.48, height * 0.42, width * 0.2, height * 0.15, 0.25, 0, Math.PI * 2);
  overlayCtx.ellipse(width * 0.62, height * 0.56, width * 0.16, height * 0.11, -0.4, 0, Math.PI * 2);
  overlayCtx.fill();
  overlayCtx.strokeStyle = "#f97316";
  overlayCtx.lineWidth = 4;
  overlayCtx.stroke();

  return {
    mask: maskCanvas.toDataURL("image/png"),
    overlay: overlayCanvas.toDataURL("image/png"),
  };
}

async function createMockPolypAssets(src: string): Promise<{ mask: string; overlay: string }> {
  const image = await loadImage(src);
  const width = 640;
  const height = Math.max(360, Math.round((image.height / image.width) * width));

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("Không thể tạo mask mô phỏng.");

  maskCtx.fillStyle = "#000";
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.fillStyle = "#fff";
  maskCtx.beginPath();
  maskCtx.ellipse(width * 0.56, height * 0.48, width * 0.15, height * 0.18, -0.2, 0, Math.PI * 2);
  maskCtx.fill();

  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  const overlayCtx = overlayCanvas.getContext("2d");
  if (!overlayCtx) throw new Error("Không thể tạo overlay mô phỏng.");

  overlayCtx.drawImage(image, 0, 0, width, height);
  overlayCtx.fillStyle = "rgba(220, 38, 38, 0.42)";
  overlayCtx.beginPath();
  overlayCtx.ellipse(width * 0.56, height * 0.48, width * 0.15, height * 0.18, -0.2, 0, Math.PI * 2);
  overlayCtx.fill();
  overlayCtx.strokeStyle = "#dc2626";
  overlayCtx.lineWidth = 5;
  overlayCtx.stroke();

  return {
    mask: maskCanvas.toDataURL("image/png"),
    overlay: overlayCanvas.toDataURL("image/png"),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không thể đọc ảnh preview."));
    image.src = src;
  });
}

function buildClinicalAssessment(
  label: PredictionLabel | null,
  isLowConfidence: boolean,
  score: number,
  areaRatio: number | null,
): ClinicalAssessment {
  const confidenceLevel = isLowConfidence ? "Thấp" : score >= 0.85 ? "Cao" : "Trung bình";

  if (isLowConfidence || !label) {
    return {
      impression: "Chưa đủ cơ sở hình ảnh để đưa ra nhận định lâm sàng đáng tin cậy.",
      confidence_level: confidenceLevel,
      evidence: ["Xác suất giữa các nhóm bệnh chưa đủ tách biệt.", "Ảnh cần được đối chiếu thêm nhiều frame nội soi."],
      missing_context: ["Vị trí giải phẫu chính xác.", "Chuỗi ảnh/video nội soi.", "Triệu chứng và tiền sử bệnh."],
      recommendations: ["Không nên dùng kết quả này để kết luận bệnh.", "Bác sĩ nên xem lại ảnh gốc và nhập thêm ảnh rõ hơn nếu cần."],
      urgency: "Cần đối chiếu thêm",
    };
  }

  if (label === "polyps") {
    return {
      impression: "Hình ảnh gợi ý tổn thương dạng polyp hoặc vùng niêm mạc lồi; chưa đủ để xác định bản chất lành tính hay ác tính.",
      confidence_level: confidenceLevel,
      evidence: ["Mô hình phân loại ưu tiên lớp polyp.", `Vùng mask chiếm khoảng ${areaRatio ? Math.round(areaRatio * 1000) / 10 : "N/A"}% diện tích ảnh.`, "Overlay giúp khoanh vùng vị trí cần kiểm tra kỹ."],
      missing_context: ["Vị trí giải phẫu.", "Kích thước thật theo mm/cm.", "Hình thái Paris và bề mặt tổn thương.", "Kết quả mô bệnh học nếu sinh thiết/cắt polyp."],
      recommendations: ["Đối chiếu nhiều frame/góc nhìn để loại trừ nếp niêm mạc, bóng hoặc artefact.", "Nếu là polyp thật, cần đo kích thước, mô tả hình thái và cân nhắc sinh thiết/cắt polyp."],
      urgency: "Ưu tiên bác sĩ xem lại",
    };
  }

  if (label === "esophagitis") {
    return {
      impression: "Hình ảnh gợi ý viêm thực quản; cần phân độ và đối chiếu triệu chứng trước khi kết luận.",
      confidence_level: confidenceLevel,
      evidence: ["Mô hình phân loại ưu tiên lớp viêm thực quản."],
      missing_context: ["Vị trí so với đường Z.", "Mức độ trợt/loét và phân độ Los Angeles.", "Triệu chứng trào ngược hoặc nuốt nghẹn."],
      recommendations: ["Bác sĩ nên phân độ tổn thương trên video/ảnh đầy đủ.", "Cân nhắc sinh thiết nếu có dấu hiệu không điển hình."],
      urgency: "Cần bác sĩ đối chiếu",
    };
  }

  return {
    impression: "Chưa thấy dấu hiệu bất thường rõ trong ba nhóm mà hệ thống hỗ trợ, nhưng không loại trừ bệnh ngoài phạm vi mô hình.",
    confidence_level: confidenceLevel,
    evidence: ["Mô hình phân loại ưu tiên lớp bình thường."],
    missing_context: ["Toàn bộ chuỗi ảnh/video nội soi.", "Vị trí giải phẫu và triệu chứng lâm sàng."],
    recommendations: ["Bác sĩ vẫn cần đọc toàn bộ ca nội soi.", "Đánh giá thêm nếu triệu chứng hoặc hình ảnh khác còn nghi ngờ."],
    urgency: "Theo dõi theo bối cảnh lâm sàng",
  };
}

