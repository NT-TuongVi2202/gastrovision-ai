import { jsPDF } from "jspdf";
import type { AnalysisHistoryItem, ClinicalContextAssessment, DoctorReview, PatientInfo } from "../types/history";
import type { PredictionResult } from "../types/prediction";

const PDF_FONT_NAME = "GastroVisionSans";
const COLOR_PRIMARY: [number, number, number] = [10, 95, 91]; // teal đậm
const COLOR_PRIMARY_LIGHT: [number, number, number] = [15, 138, 131];
const COLOR_BG_SOFT: [number, number, number] = [240, 248, 247];
const COLOR_BG_BAND: [number, number, number] = [232, 249, 246];
const COLOR_BORDER: [number, number, number] = [216, 226, 234];
const COLOR_BORDER_SOFT: [number, number, number] = [225, 235, 238];
const COLOR_TEXT: [number, number, number] = [22, 32, 47];
const COLOR_TEXT_MUTED: [number, number, number] = [100, 116, 139];
const COLOR_TEXT_LABEL: [number, number, number] = [80, 100, 110];
const COLOR_ACCENT: [number, number, number] = [190, 38, 38]; // đỏ cho tiêu đề lớn
const COLOR_WHITE: [number, number, number] = [255, 255, 255];

let regularFontBase64: string | null = null;
let boldFontBase64: string | null = null;

export async function downloadReport(item: AnalysisHistoryItem) {
  const doc = await buildReportPdf(item);
  doc.save(`${buildRecordFileBaseName(item)}.pdf`);
}

