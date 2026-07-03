import type { AnalysisHistoryItem } from "../types/history";

const HISTORY_STORAGE_KEY = "gastrovision.analysisHistory.v1";
const HISTORY_LIMIT = 8;

export function loadAnalysisHistory(): AnalysisHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAnalysisHistory(items: AnalysisHistoryItem[]): AnalysisHistoryItem[] {
  const bounded = items.slice(0, HISTORY_LIMIT);

  for (let size = bounded.length; size > 0; size -= 1) {
    const candidate = bounded.slice(0, size);
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(candidate));
      return candidate;
    } catch {
      continue;
    }
  }

  const compact = compactHistoryItem(bounded[0]);
  if (!compact) return [];

  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([compact]));
    return [compact];
  } catch {
    return [];
  }
}

export function addAnalysisHistoryItem(item: AnalysisHistoryItem): AnalysisHistoryItem[] {
  return saveAnalysisHistory([item, ...loadAnalysisHistory()]);
}

export function updateAnalysisHistoryItem(item: AnalysisHistoryItem): AnalysisHistoryItem[] {
  return saveAnalysisHistory(loadAnalysisHistory().map((historyItem) => (historyItem.id === item.id ? item : historyItem)));
}

export function clearAnalysisHistory() {
  window.localStorage.removeItem(HISTORY_STORAGE_KEY);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không thể đọc ảnh để lưu lịch sử."));
    reader.readAsDataURL(file);
  });
}

function compactHistoryItem(item: AnalysisHistoryItem | undefined): AnalysisHistoryItem | null {
  if (!item) return null;

  return {
    ...item,
    image_data_url: "",
    result: {
      ...item.result,
      polyp: {
        ...item.result.polyp,
        mask_base64: null,
        overlay_base64: null,
      },
    },
  };
}

