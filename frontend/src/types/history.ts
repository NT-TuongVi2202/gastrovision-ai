import type { PredictionResult } from "./prediction";

export interface PatientInfo {
  full_name: string;
  age: string;
  gender: string;
  symptoms: string;
  previous_history: string;
  previous_tests: string;
}

export type ParisMorphology = "Ip" | "Is" | "Isp" | "IIa" | "IIb" | "IIc" | "III";

export interface EndoscopyFindings {
  esophagus: string;
  stomach: string;
  cardia_fundus: string;
  body: string;
  antrum: string;
  pylorus: string;
  duodenal_bulb: string;
  duodenum: string;
  hp_test: string;
  lesion_location: string;
  lesion_size: string;
  lesion_morphology: string;
  biopsy: string;
  conclusion: string;
  // Structured classifications (Module 3) — doctor-only, NOT touched by buildEndoscopyDraft.
  la_grade: "" | "A" | "B" | "C" | "D";
  paris_morphology: ParisMorphology[];
  nice_classification: "" | "1" | "2" | "3";
  jnet_classification: "" | "1" | "2A" | "2B" | "3";
}

export interface ClinicalContextAssessment {
  priority: string;
  summary: string;
  factors: string[];
  cautions: string[];
}

export interface DoctorReview {
  decision: "agree" | "edit" | "pending";
  final_diagnosis: string;
  treatment_recommendation: string;
  note: string;
  endoscopy_findings: EndoscopyFindings;
  updated_at?: string;
}

export interface AnalysisHistoryItem {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string;
  file_size: number;
  image_data_url: string;
  patient?: PatientInfo;
  clinical_context?: ClinicalContextAssessment;
  doctor_review?: DoctorReview;
  result: PredictionResult;
}
