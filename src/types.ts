export type Locale = "uz" | "en";
export type Language = "auto" | "uz" | "en";

export interface Segment {
  id: string;
  project_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  language: string;
  confidence?: number | null;
}

export interface Clip {
  id: string;
  project_id: string;
  start_ms: number;
  end_ms: number;
  score: number;
  title: string;
  hook: string;
  reason: string;
  language: string;
  status: "suggested" | "approved" | "rejected";
  crop_mode: "center" | "left" | "right";
}

export interface Project {
  id: string;
  name: string;
  source_path: string;
  duration_ms: number;
  width: number;
  height: number;
  language: Language;
  created_at: string;
  updated_at: string;
  clip_count?: number;
  latest_job_status?: string | null;
  has_audio?: boolean;
  segments?: Segment[];
  clips?: Clip[];
  latest_job?: PersistedJob | null;
}

export interface PersistedJob {
  id: string;
  project_id?: string | null;
  kind: string;
  stage: string;
  status: "queued" | "running" | "cancelled" | "failed" | "completed" | "interrupted";
  progress: number;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  approx_mb: number;
  installed: boolean;
  source: string;
}

export interface RuntimeInfo {
  version: string;
  platform: string;
  python: string;
  ffmpeg_available: boolean;
  ffprobe_available: boolean;
  data_dir: string;
  models: ModelInfo[];
}

export interface WorkerEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface JobState {
  id: string;
  kind: "model" | "transcription" | "render";
  projectId?: string;
  progress: number;
  message: string;
}

export interface ExportResult {
  output_path: string;
  subtitle_path?: string | null;
  vtt_path?: string | null;
  metadata_path?: string | null;
  duration_ms: number;
  burn_captions: boolean;
}
