import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  AlertCircle, ArrowLeft, AudioLines, Check, CheckCircle2, ChevronDown, CircleHelp,
  Clapperboard, Clock3, Download, Film, FolderOpen, HardDrive, Languages, LoaderCircle,
  LockKeyhole, Play, Plus, Scissors, ShieldCheck, Sparkles, Trash2, Video,
  WandSparkles, X,
} from "lucide-react";
import { t } from "./i18n";
import type { Clip, ExportResult, JobState, Language, Locale, ModelInfo, Project, RuntimeInfo, Segment, WorkerEvent } from "./types";

const modelDescription: Record<string, { name: string; size: string; quality: string }> = {
  tiny: { name: "Tiny", size: "~75 MB", quality: "Fastest" },
  base: { name: "Base", size: "~145 MB", quality: "Balanced" },
  small: { name: "Small", size: "~490 MB", quality: "More accurate" },
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? String(hours) + ":" + mm + ":" + ss : String(minutes) + ":" + ss;
}

function formatClock(milliseconds: number) {
  return (milliseconds / 1000).toFixed(1);
}

function formatDate(value: string, locale: Locale) {
  try {
    return new Intl.DateTimeFormat(locale === "uz" ? "uz-UZ" : "en-US", {
      month: "short", day: "numeric",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem("uzclip-locale");
    return saved === "en" ? "en" : "uz";
  });
  const [projects, setProjects] = useState<Project[]>([]);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<JobState | null>(null);
  const [selectedModel, setSelectedModel] = useState("base");
  const [speechLanguage, setSpeechLanguage] = useState<Language>("auto");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [clipStart, setClipStart] = useState("");
  const [clipEnd, setClipEnd] = useState("");
  const [cropMode, setCropMode] = useState<"center" | "left" | "right">("center");
  const [burnCaptions, setBurnCaptions] = useState(true);
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error" | "info"; message: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeJobRef = useRef<JobState | null>(null);
  const T = useCallback((key: Parameters<typeof t>[1]) => t(locale, key), [locale]);

  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  const refresh = useCallback(async () => {
    try {
      const [projectRows, status] = await Promise.all([
        window.uzclip.request<Project[]>("projects.list"),
        window.uzclip.request<RuntimeInfo>("runtime.status"),
      ]);
      setProjects(projectRows);
      setRuntime(status);
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  }, [T]);

  const refreshProject = useCallback(async (projectId: string) => {
    const updated = await window.uzclip.request<Project>("projects.get", { project_id: projectId });
    setProject(updated);
    const firstClip = updated.clips?.[0];
    const selected = updated.clips?.find((clip) => clip.id === selectedClipId) || firstClip;
    setSelectedClipId(selected?.id || null);
    if (selected) {
      setClipStart(formatClock(selected.start_ms));
      setClipEnd(formatClock(selected.end_ms));
      setCropMode(selected.crop_mode);
    }
    await refresh();
  }, [refresh, selectedClipId]);

  const openProject = useCallback(async (projectId: string) => {
    try {
      const [updated, url] = await Promise.all([
        window.uzclip.request<Project>("projects.get", { project_id: projectId }),
        window.uzclip.mediaUrl(projectId),
      ]);
      setProject(updated);
      setMediaUrl(url);
      setSpeechLanguage(updated.language || "auto");
      const firstClip = updated.clips?.[0];
      setSelectedClipId(firstClip?.id || null);
      setClipStart(firstClip ? formatClock(firstClip.start_ms) : "0");
      setClipEnd(firstClip ? formatClock(firstClip.end_ms) : "");
      setCropMode(firstClip?.crop_mode || "center");
      if (updated.latest_job?.status === "interrupted") {
        setToast({ kind: "info", message: T("jobInterrupted") });
      }
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  }, [T]);

  useEffect(() => {
    void refresh();
    const unsubscribe = window.uzclip.onEvent((payload: WorkerEvent) => {
      const current = activeJobRef.current;
      const jobId = String(payload.data.job_id || "");
      if (payload.event === "runtime.worker-stopped") {
        setToast({ kind: "error", message: T("operationFailed") });
        return;
      }
      if (!current || !jobId || current.id !== jobId) return;
      if (payload.event === "job.progress") {
        setActiveJob({
          ...current,
          progress: Number(payload.data.progress || 0),
          message: String(payload.data.message || current.message),
        });
      } else if (payload.event === "job.completed") {
        const result = payload.data.result as Record<string, unknown> | undefined;
        setActiveJob(null);
        if (current.kind === "model") {
          setToast({ kind: "success", message: T("modelInstallReady") });
          void refresh();
        } else if (current.kind === "transcription" && current.projectId) {
          setToast({ kind: "success", message: T("transcriptionReady") });
          void refreshProject(current.projectId);
        } else if (current.kind === "render") {
          const output = result as unknown as ExportResult | undefined;
          const message = output?.output_path ? T("exportReady") + " " + output.output_path : T("exportReady");
          setToast({ kind: "success", message });
          if (current.projectId) void refreshProject(current.projectId);
        }
      } else if (payload.event === "job.failed") {
        setActiveJob(null);
        setToast({ kind: "error", message: String(payload.data.message || T("operationFailed")) });
      } else if (payload.event === "job.cancelled") {
        setActiveJob(null);
        setToast({ kind: "info", message: T("cancel") });
      }
    });
    return unsubscribe;
  }, [refresh, refreshProject, T]);

  const installedModels = runtime?.models || [];
  const modelReady = installedModels.some((model) => model.id === selectedModel && model.installed);
  const selectedClip = useMemo(
    () => project?.clips?.find((clip) => clip.id === selectedClipId) || null,
    [project, selectedClipId],
  );

  useEffect(() => {
    if (!selectedClip) return;
    setClipStart(formatClock(selectedClip.start_ms));
    setClipEnd(formatClock(selectedClip.end_ms));
    setCropMode(selectedClip.crop_mode);
    if (videoRef.current) {
      videoRef.current.currentTime = selectedClip.start_ms / 1000;
      setPlaying(false);
    }
  }, [selectedClip?.id, selectedClip?.start_ms]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;
    const stopAtClipEnd = () => {
      if (video.currentTime >= selectedClip.end_ms / 1000) {
        video.pause();
        video.currentTime = selectedClip.start_ms / 1000;
        setPlaying(false);
      }
    };
    video.addEventListener("timeupdate", stopAtClipEnd);
    return () => video.removeEventListener("timeupdate", stopAtClipEnd);
  }, [selectedClip?.id, selectedClip?.start_ms, selectedClip?.end_ms]);

  const changeLocale = (value: Locale) => {
    setLocale(value);
    localStorage.setItem("uzclip-locale", value);
  };

  const importVideo = async () => {
    setBusy(true);
    try {
      const path = await window.uzclip.openVideo();
      if (!path) return;
      const created = await window.uzclip.request<Project>("projects.import", { path, language: "auto" });
      await refresh();
      await openProject(created.id);
      setToast({ kind: created.has_audio === false ? "info" : "success", message: created.has_audio === false ? T("unsupportedAudio") : T("selectedVideo") });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("importFailed") });
    } finally {
      setBusy(false);
    }
  };

  const startTranscription = async () => {
    if (!project) return;
    if (!modelReady) {
      setShowModelDialog(true);
      setToast({ kind: "info", message: T("installModelFirst") });
      return;
    }
    try {
      const response = await window.uzclip.request<{ job_id: string }>("transcription.start", {
        project_id: project.id, language: speechLanguage, model_size: selectedModel,
      });
      setActiveJob({ id: response.job_id, kind: "transcription", projectId: project.id, progress: 0.02, message: T("stepTranscribe") });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  };

  const installModel = async () => {
    try {
      const response = await window.uzclip.request<{ job_id: string }>("models.install", { model_size: selectedModel });
      setActiveJob({ id: response.job_id, kind: "model", progress: 0.02, message: T("modelDownloading") });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  };

  const cancelJob = async () => {
    if (!activeJob) return;
    try {
      await window.uzclip.request("jobs.cancel", { job_id: activeJob.id });
    } catch {
      setToast({ kind: "error", message: T("operationFailed") });
    }
  };

  const updateSelectedClip = async (status = selectedClip?.status || "suggested") => {
    if (!project || !selectedClip) return;
    const startMs = Math.max(0, Math.round(Number(clipStart) * 1000));
    const endMs = Math.round(Number(clipEnd) * 1000);
    try {
      await window.uzclip.request("clips.update", {
        project_id: project.id, clip_id: selectedClip.id, start_ms: startMs,
        end_ms: endMs, crop_mode: cropMode, status,
      });
      await refreshProject(project.id);
      setToast({ kind: "success", message: status === "approved" ? T("approved") : T("saveEdit") });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  };

  const updateTranscriptSegment = async (segmentId: string, text: string) => {
    if (!project) return;
    try {
      await window.uzclip.request("transcript.update", {
        project_id: project.id,
        segment_id: segmentId,
        text,
      });
      await refreshProject(project.id);
      setToast({ kind: "success", message: T("transcriptSaved") });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
      throw error;
    }
  };

  const exportClip = async () => {
    if (!project || !selectedClip) return;
    const safeName = project.name.replace(/[^\p{L}\p{N}-]+/gu, "-") + "-short.mp4";
    const outputPath = await window.uzclip.saveVideo(safeName);
    if (!outputPath) return;
    try {
      await window.uzclip.request("clips.update", {
        project_id: project.id, clip_id: selectedClip.id,
        start_ms: Math.max(0, Math.round(Number(clipStart) * 1000)),
        end_ms: Math.round(Number(clipEnd) * 1000), crop_mode: cropMode, status: "approved",
      });
      const response = await window.uzclip.request<{ job_id: string }>("clips.render", {
        project_id: project.id, clip_id: selectedClip.id, output_path: outputPath, burn_captions: burnCaptions,
      });
      setActiveJob({ id: response.job_id, kind: "render", projectId: project.id, progress: 0.02, message: T("exportBusy") });
      await refreshProject(project.id);
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  };

  const deleteProject = async () => {
    if (!project || !window.confirm(T("confirmDelete"))) return;
    try {
      await window.uzclip.request("projects.delete", { project_id: project.id });
      setProject(null);
      setMediaUrl(null);
      setSelectedClipId(null);
      await refresh();
      setToast({ kind: "success", message: T("deleteProject") });
    } catch (error) {
      setToast({ kind: "error", message: error instanceof Error ? error.message : T("operationFailed") });
    }
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (selectedClip && (video.currentTime < selectedClip.start_ms / 1000 || video.currentTime >= selectedClip.end_ms / 1000)) {
        video.currentTime = selectedClip.start_ms / 1000;
      }
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setProject(null)} aria-label="UzClip AI home">
          <span className="brand-mark"><Scissors size={19} strokeWidth={2.7} /></span>
          <span className="brand-copy"><strong>uzclip<span>ai</span></strong><small>LOCAL VIDEO STUDIO</small></span>
        </button>
        <div className="side-section-label">{T("dashboard")}</div>
        <button className={"side-link " + (!project ? "active" : "")} onClick={() => setProject(null)}>
          <Clapperboard size={17} /><span>{T("dashboard")}</span>
        </button>
        <div className="side-project-head"><span>{T("projects")}</span><button className="icon-button mini" onClick={() => void importVideo()} aria-label={T("newProject")}><Plus size={15} /></button></div>
        <div className="side-projects">
          {projects.length === 0 ? <div className="side-empty">{T("noProjects")}</div> : projects.slice(0, 6).map((row) => (
            <button key={row.id} className={"side-project " + (project?.id === row.id ? "selected" : "")} onClick={() => void openProject(row.id)}>
              <span className="side-project-icon"><Film size={15} /></span>
              <span className="side-project-copy"><strong>{row.name}</strong><small>{formatDuration(row.duration_ms)}</small></span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={17} /></div><div><strong>{T("privacyTitle")}</strong><p>{T("privacyBody")}</p></div></div>
          <div className="sidebar-meta"><span className={"status-dot " + (runtime?.ffmpeg_available ? "green" : "amber")} /><span>{runtime?.ffmpeg_available ? T("ffmpegReady") : T("ffmpegMissing")}</span><span className="version">{runtime?.version || "0.1.0"}</span></div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="topbar-heading"><div className="eyebrow">{project ? "PROJECT WORKSPACE" : "LOCAL-FIRST CLIP MAKER"}</div><div className="topbar-title">{project ? project.name : T("tagline")}</div></div>
          <div className="topbar-actions">
            <div className="locale-switch" role="group" aria-label="Language">
              <button className={locale === "uz" ? "chosen" : ""} onClick={() => changeLocale("uz")}>UZ</button>
              <button className={locale === "en" ? "chosen" : ""} onClick={() => changeLocale("en")}>EN</button>
            </div>
            <button className="model-pill" onClick={() => setShowModelDialog(true)}>
              <span className={"model-indicator " + (modelReady ? "ready" : "")} />
              <span>{modelReady ? modelDescription[selectedModel]?.name : T("noModel")}</span><ChevronDown size={14} />
            </button>
            <button className="button button-primary button-small" onClick={() => void importVideo()} disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{T("newProject")}
            </button>
          </div>
        </header>

        <main className="page-content">
          {project ? (
            <ProjectWorkspace
              project={project} mediaUrl={mediaUrl} runtime={runtime} locale={locale}
              selectedModel={selectedModel} speechLanguage={speechLanguage} setSpeechLanguage={setSpeechLanguage}
              modelReady={modelReady} selectedClip={selectedClip} selectedClipId={selectedClipId}
              setSelectedClipId={setSelectedClipId} clipStart={clipStart} setClipStart={setClipStart}
              clipEnd={clipEnd} setClipEnd={setClipEnd} cropMode={cropMode} setCropMode={setCropMode}
              burnCaptions={burnCaptions} setBurnCaptions={setBurnCaptions} activeJob={activeJob}
              videoRef={videoRef} playing={playing} showTranscript={showTranscript}
              setShowTranscript={setShowTranscript} startTranscription={() => void startTranscription()}
              openModelDialog={() => setShowModelDialog(true)} saveClip={(status) => void updateSelectedClip(status)}
              exportClip={() => void exportClip()} togglePlay={() => void togglePlay()} cancelJob={() => void cancelJob()}
              deleteProject={() => void deleteProject()} goHome={() => setProject(null)}
              saveTranscriptSegment={updateTranscriptSegment} T={T}
            />
          ) : (
            <Home projects={projects} locale={locale} runtime={runtime} busy={busy}
              openProject={(id) => void openProject(id)} importVideo={() => void importVideo()} T={T} />
          )}
        </main>
      </section>

      {showModelDialog && (
        <ModelDialog locale={locale} models={installedModels} selectedModel={selectedModel}
          setSelectedModel={setSelectedModel} activeJob={activeJob?.kind === "model" ? activeJob : null}
          installModel={() => void installModel()} close={() => setShowModelDialog(false)} T={T} />
      )}
      {toast && (
        <div className={"toast " + toast.kind} role="status">
          {toast.kind === "error" ? <AlertCircle size={17} /> : toast.kind === "success" ? <CheckCircle2 size={17} /> : <CircleHelp size={17} />}
          <span>{toast.message}</span><button className="toast-close" onClick={() => setToast(null)} aria-label="Close"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}

function Home({
  projects, locale, runtime, busy, openProject, importVideo, T,
}: {
  projects: Project[];
  locale: Locale;
  runtime: RuntimeInfo | null;
  busy: boolean;
  openProject: (id: string) => void;
  importVideo: () => void;
  T: (key: Parameters<typeof t>[1]) => string;
}) {
  const steps = [
    { icon: AudioLines, title: T("stepTranscribe"), body: locale === "uz" ? "O‘zbekcha yoki inglizcha" : "Uzbek or English" },
    { icon: WandSparkles, title: T("stepMoments"), body: locale === "uz" ? "Ball va sabab bilan" : "With score and reason" },
    { icon: Scissors, title: T("stepReview"), body: locale === "uz" ? "Vaqtni qo‘lda sozlang" : "Adjust clip boundaries" },
    { icon: Download, title: T("stepExport"), body: locale === "uz" ? "MP4 va SRT" : "MP4 and SRT" },
  ];
  return (
    <div className="home-page">
      <section className="hero-card">
        <div className="hero-text">
          <div className="hero-kicker"><Sparkles size={14} /> LOCAL AI · NO SUBSCRIPTION</div>
          <h1>{T("heroTitle")}<br /><span>{T("heroAccent")}</span></h1>
          <p>{T("heroBody")}</p>
          <div className="hero-actions"><button className="button button-light" onClick={importVideo} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <FolderOpen size={17} />}{T("importVideo")}</button><span className="supported">{T("supported")}</span></div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="hero-video-card">
            <div className="hero-video-top"><span /><span /><span /></div>
            <div className="hero-video-frame"><div className="hero-silhouette"><span /><i /></div><div className="frame-corner top-left" /><div className="frame-corner bottom-right" /><div className="caption-preview">Yaxshi fikrlar shu yerdan boshlanadi.</div></div>
            <div className="hero-video-footer"><span>00:34</span><div><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><span>01:12</span></div>
          </div>
          <div className="floating-score"><Sparkles size={14} /><span><strong>92</strong><small>clip score</small></span></div>
          <div className="floating-badge"><AudioLines size={14} /> UZ · EN</div>
        </div>
        <div className="hero-glow" />
      </section>

      <section className="workflow-section">
        <div className="section-heading"><div><div className="eyebrow">FROM LONG VIDEO TO SHORTS</div><h2>{T("pipeline")}</h2></div><span className="local-chip"><LockKeyhole size={13} /> {T("offlineLabel")}</span></div>
        <div className="workflow-grid">
          {steps.map(({ icon: Icon, title, body }, index) => (
            <div className="workflow-step" key={title}><div className="workflow-icon"><Icon size={19} /></div><div className="workflow-number">0{index + 1}</div><strong>{title}</strong><small>{body}</small>{index < 3 && <span className="step-connector" />}</div>
          ))}
        </div>
      </section>

      <section className="projects-section">
        <div className="section-heading"><div><div className="eyebrow">{T("allProjects").toUpperCase()}</div><h2>{T("recentProjects")}</h2></div>{projects.length > 0 && <span className="count-chip">{projects.length} {T("projects").toLowerCase()}</span>}</div>
        {projects.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Video size={22} /></div><strong>{T("noProjects")}</strong><p>{T("noProjectsBody")}</p><button className="button button-secondary" onClick={importVideo}><Plus size={16} />{T("openFolder")}</button></div>
        ) : (
          <div className="project-grid">
            {projects.slice(0, 4).map((item, index) => (
              <button className={"project-card"} key={item.id} onClick={() => openProject(item.id)}>
                <div className={"project-thumb thumb-" + (index % 4)}><Film size={25} />{item.latest_job_status === "interrupted" && <span className="interrupted-badge" title={T("jobInterrupted")}><AlertCircle size={12} /></span>}<span className="duration-badge">{formatDuration(item.duration_ms)}</span><span className="project-play"><Play size={14} fill="currentColor" /></span></div>
                <div className="project-card-info"><div><strong>{item.name}</strong><small>{formatDate(item.updated_at, locale)}</small></div><span className="project-clip-count">{item.clip_count || 0} <Scissors size={12} /></span></div>
              </button>
            ))}
          </div>
        )}
      </section>
      <footer className="home-footer"><span><ShieldCheck size={14} /> {T("privacy")}</span><span>{runtime?.ffmpeg_available ? T("ffmpegReady") : T("ffmpegMissing")}</span></footer>
    </div>
  );
}

function ProjectWorkspace(props: {
  project: Project;
  mediaUrl: string | null;
  runtime: RuntimeInfo | null;
  locale: Locale;
  selectedModel: string;
  speechLanguage: Language;
  setSpeechLanguage: (value: Language) => void;
  modelReady: boolean;
  selectedClip: Clip | null;
  selectedClipId: string | null;
  setSelectedClipId: (value: string) => void;
  clipStart: string;
  setClipStart: (value: string) => void;
  clipEnd: string;
  setClipEnd: (value: string) => void;
  cropMode: "center" | "left" | "right";
  setCropMode: (value: "center" | "left" | "right") => void;
  burnCaptions: boolean;
  setBurnCaptions: (value: boolean) => void;
  activeJob: JobState | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  showTranscript: boolean;
  setShowTranscript: (value: boolean) => void;
  startTranscription: () => void;
  openModelDialog: () => void;
  saveClip: (status?: "suggested" | "approved" | "rejected") => void;
  exportClip: () => void;
  togglePlay: () => void;
  cancelJob: () => void;
  deleteProject: () => void;
  goHome: () => void;
  saveTranscriptSegment: (segmentId: string, text: string) => Promise<void>;
  T: (key: Parameters<typeof t>[1]) => string;
}) {
  const {
    project, mediaUrl, runtime, locale, speechLanguage, setSpeechLanguage,
    modelReady, selectedClip, selectedClipId, setSelectedClipId, clipStart, setClipStart,
    clipEnd, setClipEnd, cropMode, setCropMode, burnCaptions, setBurnCaptions,
    activeJob, videoRef, playing, showTranscript, setShowTranscript, startTranscription,
    openModelDialog, saveClip, exportClip, togglePlay, cancelJob, deleteProject, goHome,
    saveTranscriptSegment, T,
  } = props;
  const jobForProject = activeJob?.projectId === project.id ? activeJob : activeJob?.kind === "model" ? activeJob : null;
  const clips = project.clips || [];
  return (
    <div className="project-workspace">
      <div className="project-toolbar">
        <div className="project-meta-line"><button className="back-link" onClick={goHome}><ArrowLeft size={15} /> {T("dashboard")}</button><span className="meta-divider" /><span className="file-name"><Film size={14} /> {project.name}</span></div>
        <div className="project-toolbar-actions">
          <div className="select-wrap"><Languages size={15} /><select value={speechLanguage} onChange={(event) => setSpeechLanguage(event.target.value as Language)} aria-label={T("language")}><option value="auto">{T("autoDetect")}</option><option value="uz">{T("uzbek")}</option><option value="en">{T("english")}</option></select></div>
          <button className="button button-primary" onClick={modelReady ? startTranscription : openModelDialog} disabled={Boolean(jobForProject) || !runtime?.ffmpeg_available}>
            {jobForProject && jobForProject.kind !== "model" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            {jobForProject && jobForProject.kind !== "model" ? T("transcribeBusy") : T("transcribe")}
          </button>
        </div>
      </div>

      {jobForProject && <div className="job-banner"><div className="job-icon"><LoaderCircle className="spin" size={17} /></div><div className="job-info"><strong>{jobForProject.message || T("processing")}</strong><div className="progress-track"><span style={{ width: Math.max(4, jobForProject.progress * 100) + "%" }} /></div></div><span className="job-percent">{Math.round(jobForProject.progress * 100)}%</span>{(jobForProject.kind === "transcription" || jobForProject.kind === "render") && <button className="icon-button mini" onClick={cancelJob} title={T("cancel")}><X size={16} /></button>}</div>}
      {!runtime?.ffmpeg_available && <div className="notice-banner warning"><AlertCircle size={17} /><span>{T("ffmpegMissing")} — install FFmpeg and make ffmpeg/ffprobe available on PATH.</span></div>}

      <div className="workspace-grid">
        <section className="preview-panel panel">
          <div className="panel-heading"><div><div className="eyebrow">{T("preview").toUpperCase()}</div><h2>{T("selectedVideo")}</h2></div><span className="panel-tag"><LockKeyhole size={12} /> LOCAL</span></div>
          <div className="video-stage">
            {mediaUrl ? <video ref={videoRef} src={mediaUrl} preload="metadata" /> : <div className="video-placeholder"><Film size={34} /></div>}
            {mediaUrl && <button className="video-play" onClick={togglePlay}>{playing ? <span className="pause-icon" /> : <Play size={20} fill="currentColor" />}</button>}
            <div className="video-overlay"><span><span className="live-dot" /> ORIGINAL</span><span>{project.width} × {project.height}</span></div>
          </div>
          <div className="video-meta">
            <div><Clock3 size={15} /><span>{T("duration")}</span><strong>{formatDuration(project.duration_ms)}</strong></div>
            <div><Film size={15} /><span>{T("resolution")}</span><strong>{project.width}×{project.height}</strong></div>
            <div><HardDrive size={15} /><span>{T("language")}</span><strong>{speechLanguage === "auto" ? T("autoDetect") : speechLanguage.toUpperCase()}</strong></div>
          </div>
          {selectedClip && <div className="selected-range"><div className="selected-range-head"><strong>{T("selectedClip")}</strong><span>{formatDuration(selectedClip.end_ms - selectedClip.start_ms)}</span></div><div className="range-rail"><span style={{ left: Math.min(98, selectedClip.start_ms / project.duration_ms * 100) + "%", width: Math.max(2, (selectedClip.end_ms - selectedClip.start_ms) / project.duration_ms * 100) + "%" }} /></div><div className="range-labels"><span>{formatDuration(selectedClip.start_ms)}</span><span>{formatDuration(selectedClip.end_ms)}</span></div></div>}
        </section>

        <section className="editor-panel panel">
          <div className="panel-heading"><div><div className="eyebrow">{T("selectedClip").toUpperCase()}</div><h2>{selectedClip?.title || (locale === "uz" ? "Klipni tanlang" : "Select a clip")}</h2></div>{selectedClip && <div className="score-badge"><Sparkles size={13} /> {selectedClip.score}</div>}</div>
          {selectedClip ? (
            <>
              <div className="clip-hook"><span className="quote-mark">“</span><p>{selectedClip.hook}</p></div>
              <div className="edit-fields">
                <label><span>{T("start")}</span><div className="input-with-unit"><input type="number" min="0" step="0.1" value={clipStart} onChange={(event) => setClipStart(event.target.value)} /><small>sec</small></div></label>
                <label><span>{T("end")}</span><div className="input-with-unit"><input type="number" min="0" step="0.1" value={clipEnd} onChange={(event) => setClipEnd(event.target.value)} /><small>sec</small></div></label>
              </div>
              <small className="field-note">{T("trimNote")}</small>
              <label className="select-label"><span>{T("crop")}</span><div className="select-box"><select value={cropMode} onChange={(event) => setCropMode(event.target.value as "center" | "left" | "right")}><option value="center">{T("center")}</option><option value="left">{T("left")}</option><option value="right">{T("right")}</option></select><ChevronDown size={14} /></div></label>
              <label className="check-row"><input type="checkbox" checked={burnCaptions} onChange={(event) => setBurnCaptions(event.target.checked)} /><span className="fake-check"><Check size={12} /></span><span>{T("captions")}</span></label>
              <p className="subtitle-note">{T("subtitleExport")}</p>
              <div className="editor-actions"><button className="button button-secondary" onClick={() => saveClip("approved")}><Check size={15} />{T("approve")}</button><button className="button button-primary" onClick={exportClip} disabled={Boolean(activeJob)}><Download size={16} />{activeJob?.kind === "render" ? T("exportBusy") : T("exportClip")}</button></div>
            </>
          ) : (
            <div className="editor-empty"><div className="empty-icon"><Scissors size={20} /></div><p>{T("noClips")}</p><button className="text-button" onClick={startTranscription}>{T("runAnalysis")} <ArrowLeft size={14} className="arrow-right" /></button></div>
          )}
        </section>
      </div>

      <section className="clip-section">
        <div className="section-heading compact"><div><div className="eyebrow">AI MOMENT FINDER</div><h2>{T("clips")} <span className="title-count">{clips.length}</span></h2></div><p>{T("clipsSub")}</p></div>
        {clips.length === 0 ? (
          <div className="clip-empty"><div className="empty-icon"><WandSparkles size={20} /></div><strong>{T("noClips")}</strong><p>{project.segments?.length ? T("runAnalysis") : T("noTranscript")}</p></div>
        ) : (
          <div className="clip-grid">
            {clips.map((clip, index) => (
              <button className={"clip-card " + (clip.id === selectedClipId ? "selected" : "")} key={clip.id} onClick={() => setSelectedClipId(clip.id)}>
                <div className={"clip-cover clip-cover-" + (index % 4)}><span className="clip-rank">0{index + 1}</span><span className="clip-score"><Sparkles size={12} />{clip.score}</span><span className="clip-duration">{formatDuration(clip.end_ms - clip.start_ms)}</span><span className="clip-play"><Play size={12} fill="currentColor" /></span></div>
                <div className="clip-card-body"><strong>{clip.title}</strong><p>{clip.reason}</p><div className="clip-card-meta"><span>{formatDuration(clip.start_ms)} – {formatDuration(clip.end_ms)}</span>{clip.status === "approved" && <span className="approved-mark"><CheckCircle2 size={12} /> {T("approved")}</span>}</div></div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="transcript-section panel">
        <button className="transcript-toggle" onClick={() => setShowTranscript(!showTranscript)}>
          <div className="panel-heading"><div><div className="eyebrow">LOCAL WHISPER</div><h2>{T("transcript")}</h2></div><span className="transcript-count">{project.segments?.length || 0} {locale === "uz" ? "bo‘lak" : "segments"}</span></div><ChevronDown size={17} className={showTranscript ? "rotate" : ""} />
        </button>
        {showTranscript && <div className="transcript-list">{(project.segments || []).length === 0 ? <p className="transcript-empty">{T("noTranscript")}</p> : (project.segments || []).map((segment) => <TranscriptLine key={segment.id} segment={segment} save={saveTranscriptSegment} T={T} />)}</div>}
      </section>
      <div className="project-footer"><span><ShieldCheck size={14} /> {T("privacy")}</span><button className="danger-link" onClick={deleteProject}><Trash2 size={14} />{T("deleteProject")}</button></div>
    </div>
  );
}

function TranscriptLine({
  segment, save, T,
}: {
  segment: Segment;
  save: (segmentId: string, text: string) => Promise<void>;
  T: (key: Parameters<typeof t>[1]) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(segment.text), [segment.text]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || text === segment.text) {
      setDraft(segment.text);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await save(segment.id, text);
      setEditing(false);
    } catch {
      // The parent keeps the error toast and the editor open for correction.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={"transcript-line " + (editing ? "editing" : "")}>
      <span>{formatDuration(segment.start_ms)}</span>
      {editing ? (
        <div className="transcript-editor">
          <textarea value={draft} maxLength={2000} autoFocus onChange={(event) => setDraft(event.target.value)} />
          <div className="transcript-actions">
            <button className="text-button muted" disabled={saving} onClick={() => { setDraft(segment.text); setEditing(false); }}>{T("cancel")}</button>
            <button className="text-button" disabled={saving || !draft.trim()} onClick={() => void submit()}>{saving ? T("processing") : T("saveTranscript")}</button>
          </div>
        </div>
      ) : (
        <div className="transcript-copy"><p>{segment.text}</p><button className="transcript-edit" onClick={() => setEditing(true)}>{T("editTranscript")}</button></div>
      )}
    </div>
  );
}

function ModelDialog({
  locale, models, selectedModel, setSelectedModel, activeJob, installModel, close, T,
}: {
  locale: Locale;
  models: ModelInfo[];
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  activeJob: JobState | null;
  installModel: () => void;
  close: () => void;
  T: (key: Parameters<typeof t>[1]) => string;
}) {
  const selected = modelDescription[selectedModel];
  const installed = models.some((model) => model.id === selectedModel && model.installed);
  const source = models.find((model) => model.id === selectedModel)?.source || "Systran/faster-whisper-" + selectedModel;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="model-dialog" role="dialog" aria-modal="true" aria-labelledby="model-title">
        <div className="dialog-top"><div className="dialog-icon"><AudioLines size={20} /></div><button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button></div>
        <div className="eyebrow">{T("localAi").toUpperCase()}</div><h2 id="model-title">{T("model")}</h2><p className="dialog-lede">{T("modelExplain")}</p>
        <div className="model-options">
          {Object.entries(modelDescription).map(([id, info]) => {
            const isInstalled = models.some((model) => model.id === id && model.installed);
            return <button key={id} className={"model-option " + (selectedModel === id ? "active" : "")} onClick={() => setSelectedModel(id)}>
              <span className="model-radio">{selectedModel === id && <i />}</span><span className="model-option-main"><strong>{info.name} <small>{info.quality}</small></strong><span>{info.size}</span></span>{isInstalled && <span className="installed-tag"><CheckCircle2 size={12} /> {T("modelReady")}</span>}
            </button>;
          })}
        </div>
        <div className="model-source"><span>{T("source")}</span><code>{source}</code><span>{T("size")}</span><strong>{selected?.size}</strong></div>
        <div className="download-notice"><ShieldCheck size={16} /><span>{locale === "uz" ? "Video va transkript internetga yuborilmaydi. Model fayllari Hugging Face’dan bir marta yuklanadi." : "Your video and transcript are never uploaded. Model files download once from Hugging Face."}</span></div>
        <button className="button button-primary dialog-action" onClick={installModel} disabled={Boolean(activeJob) || installed}>{activeJob ? <LoaderCircle className="spin" size={16} /> : installed ? <Check size={16} /> : <Download size={16} />}{activeJob ? T("modelDownloading") : installed ? T("modelReady") : T("getModel")}</button>
        {activeJob && <div className="dialog-progress"><div className="progress-track"><span style={{ width: Math.max(4, activeJob.progress * 100) + "%" }} /></div><small>{activeJob.message}</small></div>}
      </div>
    </div>
  );
}
