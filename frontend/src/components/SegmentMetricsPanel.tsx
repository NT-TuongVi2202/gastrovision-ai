import { useEffect, useState } from "react";
import { Ruler, ScanLine, Microscope } from "lucide-react";
import type { BoundingBox } from "../utils/maskAnalysis";
import { ENDOSCOPE_FOV_MM, estimateMmFromBBox, extractBoundingBox } from "../utils/maskAnalysis";
import type { PredictionResult } from "../types/prediction";

interface SegmentMetricsPanelProps {
  result: PredictionResult;
  onBbox?: (bbox: BoundingBox | null) => void;
}

export function SegmentMetricsPanel({ result, onBbox }: SegmentMetricsPanelProps) {
  const [bbox, setBbox] = useState<BoundingBox | null>(null);
  const [loadingBbox, setLoadingBbox] = useState(false);
  const hasMask = Boolean(result.polyp.has_polyp && result.polyp.mask_base64);

  useEffect(() => {
    let cancelled = false;
    if (!hasMask || !result.polyp.mask_base64) {
      setBbox(null);
      onBbox?.(null);
      return;
    }
    setLoadingBbox(true);
    extractBoundingBox(result.polyp.mask_base64)
      .then((b) => {
        if (cancelled) return;
        setBbox(b);
        onBbox?.(b);
      })
      .catch(() => {
        if (cancelled) return;
        setBbox(null);
        onBbox?.(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBbox(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasMask, result.polyp.mask_base64, onBbox]);

  if (!result.polyp.has_polyp) return null;

  const estimatedMm = bbox ? estimateMmFromBBox(bbox) : 0;
  const areaPercent = result.polyp.area_ratio ? Math.round(result.polyp.area_ratio * 1000) / 10 : null;

  return (
    <div className="segment-metrics-panel">
      <header>
        <h4>
          <ScanLine size={16} />
          Thông số định lượng từ vùng phân đoạn
        </h4>
      </header>

      <div className="segment-metrics-grid">
        <div className="segment-metrics-card">
          <span style={{ fontSize: 12, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Ruler size={13} />
            Kích thước ước tính
          </span>
          {bbox ? (
            <>
              <span className="measurement">
                ~{Math.round(estimatedMm * 10) / 10}
                <small>mm</small>
              </span>
              <span className="sub">
                Bề rộng vùng khoanh / chiều rộng ảnh × FOV {ENDOSCOPE_FOV_MM}mm (ước lượng theo ống soi, không thay thế đo bằng snare mở).
              </span>
            </>
          ) : (
            <span className="sub">
              {loadingBbox ? "Đang quét mask…" : "Không tìm được vùng mask đủ rõ để ước lượng."}
            </span>
          )}
        </div>

        <div className="segment-metrics-card">
          <span style={{ fontSize: 12, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Microscope size={13} />
            Thông số định lượng
          </span>
          <dl>
            <dt>Diện tích</dt>
            <dd>{areaPercent ? `${areaPercent}%` : "N/A"}</dd>
            <dt>Bề rộng bbox</dt>
            <dd>{bbox ? `${bbox.w} px` : "—"}</dd>
            <dt>Chiều cao bbox</dt>
            <dd>{bbox ? `${bbox.h} px` : "—"}</dd>
            <dt>Kích thước ảnh</dt>
            <dd>{bbox ? `${bbox.imageW} × ${bbox.imageH}` : "—"}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}