export async function openReportPdf(item: AnalysisHistoryItem) {
  const doc = await buildReportPdf(item);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function buildReportPdf(item: AnalysisHistoryItem) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await registerVietnameseFont(doc);

  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const pageTracker = { current: 1 };

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - margin - 8) return; // chừa footer 8mm
    doc.addPage();
    pageTracker.current += 1;
    y = margin;
    drawPageFooter(doc, pageWidth, pageHeight, margin, pageTracker.current);
  };

  const drawPageFooter = (target: jsPDF, w: number, h: number, m: number, pageNum: number) => {
    target.setDrawColor(...COLOR_BORDER_SOFT);
    target.line(m, h - 9, w - m, h - 9);
    target.setFont(PDF_FONT_NAME, "normal");
    target.setFontSize(8);
    target.setTextColor(...COLOR_TEXT_MUTED);
    target.text("GastroVision AI • Hồ sơ nội soi dạ dày", m, h - 5);
    target.text(`Trang ${pageNum}`, w - m, h - 5, { align: "right" });
  };

  const setFont = (bold = false, size = 10, color: [number, number, number] = COLOR_TEXT) => {
    doc.setFont(PDF_FONT_NAME, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const addText = (
    text: string,
    options: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number; align?: "left" | "center" | "right" } = {},
  ) => {
    const size = options.size || 10;
    const gap = options.gap ?? 5;
    setFont(options.bold || false, size, options.color || COLOR_TEXT);
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = size * 0.55;
    ensureSpace(lines.length * lineHeight + gap);
    const x = options.align === "center" ? pageWidth / 2 : options.align === "right" ? pageWidth - margin : margin;
    doc.text(lines, x, y, { align: options.align || "left" });
    y += lines.length * lineHeight + gap;
  };

  const addSectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(16);
    y += 4;
    // dải màu teal nhạt phía trái
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(margin, y - 4.5, 1.6, 6, "F");
    setFont(true, 12.5, COLOR_PRIMARY);
    doc.text(title.toUpperCase(), margin + 5, y);
    if (subtitle) {
      setFont(false, 8.5, COLOR_TEXT_MUTED);
      doc.text(subtitle, pageWidth - margin, y, { align: "right" });
    }
    y += 3;
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
  };

  const drawCard = (x: number, top: number, w: number, h: number, fill: [number, number, number] = COLOR_BG_SOFT, border: [number, number, number] = COLOR_BORDER_SOFT) => {
    doc.setFillColor(...fill);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, top, w, h, 1.6, 1.6, "FD");
  };

  const drawRecordHeader = () => {
    // Banner trên cùng
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(0, 0, pageWidth, 30, "F");
    // Dải nhấn nhỏ dưới banner
    doc.setFillColor(...COLOR_PRIMARY_LIGHT);
    doc.rect(0, 30, pageWidth, 1.4, "F");

    // Logo placeholder: hình tròn + chữ GV
    const logoCx = margin + 8;
    const logoCy = 15;
    doc.setFillColor(...COLOR_WHITE);
    doc.circle(logoCx, logoCy, 7, "F");
    doc.setFont(PDF_FONT_NAME, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text("GV", logoCx, logoCy + 1.2, { align: "center" });

    // Tiêu đề bệnh viện
    doc.setFont(PDF_FONT_NAME, "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLOR_WHITE);
    doc.text("HỒ SƠ NỘI SOI DẠ DÀY", logoCx + 11, 12);
    doc.setFont(PDF_FONT_NAME, "normal");
    doc.setFontSize(9);
    doc.setTextColor(220, 240, 238);
    doc.text("GastroVision AI - Hỗ trợ chẩn đoán hình ảnh nội soi", logoCx + 11, 17.5);

    // Cột phải: mã hồ sơ + ngày
    const rightX = pageWidth - margin;
    doc.setFont(PDF_FONT_NAME, "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 230, 226);
    doc.text("MÃ HỒ SƠ", rightX, 9, { align: "right" });
    doc.setFont(PDF_FONT_NAME, "bold");
    doc.setFontSize(12);
    doc.setTextColor(...COLOR_WHITE);
    doc.text(buildShortRecordCode(item), rightX, 14, { align: "right" });
    doc.setFont(PDF_FONT_NAME, "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 230, 226);
    doc.text(`Ngày khám: ${formatDateTime(item.created_at)}`, rightX, 19, { align: "right" });
    doc.text(`In lúc: ${formatDateTime(new Date().toISOString())}`, rightX, 23, { align: "right" });

    y = 38;
  };

  const patient = item.patient;
  const review = item.doctor_review;
  const findings = review?.endoscopy_findings;
  const prediction = item.result;
  const confidencePercent = Math.round(prediction.confidence.predicted_score * 100);

  drawRecordHeader();

  // === Tiêu đề lớn + tagline ===
  addText("KẾT QUẢ NỘI SOI DẠ DÀY", { size: 17, bold: true, color: COLOR_ACCENT, align: "center", gap: 6 });
  addText("Phiếu tổng hợp kết quả phân tích ảnh nội soi và nhận định của bác sĩ", {
    size: 9.5,
    color: COLOR_TEXT_MUTED,
    align: "center",
    gap: 8,
  });

  // === Section 1: Thông tin hành chính (dạng card) ===
  addSectionTitle("Thông tin hành chính và lâm sàng", "Bệnh nhân");

  const cardGap = 4;
  const cardCount = 4;
  const cardW = (contentWidth - cardGap * (cardCount - 1)) / cardCount;
  const cardH = 22;

  const ageGender = `${patient?.age || "—"}/${patient?.gender || "—"}`;
  drawInfoCard(margin, y, cardW, cardH, "HỌ TÊN", patient?.full_name?.trim() || "Chưa nhập", true);
  drawInfoCard(margin + (cardW + cardGap), y, cardW, cardH, "TUỔI / GIỚI", ageGender);
  drawInfoCard(margin + (cardW + cardGap) * 2, y, cardW, cardH, "MÃ HỒ SƠ", buildShortRecordCode(item));
  drawInfoCard(margin + (cardW + cardGap) * 3, y, cardW, cardH, "CHẨN ĐOÁN NHÓM", prediction.label_display || prediction.label || "—");
  y += cardH + 8;

  // Hàng lâm sàng dạng 2 cột (label - value)
  const clinicalRows: Array<[string, string]> = [
    ["Triệu chứng hiện tại", patient?.symptoms?.trim() || "Chưa nhập"],
    ["Tiền sử/lần bệnh trước", patient?.previous_history?.trim() || "Chưa nhập"],
    ["Xét nghiệm/kết quả dạ dày trước đó", patient?.previous_tests?.trim() || "Chưa nhập"],
  ];
  drawDefinitionList(clinicalRows);

  // === Hình ảnh nội soi ===
  await addEndoscopyImagesToPdf(doc, item, margin, contentWidth, pageHeight, () => y, (nextY) => {
    y = nextY;
  }, ensureSpace);

  // === Mô tả nội soi (2 cột label - value, label có nền nhạt) ===
  addSectionTitle("Mô tả nội soi theo vị trí giải phẫu", "Bác sĩ nhập");
  const endoscopyRows: Array<[string, string]> = [
    ["Thực quản", findings?.esophagus?.trim() || "Chưa nhập"],
    ["Dạ dày (tổng quan)", findings?.stomach?.trim() || "Chưa nhập"],
    ["Tâm vị / Phình vị", findings?.cardia_fundus?.trim() || "Chưa nhập"],
    ["Thân vị", findings?.body?.trim() || "Chưa nhập"],
    ["Hang vị", findings?.antrum?.trim() || "Chưa nhập"],
    ["Môn vị", findings?.pylorus?.trim() || "Chưa nhập"],
    ["Hành tá tràng", findings?.duodenal_bulb?.trim() || "Chưa nhập"],
    ["Tá tràng", findings?.duodenum?.trim() || "Chưa nhập"],
    ["Test HP", findings?.hp_test?.trim() || "Chưa nhập"],
  ];
  drawDefinitionList(endoscopyRows);

  // === Thông số tham khảo AI ===
  addSectionTitle("Thông số tham khảo từ ảnh nội soi", `Độ tin cậy ${confidencePercent}%`);
  const signals = getClinicalSignals(prediction);
  addText(buildImageFindingSummary(prediction), { gap: 6 });
  addAiSignalTable([
    ["Bình thường", "Tín hiệu niêm mạc/giải phẫu bình thường", prediction.confidence.scores.normal],
    ["Viêm/bất thường niêm mạc", "Tín hiệu tổn thương hoặc bất thường niêm mạc", prediction.confidence.scores.esophagitis],
    ["Polyp", "Tín hiệu nghi polyp", prediction.confidence.scores.polyps],
  ]);
  addText(
    `Tổng hợp nhãn phụ: dụng cụ/can thiệp ${formatPercent(signals.toolScore)}, bình thường ${formatPercent(signals.normalScore)}, polyp ${formatPercent(signals.polypScore)}, bất thường niêm mạc không tính dụng cụ ${formatPercent(signals.mucosaAbnormalScore)}.`,
    { gap: 6 },
  );
  if (prediction.confidence.subgroup_scores?.length) {
    addText("Bảng dấu hiệu chuyên sâu tham khảo:", { bold: true, gap: 6 });
    addSimpleTable(
      ["Dấu hiệu", "Nhóm", "Tỷ lệ"],
      prediction.confidence.subgroup_scores.slice(0, 8).map((sub) => [
        sub.label_display || sub.label,
        groupDisplayName(sub.group),
        `${Math.round(sub.score * 100)}%`,
      ]),
    );
    y += 3;
  }
  if (prediction.polyp.area_ratio) {
    addText(`Tỷ lệ vùng nghi ngờ trên ảnh: ${Math.round(prediction.polyp.area_ratio * 1000) / 10}%.`, { gap: 6 });
  }
  addText(
    "Các thông số trên chỉ dùng để bác sĩ tham khảo khi đọc ảnh; kết luận chính thức thuộc về bác sĩ nội soi.",
    { color: COLOR_TEXT_MUTED, gap: 10 },
  );

  // === Kết luận và khuyến nghị — khung nổi bật cuối ===
  addSectionTitle("Kết luận và khuyến nghị", "Bắt buộc bác sĩ ký xác nhận");
  drawConclusionBlock(findings?.conclusion?.trim() || review?.final_diagnosis?.trim() || "Chưa nhập");
  addText("Khuyến nghị xử trí:", { bold: true, size: 10.5, color: COLOR_PRIMARY, gap: 5 });
  addText(review?.treatment_recommendation?.trim() || "Chưa nhập", { gap: 8 });
  if (review?.note?.trim()) {
    addText("Ghi chú thêm:", { bold: true, size: 10.5, color: COLOR_PRIMARY, gap: 5 });
    addText(review.note.trim(), { gap: 10 });
  }

  // === Chữ ký ===
  drawSignatureBlock(pageWidth, margin);

  // Footer trang đầu tiên
  drawPageFooter(doc, pageWidth, pageHeight, margin, pageTracker.current);

  return doc;

  // ===== inner helpers =====
  function drawInfoCard(x: number, top: number, w: number, h: number, label: string, value: string, valueBold = false) {
    drawCard(x, top, w, h);
    setFont(false, 7.5, COLOR_TEXT_LABEL);
    doc.text(label, x + 3, top + 5.5);
    setFont(valueBold, 10.5, COLOR_TEXT);
    const lines = doc.splitTextToSize(value, w - 6);
    const lineHeight = 10.5 * 0.55;
    doc.text(lines, x + 3, top + 11);
    if (label === "MÃ HỒ SƠ") {
      setFont(false, 7.5, COLOR_TEXT_MUTED);
      doc.text(formatDateTime(item.created_at), x + 3, top + 11 + lines.length * lineHeight + 1);
    }
  }

  function drawDefinitionList(rows: Array<[string, string]>) {
    const labelW = 52;
    const valueW = contentWidth - labelW - 4;
    for (const [label, value] of rows) {
      const valueLines = doc.splitTextToSize(value, valueW);
      const lineHeight = 9.5 * 0.55;
      const rowH = Math.max(valueLines.length * lineHeight + 5, 9);
      ensureSpace(rowH + 1.5);
      // label nền nhạt
      doc.setFillColor(...COLOR_BG_BAND);
      doc.setDrawColor(...COLOR_BORDER_SOFT);
      doc.roundedRect(margin, y, labelW, rowH, 1.2, 1.2, "FD");
      setFont(true, 9, COLOR_PRIMARY);
      doc.text(label, margin + 3, y + 5.5);
      // value
      setFont(false, 9.5, COLOR_TEXT);
      doc.text(valueLines, margin + labelW + 4, y + 5.5);
      y += rowH + 3;
    }
  }

  function drawConclusionBlock(text: string) {
    ensureSpace(35);
    const lines = doc.splitTextToSize(text?.trim() || "Chưa nhập", contentWidth - 14);
    const lineHeight = 11 * 0.55;
    const boxH = Math.max(lines.length * lineHeight + 14, 22);
    // Viền trái đậm teal
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(margin, y, 2, boxH, "F");
    doc.setFillColor(...COLOR_BG_SOFT);
    doc.setDrawColor(...COLOR_PRIMARY_LIGHT);
    doc.setLineWidth(0.3);
    doc.rect(margin + 2, y, contentWidth - 2, boxH, "FD");
    setFont(true, 8.5, COLOR_PRIMARY);
    doc.text("KẾT LUẬN NỘI SOI", margin + 6, y + 6);
    setFont(true, 11, COLOR_TEXT);
    doc.text(lines, margin + 6, y + 13);
    y += boxH + 8;
  }

  function drawSignatureBlock(w: number, m: number) {
    ensureSpace(40);
    y += 4;
    const signW = (contentWidth - 10) / 2;

    // Cột trái: ngày xuất
    setFont(false, 9, COLOR_TEXT_MUTED);
    doc.text("Ngày xuất hồ sơ", m, y);
    setFont(true, 9.5, COLOR_TEXT);
    doc.text(formatDateTime(new Date().toISOString()), m, y + 5);

    // Cột phải: bác sĩ nội soi
    const rightX = w - m;
    setFont(false, 9, COLOR_TEXT_MUTED);
    doc.text("Bác sĩ nội soi", rightX, y, { align: "right" });
    // Đường kẻ chữ ký
    doc.setDrawColor(...COLOR_TEXT);
    doc.setLineWidth(0.4);
    doc.line(rightX - signW, y + 16, rightX, y + 16);
    setFont(false, 8, COLOR_TEXT_MUTED);
    doc.text("(Ký và ghi rõ họ tên)", rightX, y + 20, { align: "right" });
    y += 26;
  }

  function addSimpleTable(headers: string[], rows: string[][]) {
    const colWidths = [contentWidth * 0.55, contentWidth * 0.28, contentWidth * 0.17];
    const rowHeight = 9;
    ensureSpace(rowHeight * (rows.length + 1) + 6);
    let x = margin;
    doc.setFillColor(...COLOR_BG_BAND);
    doc.setDrawColor(...COLOR_BORDER);
    doc.rect(margin, y, contentWidth, rowHeight, "FD");
    setFont(true, 9, COLOR_PRIMARY);
    headers.forEach((header, index) => {
      doc.text(header, x + 3, y + 6.2);
      x += colWidths[index];
    });
    y += rowHeight;

    rows.forEach((row) => {
      ensureSpace(rowHeight + 2);
      x = margin;
      doc.setFillColor(...COLOR_WHITE);
      doc.setDrawColor(...COLOR_BORDER);
      doc.rect(margin, y, contentWidth, rowHeight, "S");
      setFont(false, 9, COLOR_TEXT);
      row.forEach((value, index) => {
        const clipped = doc.splitTextToSize(cleanReportText(value), colWidths[index] - 6)[0] || "";
        doc.text(clipped, x + 3, y + 6.2);
        x += colWidths[index];
      });
      y += rowHeight;
    });
    y += 5;
  }

  function addAiSignalTable(rows: Array<[string, string, number]>) {
    const labelW = contentWidth * 0.36;
    const descW = contentWidth * 0.44;
    const pctW = contentWidth * 0.20;
    const colWidths = [labelW, descW, pctW];
    const rowHeight = 10;
    ensureSpace(rowHeight * (rows.length + 1) + 6);

    // header
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(margin, y, contentWidth, rowHeight, "F");
    setFont(true, 9.5, COLOR_WHITE);
    let x = margin;
    ["Nhóm đánh giá", "Ý nghĩa lâm sàng", "Tỷ lệ"].forEach((header, i) => {
      doc.text(header, x + 3, y + 6.8);
      x += colWidths[i];
    });
    y += rowHeight;

    rows.forEach((row) => {
      ensureSpace(rowHeight + 2);
      x = margin;
      doc.setFillColor(...COLOR_WHITE);
      doc.setDrawColor(...COLOR_BORDER_SOFT);
      doc.rect(margin, y, contentWidth, rowHeight, "S");
      setFont(true, 9.5, COLOR_TEXT);
      doc.text(row[0], x + 3, y + 6.8);
      x += colWidths[0];
      setFont(false, 9, COLOR_TEXT);
      doc.text(row[1], x + 3, y + 6.8);
      x += colWidths[1];

      const pct = Math.round(row[2] * 100);
      // badge tỷ lệ
      const badgeColor: [number, number, number] = pct >= 60 ? COLOR_PRIMARY : pct >= 30 ? [180, 130, 20] : [120, 130, 145];
      doc.setFillColor(...badgeColor);
      const badgeW = 24;
      const badgeH = 6;
      doc.roundedRect(x + 3, y + 2, badgeW, badgeH, 1.5, 1.5, "F");
      setFont(true, 9, COLOR_WHITE);
      doc.text(`${pct}%`, x + 3 + badgeW / 2, y + 6.2, { align: "center" });

      y += rowHeight;
    });
    y += 5;
  }
}

export function buildHistoryItemFromResult(args: {
  file: File;
  imageDataUrl: string;
  result: PredictionResult;
  requestId?: string;
  patient?: PatientInfo;
  clinicalContext?: ClinicalContextAssessment;
  doctorReview?: DoctorReview;
}): AnalysisHistoryItem {
  return {
    id: args.requestId || crypto.randomUUID(),
    created_at: new Date().toISOString(),
    file_name: args.file.name,
    file_type: args.file.type || "Không xác định",
    file_size: args.file.size,
    image_data_url: args.imageDataUrl,
    patient: args.patient,
    clinical_context: args.clinicalContext,
    doctor_review: args.doctorReview,
    result: args.result,
  };
}

async function addEndoscopyImagesToPdf(
  doc: jsPDF,
  item: AnalysisHistoryItem,
  margin: number,
  contentWidth: number,
  pageHeight: number,
  getY: () => number,
  setY: (value: number) => void,
  ensureSpace: (h: number) => void,
) {
  const images = [
    { title: "Ảnh nội soi gốc", src: item.image_data_url },
    { title: "Vùng khoanh tổn thương", src: item.result.polyp.overlay_base64 || "" },
    { title: "Mask phân đoạn", src: item.result.polyp.mask_base64 || "" },
  ].filter((image) => image.src);

  if (images.length === 0) return;

  let y = getY() + 4;
  // Section title style thống nhất với addSectionTitle
  ensureSpace(80);
  if (y + 68 > pageHeight - margin - 8) {
    doc.addPage();
    y = margin;
  }

  // Dải teal trái
  doc.setFillColor(...COLOR_PRIMARY);
  doc.rect(margin, y - 4.5, 1.6, 6, "F");
  doc.setFont(PDF_FONT_NAME, "bold");
  doc.setFontSize(12.5);
  doc.setTextColor(...COLOR_PRIMARY);
  doc.text("HÌNH ẢNH NỘI SOI", margin + 5, y);
  y += 3;
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + contentWidth, y);
  y += 7;

  const gap = 6;
  const cardWidth = Math.min(58, (contentWidth - gap * 2) / Math.min(images.length, 3));
  const cardHeight = 48;
  const labelH = 9;
  let x = margin;

  for (const image of images) {
    if (x + cardWidth > margin + contentWidth + 1) {
      x = margin;
      y += cardHeight + labelH + 8;
    }
    if (y + cardHeight + labelH + 8 > pageHeight - margin - 8) {
      doc.addPage();
      y = margin;
      x = margin;
    }

    // Khung ảnh có shadow nhẹ
    doc.setFillColor(...COLOR_BORDER_SOFT);
    doc.roundedRect(x + 0.5, y + 0.5, cardWidth, cardHeight + labelH + 4, 2, 2, "F");
    doc.setFillColor(...COLOR_WHITE);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardWidth, cardHeight + labelH + 4, 2, 2, "S");
    const normalized = await normalizeImageDataUrl(image.src);
    const props = doc.getImageProperties(normalized.dataUrl);
    const imageHeight = Math.min(cardHeight - 4, (props.height * (cardWidth - 4)) / props.width);
    doc.addImage(normalized.dataUrl, normalized.format, x + 2, y + 2, cardWidth - 4, imageHeight);

    // Label nền teal nhạt với padding
    doc.setFillColor(...COLOR_BG_BAND);
    doc.rect(x, y + cardHeight, cardWidth, labelH, "F");
    doc.setFont(PDF_FONT_NAME, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_PRIMARY);
    doc.text(image.title, x + cardWidth / 2, y + cardHeight + 6.2, { align: "center" });
    x += cardWidth + gap;
  }

  setY(y + cardHeight + labelH + 12);
}

async function normalizeImageDataUrl(src: string): Promise<{ dataUrl: string; format: "JPEG" | "PNG" }> {
  if (src.startsWith("data:image/jpeg") || src.startsWith("data:image/jpg")) return { dataUrl: src, format: "JPEG" };
  if (src.startsWith("data:image/png")) return { dataUrl: src, format: "PNG" };
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không thể tạo ảnh cho PDF.");
  ctx.drawImage(image, 0, 0);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), format: "JPEG" };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Không thể đọc ảnh cho PDF."));
    image.src = src;
  });
}

