export type PredictionLabel = "normal" | "esophagitis" | "polyps";

export type ScoreMap = Record<PredictionLabel, number>;

export interface SubgroupScore {
  label: string;
  label_display: string;
  group: PredictionLabel;
  score: number;
}

export interface ClinicalAssessment {
  impression: string;
  confidence_level: string;
  evidence: string[];
  missing_context: string[];
  recommendations: string[];
  urgency: string;
}

export interface PredictionResult {
  label: PredictionLabel | null;
  label_display: string | null;
  message: string;
  is_low_confidence: boolean;
  confidence: {
    predicted_label: PredictionLabel;
    predicted_score: number;
    scores: ScoreMap;
    raw_scores?: Record<string, number>;
    subgroup_scores?: SubgroupScore[];
  };
  polyp: {
    has_polyp: boolean;
    mask_base64: string | null;
    overlay_base64: string | null;
    area_ratio: number | null;
  };
  clinical_assessment?: ClinicalAssessment;
  disclaimer: string;
}

export interface PredictionResponse {
  success: true;
  request_id: string;
  result: PredictionResult;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
