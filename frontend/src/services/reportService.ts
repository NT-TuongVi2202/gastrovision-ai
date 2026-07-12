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
const EMPTY_TEXT = "Không có";

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

  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const footerReserve = 12;
  const maxPages = 2;
  let y = margin;
  let currentPage = 1;
  let wasClipped = false;

  const patient = item.patient;
  const review = item.doctor_review;
  const findings = review?.endoscopy_findings;
  const prediction = item.result;
  const confidencePercent = Math.round(prediction.confidence.predicted_score * 100);
  const diagnosis = prediction.label_display || prediction.label || "Chưa xác định";

  const setFont = (bold = false, size = 9, color: [number, number, number] = COLOR_TEXT) => {
    doc.setFont(PDF_FONT_NAME, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - footerReserve) return true;
    if (currentPage >= maxPages) {
      wasClipped = true;
      return false;
    }
    doc.addPage();
    currentPage += 1;
    y = margin + 2;
    return true;
  };

  const clipped = (value: string | undefined | null, max = 190) => {
    const text = cleanReportText(value?.trim() || EMPTY_TEXT);
    if (text.length <= max) return text;
    wasClipped = true;
    return text.slice(0, max - 1).trim() + "…";
  };

  const lineText = (text: string, x: number, top: number, width: number, options: { size?: number; bold?: boolean; color?: [number, number, number]; maxLines?: number } = {}) => {
    const size = options.size || 8.5;
    const lineHeight = size * 0.52;
    setFont(options.bold || false, size, options.color || COLOR_TEXT);
    let lines = doc.splitTextToSize(text, width);
    if (options.maxLines && lines.length > options.maxLines) {
      wasClipped = true;
      lines = lines.slice(0, options.maxLines);
      lines[lines.length - 1] = String(lines[lines.length - 1]).replace(/…?$/, "") + "…";
    }
    doc.text(lines, x, top);
    return lines.length * lineHeight;
  };

  const section = (title: string, subtitle?: string) => {
    if (!ensureSpace(10)) return false;
    y += 3;
    doc.setFillColor(...COLOR_PRIMARY);
    doc.roundedRect(margin, y - 4, 2, 6, 0.8, 0.8, "F");
    setFont(true, 10.5, COLOR_PRIMARY);
    doc.text(title.toUpperCase(), margin + 5, y);
    if (subtitle) {
      setFont(false, 7.5, COLOR_TEXT_MUTED);
      doc.text(subtitle, pageWidth - margin, y, { align: "right" });
    }
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(margin, y + 3, pageWidth - margin, y + 3);
    y += 9;
    return true;
  };

  const drawHeader = () => {
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(0, 0, pageWidth, 25, "F");
    doc.setFillColor(...COLOR_PRIMARY_LIGHT);
    doc.rect(0, 25, pageWidth, 1.2, "F");

    doc.setFillColor(...COLOR_WHITE);
    doc.circle(margin + 7, 12.5, 6.2, "F");
    setFont(true, 10, COLOR_PRIMARY);
    doc.text("GV", margin + 7, 14, { align: "center" });

    setFont(true, 13, COLOR_WHITE);
    doc.text("PHIẾU KẾT QUẢ NỘI SOI DẠ DÀY", margin + 17, 10.5);
    setFont(false, 8.2, [220, 240, 238]);

    const rightX = pageWidth - margin;
    setFont(false, 7.5, [210, 235, 232]);
    doc.text("Mã hồ sơ", rightX, 8, { align: "right" });
    setFont(true, 10, COLOR_WHITE);
    doc.text(buildShortRecordCode(item), rightX, 13, { align: "right" });
    setFont(false, 7.5, [210, 235, 232]);
    doc.text(formatDateTime(item.created_at), rightX, 18, { align: "right" });
    y = 33;
  };

  const drawInfoCard = (x: number, top: number, w: number, h: number, label: string, value: string) => {
    doc.setFillColor(...COLOR_BG_SOFT);
    doc.setDrawColor(...COLOR_BORDER_SOFT);
    doc.roundedRect(x, top, w, h, 1.5, 1.5, "FD");
    setFont(true, 7.2, COLOR_TEXT_LABEL);
    doc.text(label, x + 3, top + 5);
    lineText(value, x + 3, top + 10.5, w - 6, { size: 8.8, bold: true, maxLines: 2 });
  };

  const drawPatientSummary = () => {
    if (!ensureSpace(29)) return;
    const gap = 3;
    const cardW = (contentWidth - gap * 3) / 4;
    const cardH = 18;
    drawInfoCard(margin, y, cardW, cardH, "HỌ TÊN", clipped(patient?.full_name, 48));
    drawInfoCard(margin + (cardW + gap), y, cardW, cardH, "TUỔI", clipped(patient?.age, 16));
    drawInfoCard(margin + (cardW + gap) * 2, y, cardW, cardH, "GIỚI TÍNH", clipped(patient?.gender, 24));
    drawInfoCard(margin + (cardW + gap) * 3, y, cardW, cardH, "TRIỆU CHỨNG", clipped(patient?.symptoms, 70));
    y += cardH + 7;
  };

  const drawTwoColumnSummary = () => {
    if (!ensureSpace(46)) return;
    const gap = 5;
    const colW = (contentWidth - gap) / 2;
    const top = y;
    const boxH = 42;
    const drawBox = (x: number, title: string, body: string, accent: [number, number, number]) => {
      doc.setFillColor(...COLOR_WHITE);
      doc.setDrawColor(...COLOR_BORDER);
      doc.roundedRect(x, top, colW, boxH, 1.8, 1.8, "S");
      doc.setFillColor(...accent);
      doc.roundedRect(x, top, colW, 8, 1.8, 1.8, "F");
      setFont(true, 8.4, COLOR_WHITE);
      doc.text(title, x + 3, top + 5.6);
      lineText(body, x + 3, top + 14, colW - 6, { size: 8.2, maxLines: 5 });
    };
    drawBox(
      margin,
      "Tóm tắt kết quả",
      diagnosis + ". " + clipped(prediction.message || buildImageFindingSummary(prediction), 260),
      COLOR_PRIMARY,
    );
    drawBox(
      margin + colW + gap,
      "Bối cảnh lâm sàng",
      "Triệu chứng: " + clipped(patient?.symptoms, 110) + "\nTiền sử: " + clipped(patient?.previous_history, 95) + "\nXét nghiệm trước: " + clipped(patient?.previous_tests, 75),
      [63, 81, 181],
    );
    y += boxH + 8;
  };

  const drawMetricBar = (label: string, value: number, top: number) => {
    const pct = Math.round(value * 100);
    const labelW = 42;
    const barW = contentWidth - labelW - 16;
    setFont(true, 8.2, COLOR_TEXT);
    doc.text(label, margin, top + 4.2);
    doc.setFillColor(232, 238, 244);
    doc.roundedRect(margin + labelW, top, barW, 5, 1.4, 1.4, "F");
    const fillW = Math.max(3, (barW * pct) / 100);
    const badgeColor: [number, number, number] = pct >= 60 ? COLOR_PRIMARY : pct >= 30 ? [190, 132, 30] : COLOR_TEXT_MUTED;
    doc.setFillColor(...badgeColor);
    doc.roundedRect(margin + labelW, top, fillW, 5, 1.4, 1.4, "F");
    setFont(true, 8, COLOR_TEXT_MUTED);
    doc.text(pct + "%", margin + labelW + barW + 4, top + 4.2);
  };

  const drawAiSnapshot = () => {
    if (!section("Thông số AI tham khảo", "Rút gọn")) return;
    const rows: Array<[string, number]> = [
      ["Bình thường", prediction.confidence.scores.normal],
      ["Viêm/bất thường", prediction.confidence.scores.esophagitis],
      ["Polyp", prediction.confidence.scores.polyps],
    ];
    if (!ensureSpace(26)) return;
    rows.forEach((row, index) => drawMetricBar(row[0], row[1], y + index * 8));
    y += 27;
    const signals = getClinicalSignals(prediction);
    let signalText = "Nhãn phụ: dụng cụ " + formatPercent(signals.toolScore) + ", polyp " + formatPercent(signals.polypScore) + ", bất thường niêm mạc " + formatPercent(signals.mucosaAbnormalScore) + ".";
    if (prediction.polyp.area_ratio) {
      signalText += " Vùng nghi ngờ chiếm " + Math.round(prediction.polyp.area_ratio * 1000) / 10 + "% ảnh.";
    }
    lineText(signalText, margin, y, contentWidth, { size: 8.2, color: COLOR_TEXT_MUTED, maxLines: 2 });
    y += 11;
  };

  const drawEndoscopyRows = () => {
    if (!section("Mô tả nội soi", "Các mục chính")) return;
    const rows = ([
      ["Thực quản", findings?.esophagus || ""],
      ["Dạ dày", findings?.stomach || ""],
      ["Tâm vị / phình vị", findings?.cardia_fundus || ""],
      ["Thân vị", findings?.body || ""],
      ["Hang vị", findings?.antrum || ""],
      ["Môn vị", findings?.pylorus || ""],
      ["Hành tá tràng", findings?.duodenal_bulb || ""],
      ["Tá tràng", findings?.duodenum || ""],
      ["Test HP", findings?.hp_test || ""],
    ] as Array<[string, string]>).filter(([, value]) => value.trim());

    const visibleRows: Array<[string, string]> = rows.length ? rows.slice(0, 7) : [["Ghi nhận", EMPTY_TEXT]];
    if (rows.length > visibleRows.length) wasClipped = true;
    for (const [label, value] of visibleRows) {
      if (!ensureSpace(10)) return;
      doc.setFillColor(...COLOR_BG_BAND);
      doc.setDrawColor(...COLOR_BORDER_SOFT);
      doc.roundedRect(margin, y, 42, 8, 1.1, 1.1, "FD");
      setFont(true, 7.7, COLOR_PRIMARY);
      doc.text(label, margin + 2.5, y + 5.2);
      lineText(clipped(value, 105), margin + 46, y + 5.2, contentWidth - 46, { size: 8.1, maxLines: 1 });
      y += 10;
    }
    y += 3;
  };

  const drawConclusion = () => {
    if (!section("Kết luận và khuyến nghị", "Bác sĩ xác nhận")) return;
    const conclusion = findings?.conclusion?.trim() || review?.final_diagnosis?.trim() || EMPTY_TEXT;
    const recommendation = review?.treatment_recommendation?.trim() || EMPTY_TEXT;
    if (!ensureSpace(45)) return;
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, 36, 2, 2, "FD");
    doc.setFillColor(...COLOR_ACCENT);
    doc.rect(margin, y, 2, 36, "F");
    setFont(true, 8, COLOR_ACCENT);
    doc.text("KẾT LUẬN", margin + 6, y + 6);
    lineText(clipped(conclusion, 210), margin + 6, y + 12, contentWidth - 12, { size: 9, bold: true, maxLines: 2 });
    setFont(true, 8, COLOR_PRIMARY);
    doc.text("KHUYẾN NGHỊ", margin + 6, y + 25);
    lineText(clipped(recommendation, 180), margin + 34, y + 25, contentWidth - 40, { size: 8.3, maxLines: 2 });
    y += 44;
  };

  const drawSignature = () => {
    if (!ensureSpace(24)) return;
    const rightX = pageWidth - margin;
    setFont(false, 8, COLOR_TEXT_MUTED);
    doc.text("Ngày xuất hồ sơ", margin, y);
    setFont(true, 8.5, COLOR_TEXT);
    doc.text(formatDateTime(new Date().toISOString()), margin, y + 5);
    setFont(false, 8, COLOR_TEXT_MUTED);
    doc.text("Bác sĩ nội soi", rightX, y, { align: "right" });
    doc.setDrawColor(...COLOR_TEXT);
    doc.line(rightX - 58, y + 15, rightX, y + 15);
    setFont(false, 7.5, COLOR_TEXT_MUTED);
    doc.text("(Ký và ghi rõ họ tên)", rightX, y + 19, { align: "right" });
    y += 22;
  };

  const drawFooters = () => {
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...COLOR_BORDER_SOFT);
      doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);
      setFont(false, 7.5, COLOR_TEXT_MUTED);
      doc.text("Trang " + page + "/" + total, pageWidth - margin, pageHeight - 5, { align: "right" });
    }
  };

  const drawImageCard = async (x: number, top: number, w: number, h: number, title: string, src: string) => {
    doc.setFillColor(...COLOR_WHITE);
    doc.setDrawColor(...COLOR_BORDER);
    doc.roundedRect(x, top, w, h, 2, 2, "S");
    doc.setFillColor(...COLOR_BG_BAND);
    doc.rect(x, top + h - 8, w, 8, "F");
    try {
      const normalized = await normalizeImageDataUrl(src);
      const props = doc.getImageProperties(normalized.dataUrl);
      const maxW = w - 4;
      const maxH = h - 12;
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const imgW = props.width * ratio;
      const imgH = props.height * ratio;
      doc.addImage(normalized.dataUrl, normalized.format, x + (w - imgW) / 2, top + 2 + (maxH - imgH) / 2, imgW, imgH);
    } catch {
      setFont(false, 8, COLOR_TEXT_MUTED);
      doc.text("Không đọc được ảnh", x + w / 2, top + h / 2, { align: "center" });
    }
    setFont(true, 8, COLOR_PRIMARY);
    doc.text(title, x + w / 2, top + h - 2.8, { align: "center" });
  };

  const drawImages = async () => {
    const overlaySrc = prediction.polyp.overlay_base64 || prediction.inflammation?.overlay_base64 || "";
    const maskSrc = prediction.polyp.mask_base64 || prediction.inflammation?.mask_base64 || "";
    const overlayTitle = prediction.polyp.overlay_base64 ? "Overlay polyp" : prediction.inflammation?.overlay_base64 ? "Vùng viêm" : "Overlay";
    const maskTitle = prediction.polyp.mask_base64 ? "Mask polyp" : prediction.inflammation?.mask_base64 ? "Mask viêm" : "Mask";
    const images = [
      { title: "Ảnh gốc", src: item.image_data_url },
      { title: overlayTitle, src: overlaySrc },
      { title: maskTitle, src: maskSrc },
    ].filter((image) => image.src);
    if (!images.length || !section("Hình ảnh nội soi")) return;
    if (!ensureSpace(58)) return;
    const gap = 4;
    const count = Math.min(images.length, 3);
    const cardW = (contentWidth - gap * (count - 1)) / count;
    const cardH = 48;
    for (let index = 0; index < count; index += 1) {
      await drawImageCard(margin + index * (cardW + gap), y, cardW, cardH, images[index].title, images[index].src);
    }
    y += cardH + 8;
  };

  drawHeader();
  drawPatientSummary();
  drawTwoColumnSummary();
  await drawImages();
  drawAiSnapshot();
  drawEndoscopyRows();
  drawConclusion();
  drawSignature();
  drawFooters();

  return doc;
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