async function registerVietnameseFont(doc: jsPDF) {
  regularFontBase64 ||= await fetchFontAsBase64("/fonts/DejaVuSans.ttf");
  boldFontBase64 ||= await fetchFontAsBase64("/fonts/DejaVuSans-Bold.ttf");

  doc.addFileToVFS("DejaVuSans.ttf", regularFontBase64);
  doc.addFileToVFS("DejaVuSans-Bold.ttf", boldFontBase64);
  (doc as unknown as { addFont: (fileName: string, fontName: string, fontStyle: string, encoding?: string) => void }).addFont(
    "DejaVuSans.ttf",
    PDF_FONT_NAME,
    "normal",
    "Identity-H",
  );
  (doc as unknown as { addFont: (fileName: string, fontName: string, fontStyle: string, encoding?: string) => void }).addFont(
    "DejaVuSans-Bold.ttf",
    PDF_FONT_NAME,
    "bold",
    "Identity-H",
  );
  doc.setFont(PDF_FONT_NAME, "normal");
}

async function fetchFontAsBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Không thể tải font tiếng Việt cho PDF.");
  const buffer = await response.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function subgroupText(item: NonNullable<PredictionResult["confidence"]["subgroup_scores"]>[number]) {
  return normalizeText(`${item.label || ""} ${item.label_display || ""}`).toLowerCase();
}

function sumSubgroupScores(
  result: PredictionResult,
  predicate: (item: NonNullable<PredictionResult["confidence"]["subgroup_scores"]>[number]) => boolean,
) {
  return (result.confidence.subgroup_scores || []).reduce((total, item) => total + (predicate(item) ? item.score : 0), 0);
}

function isToolSubgroup(item: NonNullable<PredictionResult["confidence"]["subgroup_scores"]>[number]) {
  const text = subgroupText(item);
  return /accessory|tool|instrument|dung cu/.test(text);
}

function getClinicalSignals(result: PredictionResult) {
  const toolScore = sumSubgroupScores(result, isToolSubgroup);
  const polypScore = sumSubgroupScores(result, (item) => item.group === "polyps" || subgroupText(item).includes("polyp"));
  const normalScore = sumSubgroupScores(result, (item) => item.group === "normal");
  const mucosaAbnormalScore = sumSubgroupScores(result, (item) => item.group === "esophagitis" && !isToolSubgroup(item));
  return { toolScore, polypScore, normalScore, mucosaAbnormalScore };
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function groupDisplayName(group: string) {
  if (group === "normal") return "Bình thường";
  if (group === "polyps") return "Polyp";
  return "Viêm/bất thường niêm mạc";
}

function buildImageFindingSummary(result: PredictionResult) {
  const signals = getClinicalSignals(result);
  const confidencePercent = Math.round(result.confidence.predicted_score * 100);

  if (signals.toolScore >= 0.35) {
    return `Ảnh có dụng cụ nội soi/can thiệp trong khung hình (${formatPercent(signals.toolScore)}). Chưa đủ cơ sở kết luận bệnh cụ thể từ một ảnh đơn; tín hiệu polyp khoảng ${formatPercent(signals.polypScore)} và tín hiệu bình thường khoảng ${formatPercent(signals.normalScore)}.`;
  }

  if (result.label === "polyps") {
    return `Ảnh gợi ý nhóm polyp (${confidencePercent}%). Cần bác sĩ xác định lại vị trí, hình thái và kích thước tổn thương trên toàn bộ ca nội soi.`;
  }

  if (result.label === "esophagitis") {
    return `Ảnh gợi ý nhóm viêm hoặc bất thường niêm mạc (${confidencePercent}%). Cần bác sĩ xác định vị trí tổn thương và mức độ trên hình ảnh nội soi đầy đủ.`;
  }

  return `Ảnh chưa ghi nhận bất thường rõ trong phạm vi mô hình đã học (${confidencePercent}%). Vẫn cần bác sĩ đối chiếu với triệu chứng và toàn bộ ca nội soi.`;
}

function cleanReportText(value: string) {
  return value
    .replace(/theo ảnh nội soi AI hỗ trợ/gi, "trên ảnh nội soi")
    .replace(/ảnh AI gợi ý/gi, "ảnh gợi ý")
    .replace(/Độ tin cậy AI/gi, "Độ tin cậy")
    .replace(/\bAI chưa ghi nhận/gi, "Chưa ghi nhận")
    .replace(/\bAI ghi nhận/gi, "Ghi nhận")
    .replace(/\bAI\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

function buildRecordFileBaseName(item: AnalysisHistoryItem) {
  const patientName = item.patient?.full_name?.trim() || "benh-nhan";
  return `${safeFilePart(patientName)}_${formatDateForFile(item.created_at)}`;
}

function buildShortRecordCode(item: AnalysisHistoryItem) {
  const date = formatDateForFile(item.created_at).replace(/-/g, "");
  const idTail = (item.id || "").replace(/-/g, "").slice(-6).toUpperCase();
  return `GV-${date}-${idTail || "000000"}`;
}

function safeFilePart(value: string) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "benh-nhan";
}

function formatDateForFile(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "khong-ro-ngay";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}