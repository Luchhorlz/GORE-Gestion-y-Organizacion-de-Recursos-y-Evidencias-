import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  FileText,
  FolderLock,
  Gavel,
  Home,
  Info,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
  CheckCheck,
  FileArchive,
  Image,
  Paperclip,
  Phone,
  Smile,
  Video,
} from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import "./App.css";
import {
  apiDelete,
  apiFileUrl,
  apiGet,
  apiPost,
  apiPut,
  apiUpload,
  evidenceDownloadUrl,
} from "./api";
import JSZip from "jszip";
import {
  sha256Hex,
  validateGoreWhatsAppManifest,
  type GoreWhatsAppManifest,
} from "./whatsappManifest";

type View =
  | "inicio"
  | "calendario"
  | "acontecimientos"
  | "cronologia-ia"
  | "fechas"
  | "evidencias"
  | "analisis-evidencia"
  | "asistente"
  | "contradicciones"
  | "borradores"
  | "chat-ia"
  | "ia-estado"
  | "historial-ia"
  | "comunicaciones"
  | "whatsapp"
  | "informes"
  | "auditoria"
  | "configuracion";
type EventItem = {
  id: string;
  date: string;
  time: string;
  category: string;
  title: string;
  description: string;
  privateNotes?: string;
  expected?: string;
  actual?: string;
  evidenceCount: number;
  status: "Borrador" | "Pendiente de revisión" | "Revisado";
};
type Evidence = {
  id: string;
  name: string;
  size: number;
  type: string;
  hash: string;
  addedAt: string;
  eventId?: string;
  factDate?: string;
  chatMessageRef?: string;
  matchConfidence?: string;
  matchDetails?: string;
  processingStatus?: string;
  detectedType?: string;
  processingError?: string;
  extractionStatus?: string;
  extractionError?: string;
  embeddingStatus?: string;
  embeddingError?: string;
};
type ExtractedText = {
  evidenceId: string;
  status: string;
  error: string;
  summary: {
    character_count: number;
    section_count: number;
    engine: string;
    source_sha256: string;
  } | null;
  chunks: {
    section_label: string;
    section_index: number;
    chunk_index: number;
    text: string;
    text_sha256: string;
    extraction_method: string;
  }[];
};
type SemanticSearchResult = {
  score: number;
  sourceType?: "evidence" | "whatsapp_chat";
  chatId?: string;
  evidenceId: string;
  evidenceName: string;
  evidenceHash: string;
  factDate: string;
  eventId?: string;
  sectionLabel: string;
  sectionIndex: number;
  chunkIndex: number;
  text: string;
  textHash: string;
  method: string;
};
type SemanticSearchResponse = {
  query: string;
  model: string;
  indexedEvidence: number;
  indexedChats?: number;
  results: SemanticSearchResult[];
};
type AudioIndexStatus = {
  total: number;
  transcribed: number;
  empty: number;
  completed: number;
  indexed: number;
  queued: number;
  failed: number;
  percent: number;
  finished: boolean;
};
type WhatsAppAnalysisStatus = {
  chatId: string;
  displayName: string;
  status: string;
  totalMessages: number;
  analyzedMessages: number;
  pendingMessages: number;
  percent: number;
  jobId?: string;
  stage: string;
  proposalsCreated: number;
  summarySegments?: number;
  updatedAt: string;
};
type AssistantCitation = SemanticSearchResult & { sourceId: string };
type AssistantAnswer = {
  question: string;
  answer: string;
  insufficientEvidence: boolean;
  caveats: string[];
  citations: AssistantCitation[];
  model: string;
  profile: string;
};
type CaseSummary = {
  id: string;
  executiveSummary: string;
  mainFacts: string[];
  peopleInvolved: string[];
  availableEvidence: string[];
  missingInformation: string[];
  questionsPending: string[];
  confidence: number;
  insufficientEvidence: boolean;
  humanReviewRequired: boolean;
  sources: AssistantCitation[];
  model: string;
  profile: string;
  generatedAt: string;
};
type ChronologyProposal = {
  id: string;
  date: string;
  time: string;
  description: string;
  people: string[];
  certainty: number;
  dateBasis: "explicit" | "inferred" | "file_date";
  sources: AssistantCitation[];
  status: "pending_review" | "approved" | "rejected";
  approvedEventId?: string;
};
type ContradictionItem = {
  claimA: string;
  sourceA: string;
  claimB: string;
  sourceB: string;
  reason: string;
  alternativeExplanation: string;
  severity: "low" | "medium" | "high";
  confidence: number;
};
type ContradictionsAnalysis = {
  id: string;
  contradictions: ContradictionItem[];
  sources: AssistantCitation[];
  noContradictionsFound: boolean;
  humanReviewRequired: boolean;
  model: string;
  profile: string;
  generatedAt: string;
};
type EvidenceAnalysisItem = {
  sourceId: string;
  classification: "favorable" | "desfavorable" | "neutral";
  relevance: string;
  limitations: string;
  authenticityConcerns: string[];
  confidence: number;
};
type EvidenceAnalysis = {
  id: string;
  items: EvidenceAnalysisItem[];
  missingEvidence: string[];
  sources: AssistantCitation[];
  insufficientEvidence: boolean;
  model: string;
  profile: string;
  generatedAt: string;
};
type DateProposal = {
  id: string;
  date: string;
  time: string;
  type: string;
  reason: string;
  dateBasis: "explicit" | "inferred" | "file_date";
  certainty: number;
  sources: AssistantCitation[];
  warning: string;
  status: "pending_review" | "approved" | "rejected";
  approvedEventId?: string;
};
type AIDraft = {
  id: string;
  draftType: string;
  draftTypeLabel: string;
  title: string;
  body: string;
  unconfirmedInformation: string[];
  reviewFields: string[];
  sources: AssistantCitation[];
  disclaimer: string;
  model: string;
  profile: string;
  generatedAt: string;
};
type AIChatJob = {
  id: string;
  progress: number;
  stage: string;
  status: string;
  model: string;
};
type AIActionProposal = {
  id: string;
  actionType:
    | "create_event"
    | "link_evidence_to_event"
    | "update_event_category"
    | "update_event_details";
  payload: {
    date?: string;
    time?: string;
    category?: string;
    title?: string;
    description?: string;
    expected?: string;
    actual?: string;
    eventId?: string;
    eventTitle?: string;
    evidenceId?: string;
    evidenceName?: string;
    previousEventId?: string;
    previousCategory?: string;
    newCategory?: string;
    previous?: Record<string, string>;
    new?: Record<string, string>;
    changes?: Record<string, { before: string; after: string }>;
  };
  sourceIds: string[];
  rationale: string;
  status: string;
  approvedEntityId?: string;
};
type AIChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  userProvided: boolean;
  sources: AssistantCitation[];
  actions: AIActionProposal[];
  status: string;
  feedback?: {
    rating: "useful" | "incorrect" | "review";
    comment: string;
    updatedAt: string;
  } | null;
  job?: AIChatJob;
  createdAt: string;
};
type SavedAIReport = {
  id: string;
  type: "chat_report";
  title: string;
  body: string;
  messageId: string;
  conversationId: string;
  disclaimer: string;
  sources: AssistantCitation[];
  model: string;
  generatedAt: string;
  humanReviewRequired: boolean;
};
type AdvancedReportSituation = {
  date: string;
  category: string;
  description: string;
  sourceIds: string[];
  limitations: string;
};
type AdvancedAIReport = {
  id: string;
  type: "advanced_report";
  reportType: string;
  title: string;
  executiveSummary: string;
  documentedSituations: AdvancedReportSituation[];
  recurringThemes: string[];
  missingInformation: string[];
  questionsForReview: string[];
  confidence: number;
  disclaimer: string;
  sources: AISourcePreview[];
  model: string;
  generatedAt: string;
  humanReviewRequired: boolean;
};
type AIConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AIChatMessage[];
};
type AIConversationSummary = Omit<AIConversation, "messages">;
type AuditItem = {
  id: number;
  occurred_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  entry_hash: string;
};
type CaseConfig = {
  caseCode: string;
  title: string;
  status: string;
  mainMilestone: string;
  previousModality: string;
};
type ChatMessage = {
  id: number;
  date: string;
  time: string;
  sender: string;
  text: string;
  system: boolean;
};
type AudioMatch = {
  messageId: number;
  file?: File;
  evidence?: Evidence;
  confidence: "captured" | "high" | "probable" | "low";
  reason: string;
  previewUrl?: string;
};
type StoredChatSummary = {
  id: string;
  displayName: string;
  selfName: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  audioCount: number;
};
type StoredChat = Omit<StoredChatSummary, "messageCount" | "audioCount"> & {
  rawText: string;
  messages: ChatMessage[];
  audioMatches: {
    messageId: number;
    evidenceId?: string;
    confidence: AudioMatch["confidence"];
    reason: string;
  }[];
};
type AudioTranscription = {
  evidence_id: string;
  text: string;
  status: string;
  language: string;
  engine: string;
  updated_at: string;
};
type AIStatus = {
  enabled: boolean;
  provider: string;
  available: boolean;
  configured: boolean;
  version: string;
  activeProfile: string;
  activeModel: string;
  profiles: { id: string; model: string; installed: boolean }[];
  embeddingModel: string;
  embeddingInstalled: boolean;
};
type AIOperationsStatus = {
  providerAvailable: boolean;
  provider: string;
  activeModel: string;
  processingJobs: Record<
    "pending" | "processing" | "completed" | "failed",
    number
  >;
  chatJobs: Record<"pending" | "processing" | "completed" | "failed", number>;
  averageChatSeconds: number;
  evidence: { total: number; extracting: number; failed: number };
  completedAnalyses: number;
  reviewedResponses: number;
  latestChatJobs: {
    id: string;
    status: string;
    progress: number;
    stage: string;
    model: string;
    createdAt: string;
    updatedAt: string;
  }[];
  generatedAt: string;
};
type SecurityStatus = {
  version: string;
  databaseIntegrity: "ok" | "review_required";
  automaticBackups: number;
  latestBackup: { name: string; size: number; updatedAt: string } | null;
  evidence: { total: number; verified: number };
  groqKeyProtected: boolean;
  generatedAt: string;
};
type AISourcePreview = {
  sourceId: string;
  sourceType?: "evidence" | "whatsapp_chat";
  chatId?: string;
  evidenceId: string;
  evidenceName: string;
  sectionLabel?: string;
  text?: string;
  textHash?: string;
  method?: string;
};
type AIHistoryItem = {
  id: string;
  type: string;
  status: string;
  profile: string;
  model: string;
  preview: string;
  sourceCount: number;
  sources: AISourcePreview[];
  humanReviewRequired: boolean;
  generatedAt: string;
};
type Workspace = {
  tenant: { id: string; name: string };
  user: { id: string; displayName: string; role: string };
  case: {
    id: string;
    code: string;
    title: string;
    status: string;
    role: string;
  };
};

const seedEvents: EventItem[] = [
  {
    id: "EVT-20260618-001",
    date: "2026-06-18",
    time: "19:20",
    category: "Comunicación",
    title: "Propuesta de organización semanal",
    description:
      "Se registró una conversación sobre la organización de los próximos días.",
    expected: "Organización habitual",
    actual: "Propuesta de cambio",
    evidenceCount: 2,
    status: "Revisado",
  },
  {
    id: "EVT-20260701-001",
    date: "2026-07-01",
    time: "18:35",
    category: "Cambio propuesto",
    title: "Comunicación sobre cambio de modalidad",
    description:
      "Se recibió mediante WhatsApp un mensaje en el que se indicó que no continuaría el esquema semanal utilizado hasta esa fecha.",
    expected: "Permanencia con el padre",
    actual: "Permanencia con la madre",
    evidenceCount: 3,
    status: "Pendiente de revisión",
  },
  {
    id: "EVT-20260703-001",
    date: "2026-07-03",
    time: "20:00",
    category: "Videollamada",
    title: "Solicitud de videollamada",
    description: "Se solicitó coordinar una videollamada con los hijos.",
    expected: "Videollamada coordinada",
    actual: "Pendiente de confirmar",
    evidenceCount: 1,
    status: "Borrador",
  },
];

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "acontecimientos", label: "Acontecimientos", icon: Clock3 },
  { id: "evidencias", label: "Bóveda de evidencias", icon: FolderLock },
  { id: "comunicaciones", label: "Comunicaciones", icon: MessageCircle },
  { id: "whatsapp", label: "Simulador WhatsApp", icon: Phone },
  { id: "informes", label: "Informes", icon: FileText },
  { id: "auditoria", label: "Auditoría", icon: ShieldCheck },
  { id: "configuracion", label: "Configuración", icon: Settings },
];
const aiNavItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "ia-estado", label: "Estado de la IA", icon: ShieldCheck },
  { id: "historial-ia", label: "Historial de análisis", icon: Archive },
  { id: "chat-ia", label: "Chat con IA", icon: MessageCircle },
  { id: "asistente", label: "Asistente documental", icon: Sparkles },
  { id: "evidencias", label: "Búsqueda inteligente", icon: Search },
  { id: "informes", label: "Resumen del expediente", icon: FileText },
  { id: "cronologia-ia", label: "Cronología asistida", icon: Clock3 },
  {
    id: "analisis-evidencia",
    label: "Análisis de evidencias",
    icon: FileCheck2,
  },
  { id: "contradicciones", label: "Posibles contradicciones", icon: Scale },
  { id: "fechas", label: "Fechas y compromisos", icon: CalendarDays },
  { id: "borradores", label: "Borradores asistidos", icon: FileText },
];

const categories = [
  "Comunicación",
  "Cambio propuesto",
  "Permanencia",
  "Entrega o retiro",
  "Videollamada",
  "Salud",
  "Escuela",
  "Actividad especial",
  "Actuación judicial",
];

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [view, setView] = useState<View>("inicio");
  const [events, setEvents] = useState<EventItem[]>(() =>
    readStored("gore-events", seedEvents),
  );
  const [evidence, setEvidence] = useState<Evidence[]>(() =>
    readStored("gore-evidence", []),
  );
  const [month, setMonth] = useState(new Date(2026, 6, 1));
  const [eventModal, setEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [newEventDate, setNewEventDate] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [caseConfig, setCaseConfig] = useState<CaseConfig>({
    caseCode: "GORE-2026-001",
    title: "Organización familiar",
    status: "En documentación",
    mainMilestone: "2026-07-01",
    previousModality: "Organización semanal alternada",
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [audioProgress, setAudioProgress] = useState<AudioIndexStatus | null>(
    null,
  );
  const [audioNotice, setAudioNotice] = useState("");
  const previousAudioProgress = useRef<AudioIndexStatus | null>(null);

  useEffect(
    () => localStorage.setItem("gore-events", JSON.stringify(events)),
    [events],
  );
  useEffect(
    () => localStorage.setItem("gore-evidence", JSON.stringify(evidence)),
    [evidence],
  );
  useEffect(() => {
    apiGet<{ authenticated: boolean }>("/api/auth/status")
      .then((status) => setAuthenticated(status.authenticated))
      .catch(() => {
        setAuthenticated(false);
        setBackendOnline(false);
      });
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    Promise.all([
      apiGet<EventItem[]>("/api/events"),
      apiGet<Evidence[]>("/api/evidence"),
      apiGet<CaseConfig>("/api/case"),
      apiGet<Workspace>("/api/workspace"),
    ])
      .then(([serverEvents, serverEvidence, serverCase, serverWorkspace]) => {
        setBackendOnline(true);
        setEvents(serverEvents);
        setEvidence(serverEvidence);
        setCaseConfig(serverCase);
        setWorkspace(serverWorkspace);
      })
      .catch(() => setBackendOnline(false));
  }, [authenticated]);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    const refresh = () =>
      apiGet<AudioIndexStatus>("/api/ai/audio-index/status")
        .then((result) => {
          if (!active) return;
          const previous = previousAudioProgress.current;
          setAudioProgress(result);
          previousAudioProgress.current = result;
          const completionKey = `gore-audio-complete-${result.total}-${result.completed}-${result.failed}`;
          if (
            result.finished &&
            previous?.queued &&
            !sessionStorage.getItem(completionKey)
          ) {
            const message = result.failed
              ? `Finalizó la preparación: ${result.completed} audios listos y ${result.failed} requieren revisión.`
              : `Finalizó la transcripción de los ${result.completed} audios.`;
            setAudioNotice(message);
            sessionStorage.setItem(completionKey, "1");
            if (
              "Notification" in window &&
              Notification.permission === "granted"
            )
              new Notification("GORE · Audios preparados", { body: message });
          }
        })
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [authenticated]);

  async function saveEvent(event: EventItem) {
    try {
      const existing = events.some((item) => item.id === event.id);
      const saved = existing
        ? await apiPut<EventItem>(`/api/events/${event.id}`, event)
        : await apiPost<EventItem>("/api/events", event);
      setEvents((prev) => [
        saved,
        ...prev.filter((item) => item.id !== saved.id),
      ]);
      setBackendOnline(true);
    } catch {
      setEvents((prev) => [event, ...prev]);
      setBackendOnline(false);
    }
  }

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
    } finally {
      setAuthenticated(false);
      setEvents([]);
      setEvidence([]);
    }
  }
  async function prepareAllAudios() {
    if ("Notification" in window && Notification.permission === "default")
      void Notification.requestPermission();
    const result = await apiPost<{ status: AudioIndexStatus }>(
      "/api/ai/audio-index/prepare",
      {},
    );
    setAudioProgress(result.status);
    previousAudioProgress.current = result.status;
  }

  const go = (next: View) => {
    setView(next);
    setMobileOpen(false);
  };
  const openNewEvent = () => {
    setSelectedEvent(null);
    setNewEventDate(null);
    setEventModal(true);
  };
  const openEvent = (event: EventItem) => {
    setSelectedEvent(event);
    setEventModal(true);
  };
  const title =
    [...navItems, ...aiNavItems].find((item) => item.id === view)?.label ??
    "Inicio";

  if (authenticated === null)
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <ShieldCheck />
          <span>Protegiendo el expediente…</span>
        </div>
      </div>
    );
  if (!authenticated)
    return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;

  return (
    <div className={`app-shell ${presentation ? "presentation" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Scale size={22} strokeWidth={1.8} />
          </div>
          <div>
            <strong>GORE</strong>
            <span>Gestión de evidencias</span>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="case-card">
          <span className="eyebrow">Expediente activo</span>
          <strong>{caseConfig.title}</strong>
          <span className="case-code">{caseConfig.caseCode}</span>
          <button>
            <MoreHorizontal size={17} />
          </button>
        </div>
        <nav>
          <span className="nav-label">ESPACIO DE TRABAJO</span>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === "evidencias" && evidence.length > 0 && (
                <b>{evidence.length}</b>
              )}
            </button>
          ))}
          <button
            className={`ai-tools-toggle ${aiToolsOpen ? "open" : ""}`}
            onClick={() => setAiToolsOpen((value) => !value)}
          >
            <Sparkles size={19} />
            <span>Herramientas IA</span>
            <ChevronRight className="ai-tools-chevron" size={16} />
          </button>
          {aiToolsOpen && (
            <div className="ai-tools-menu">
              {aiNavItems.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => go(id)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
        <div className="sidebar-bottom">
          <button>
            <Users size={19} /> Personas autorizadas
          </button>
          <button onClick={() => go("configuracion")}>
            <Settings size={19} /> Configuración
          </button>
          <button onClick={logout}>
            <LogOut size={19} /> Cerrar sesión
          </button>
          <div className="user-card">
            <div className="avatar">
              {workspace?.user.displayName
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() || "LC"}
            </div>
            <div>
              <strong>{workspace?.user.displayName || "Luciano Chaer"}</strong>
              <span>{workspace?.tenant.name || "Estudio personal"}</span>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <div className="scrim" onClick={() => setMobileOpen(false)} />
      )}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileOpen(true)}>
            <Menu size={21} />
          </button>
          <div>
            <span className="mobile-section">GORE / </span>
            <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Buscar">
              <Search size={19} />
            </button>
            <button
              className={`present-button ${presentation ? "selected" : ""}`}
              onClick={() => setPresentation(!presentation)}
            >
              <Eye size={18} />
              {presentation ? "Salir de presentación" : "Modo presentación"}
            </button>
            <button className="primary-button" onClick={openNewEvent}>
              <Plus size={18} /> Nuevo acontecimiento
            </button>
          </div>
        </header>

        <div className="content">
          {view === "inicio" && (
            <Dashboard
              events={events}
              evidence={evidence}
              go={go}
              openModal={openNewEvent}
              backendOnline={backendOnline}
              openEvent={openEvent}
            />
          )}
          {view === "calendario" && (
            <CalendarView
              month={month}
              setMonth={setMonth}
              events={events}
              openDay={setSelectedDay}
              milestoneDate={caseConfig.mainMilestone}
            />
          )}
          {view === "acontecimientos" && (
            <EventsView
              events={events}
              openModal={openNewEvent}
              openEvent={openEvent}
              caseConfig={caseConfig}
            />
          )}
          {view === "cronologia-ia" && (
            <ChronologyAIView
              onEventApproved={(event) =>
                setEvents((previous) => [
                  event,
                  ...previous.filter((item) => item.id !== event.id),
                ])
              }
            />
          )}
          {view === "fechas" && (
            <DatesView
              onEventApproved={(event) =>
                setEvents((previous) => [
                  event,
                  ...previous.filter((item) => item.id !== event.id),
                ])
              }
            />
          )}
          {view === "evidencias" && (
            <EvidenceView
              evidence={evidence}
              setEvidence={setEvidence}
              setBackendOnline={setBackendOnline}
              events={events}
            />
          )}
          {view === "analisis-evidencia" && <EvidenceAnalysisView />}
          {view === "asistente" && (
            <AIAssistantView audioProgress={audioProgress} />
          )}
          {view === "contradicciones" && <ContradictionsView />}
          {view === "borradores" && <DraftsView />}
          {view === "chat-ia" && <AIChatView />}
          {view === "ia-estado" && <AIOperationsView />}
          {view === "historial-ia" && <AIHistoryView />}
          {view === "comunicaciones" && (
            <CommunicationsView
              events={events}
              openModal={openNewEvent}
              openEvent={openEvent}
            />
          )}
          {view === "whatsapp" && (
            <WhatsAppSimulator
              evidence={evidence}
              onEvidence={(item) =>
                setEvidence((prev) =>
                  prev.some((existing) => existing.id === item.id)
                    ? prev
                    : [item, ...prev],
                )
              }
              audioProgress={audioProgress}
              prepareAllAudios={prepareAllAudios}
            />
          )}
          {view === "informes" && (
            <ReportsView events={events} evidence={evidence} />
          )}
          {view === "auditoria" && <AuditView />}
          {view === "configuracion" && (
            <>
              <GroqConnectCard />
              <AISettingsCard />
              <SettingsView
                config={caseConfig}
                onSaved={setCaseConfig}
                onLogout={logout}
              />
            </>
          )}
        </div>
      </main>
      {eventModal && (
        <EventModal
          initial={selectedEvent}
          initialDate={newEventDate}
          close={() => setEventModal(false)}
          save={async (event) => {
            await saveEvent(event);
            setEventModal(false);
          }}
        />
      )}
      {selectedDay && (
        <DayModal
          date={selectedDay}
          events={events}
          evidence={evidence}
          close={() => setSelectedDay(null)}
          openEvent={(event) => {
            setSelectedDay(null);
            openEvent(event);
          }}
          newEvent={() => {
            setNewEventDate(selectedDay);
            setSelectedDay(null);
            setSelectedEvent(null);
            setEventModal(true);
          }}
          onEvidence={(item) =>
            setEvidence((prev) => [
              item,
              ...prev.filter((existing) => existing.id !== item.id),
            ])
          }
        />
      )}
      {audioNotice && (
        <button className="global-notice" onClick={() => setAudioNotice("")}>
          <Check size={18} />
          <span>{audioNotice}</span>
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiPost("/api/auth/login", { password });
      onAuthenticated();
    } catch {
      setError(
        "La contraseña no es correcta. Verificála e intentá nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <div className="brand-mark">
          <Scale size={25} />
        </div>
        <strong>GORE</strong>
        <span>Gestión y Organización de Recursos y Evidencias</span>
      </div>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow accent">EXPEDIENTE PRIVADO</span>
        <h1>Bienvenido</h1>
        <p>Ingresá tu contraseña para acceder al espacio protegido.</p>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            placeholder="Ingresá tu contraseña"
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="primary-button" disabled={loading || !password}>
          {loading ? "Verificando…" : "Ingresar de forma segura"}{" "}
          <ArrowRight size={17} />
        </button>
        <div className="login-security">
          <ShieldCheck size={17} />
          <span>
            La sesión se mantiene protegida y se cierra automáticamente.
          </span>
        </div>
      </form>
      <small className="auth-legal">
        GORE organiza información privada. El acceso está limitado a personas
        autorizadas.
      </small>
    </div>
  );
}

function Dashboard({
  events,
  evidence,
  go,
  openModal,
  backendOnline,
  openEvent,
}: {
  events: EventItem[];
  evidence: Evidence[];
  go: (v: View) => void;
  openModal: () => void;
  backendOnline: boolean;
  openEvent: (event: EventItem) => void;
}) {
  const recent = [...events]
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))
    .slice(0, 3);
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow accent">EXPEDIENTE GORE-2026-001</span>
          <h1>Todo lo importante, claro y en orden.</h1>
          <p>
            Un espacio privado para preservar hechos, organizar documentación y
            construir una cronología verificable.
          </p>
        </div>
        <div
          className={`integrity-pill ${backendOnline ? "online" : "offline"}`}
        >
          <ShieldCheck size={20} />
          <div>
            <strong>
              {backendOnline
                ? "Servidor privado conectado"
                : "Modo local activo"}
            </strong>
            <span>
              {backendOnline
                ? "Originales y auditoría disponibles"
                : "Los cambios quedan en este navegador"}
            </span>
          </div>
        </div>
      </section>
      <section className="summary-grid">
        <article className="summary-card">
          <div className="summary-icon blue">
            <CalendarDays />
          </div>
          <div>
            <span>Acontecimientos</span>
            <strong>{events.length}</strong>
            <small>en la cronología</small>
          </div>
          <button onClick={() => go("acontecimientos")}>
            <ArrowRight />
          </button>
        </article>
        <article className="summary-card">
          <div className="summary-icon green">
            <FileCheck2 />
          </div>
          <div>
            <span>Evidencias originales</span>
            <strong>{evidence.length}</strong>
            <small>con huella digital</small>
          </div>
          <button onClick={() => go("evidencias")}>
            <ArrowRight />
          </button>
        </article>
        <article className="summary-card">
          <div className="summary-icon amber">
            <Clock3 />
          </div>
          <div>
            <span>Pendientes de revisión</span>
            <strong>
              {events.filter((e) => e.status !== "Revisado").length}
            </strong>
            <small>requieren atención</small>
          </div>
          <button onClick={() => go("acontecimientos")}>
            <ArrowRight />
          </button>
        </article>
      </section>
      <section className="dashboard-grid">
        <article className="panel timeline-panel">
          <div className="panel-head">
            <div>
              <h2>Cronología reciente</h2>
              <p>Últimos acontecimientos registrados</p>
            </div>
            <button
              className="text-button"
              onClick={() => go("acontecimientos")}
            >
              Ver todos <ArrowRight size={16} />
            </button>
          </div>
          <div className="timeline">
            {recent.map((event, i) => (
              <EventRow
                key={event.id}
                event={event}
                last={i === recent.length - 1}
                onOpen={openEvent}
              />
            ))}
          </div>
          {events.length === 0 && (
            <div className="empty-inline">Todavía no hay acontecimientos.</div>
          )}
        </article>
        <aside className="side-stack">
          <article className="panel quick-panel">
            <div className="panel-head">
              <div>
                <h2>Acciones rápidas</h2>
                <p>¿Qué necesitás registrar?</p>
              </div>
            </div>
            <button onClick={openModal}>
              <span>
                <Plus />
              </span>
              <div>
                <strong>Acontecimiento</strong>
                <small>Registrar un hecho nuevo</small>
              </div>
              <ChevronRight />
            </button>
            <button onClick={() => go("evidencias")}>
              <span>
                <Upload />
              </span>
              <div>
                <strong>Incorporar evidencia</strong>
                <small>Preservar un archivo original</small>
              </div>
              <ChevronRight />
            </button>
            <button onClick={() => go("calendario")}>
              <span>
                <CalendarDays />
              </span>
              <div>
                <strong>Revisar calendario</strong>
                <small>Comparar lo previsto y real</small>
              </div>
              <ChevronRight />
            </button>
          </article>
          <article className="principle-card">
            <Sparkles size={19} />
            <div>
              <strong>Claridad antes que conclusiones</strong>
              <p>
                GORE separa los hechos objetivos de las observaciones personales
                para facilitar una revisión profesional.
              </p>
            </div>
          </article>
        </aside>
      </section>
    </>
  );
}

function EventRow({
  event,
  last,
  onOpen,
}: {
  event: EventItem;
  last: boolean;
  onOpen?: (event: EventItem) => void;
}) {
  const d = new Date(`${event.date}T12:00:00`);
  return (
    <div
      className={`event-row ${onOpen ? "clickable" : ""}`}
      onClick={() => onOpen?.(event)}
    >
      <div className="event-date">
        <strong>{format(d, "dd")}</strong>
        <span>{format(d, "MMM", { locale: es }).toUpperCase()}</span>
        {!last && <i />}
      </div>
      <div className="event-body">
        <div className="event-tags">
          <span className="category-tag">{event.category}</span>
          <span>{event.time}</span>
        </div>
        <strong>{event.title}</strong>
        <p>{event.description}</p>
        <div className="event-meta">
          <span>
            <Archive size={14} /> {event.evidenceCount} evidencia
            {event.evidenceCount === 1 ? "" : "s"}
          </span>
          <span
            className={`status ${event.status === "Revisado" ? "reviewed" : ""}`}
          >
            {event.status}
          </span>
        </div>
      </div>
      <button
        className="row-more"
        type="button"
        aria-label="Abrir acontecimiento"
      >
        <MoreHorizontal />
      </button>
    </div>
  );
}

function CalendarView({
  month,
  setMonth,
  events,
  openDay,
  milestoneDate,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  events: EventItem[];
  openDay: (date: string) => void;
  milestoneDate: string;
}) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
      }),
    [month],
  );
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">CRONOLOGÍA SIN LÍMITE DE FECHA</span>
          <h1>Calendario parental</h1>
          <p>
            Compará la modalidad esperada con lo que ocurrió realmente, también
            para hechos anteriores al conflicto.
          </p>
        </div>
      </section>
      <article className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="month-nav">
            <button onClick={() => setMonth(subMonths(month, 1))}>
              <ChevronLeft />
            </button>
            <h2>{format(month, "MMMM yyyy", { locale: es })}</h2>
            <button onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight />
            </button>
            <button className="today" onClick={() => setMonth(new Date())}>
              Hoy
            </button>
          </div>
          <div className="legend">
            <span>
              <i className="dot blue-dot" />
              Acontecimiento
            </span>
            <span>
              <i className="dot gold-dot" />
              Hito principal
            </span>
          </div>
        </div>
        <div className="calendar-grid week">
          <span>Lun</span>
          <span>Mar</span>
          <span>Mié</span>
          <span>Jue</span>
          <span>Vie</span>
          <span>Sáb</span>
          <span>Dom</span>
        </div>
        <div className="calendar-grid days">
          {days.map((day) => {
            const dayEvents = events.filter((e) =>
              isSameDay(new Date(`${e.date}T12:00:00`), day),
            );
            const dayKey = format(day, "yyyy-MM-dd");
            const milestone = dayKey === milestoneDate;
            return (
              <button
                key={day.toISOString()}
                className={`day ${!isSameMonth(day, month) ? "muted" : ""} ${milestone ? "milestone" : ""}`}
                onClick={() => openDay(dayKey)}
              >
                <span className={isSameDay(day, new Date()) ? "current" : ""}>
                  {format(day, "d")}
                </span>
                {milestone && <b>Hito del expediente</b>}
                {dayEvents.slice(0, 2).map((e) => (
                  <small key={e.id}>{e.title}</small>
                ))}
                {dayEvents.length > 2 && <em>+{dayEvents.length - 2} más</em>}
              </button>
            );
          })}
        </div>
      </article>
    </>
  );
}

function DatesView({
  onEventApproved,
}: {
  onEventApproved: (event: EventItem) => void;
}) {
  const [proposals, setProposals] = useState<DateProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiGet<DateProposal[]>("/api/ai/dates/proposals")
      .then(setProposals)
      .catch(() => undefined);
  }, []);
  async function generate() {
    setLoading(true);
    setError("");
    try {
      const result = await apiPost<{ proposals: DateProposal[] }>(
        "/api/ai/dates/generate",
        {},
      );
      setProposals((previous) => [...result.proposals, ...previous]);
    } catch {
      setError(
        "No se pudieron detectar fechas. Verificá las evidencias indexadas y la conexión con GroqCloud.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function review(proposal: DateProposal, action: "approve" | "reject") {
    try {
      if (action === "approve") {
        const result = await apiPost<{
          proposal: DateProposal;
          event: EventItem;
        }>(`/api/ai/dates/proposals/${proposal.id}/approve`, {});
        setProposals((previous) =>
          previous.map((item) =>
            item.id === proposal.id ? result.proposal : item,
          ),
        );
        onEventApproved(result.event);
      } else {
        const result = await apiPost<DateProposal>(
          `/api/ai/dates/proposals/${proposal.id}/reject`,
          {},
        );
        setProposals((previous) =>
          previous.map((item) => (item.id === proposal.id ? result : item)),
        );
      }
    } catch {
      setError("No se pudo guardar la revisión de la propuesta.");
    }
  }
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">
            AGENDA ASISTIDA · APROBACIÓN OBLIGATORIA
          </span>
          <h1>Fechas y compromisos</h1>
          <p>
            Detecta fechas asociadas con acciones concretas sin calcular
            vencimientos legales definitivos.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={generate}
          disabled={loading}
        >
          <CalendarDays size={17} />{" "}
          {loading ? "Revisando fuentes…" : "Detectar fechas"}
        </button>
      </section>
      <div className="contradiction-warning">
        <Gavel />
        <div>
          <strong>Nunca es un cálculo jurídico definitivo</strong>
          <span>
            Confirmá fecha, alcance, días hábiles y reglas aplicables con un
            profesional antes de aprobar.
          </span>
        </div>
      </div>
      {error && <div className="login-error">{error}</div>}
      <div className="date-proposals">
        {proposals.map((proposal) => (
          <article
            className={`panel date-proposal ${proposal.status}`}
            key={proposal.id}
          >
            <div className="date-proposal-calendar">
              <strong>
                {format(new Date(`${proposal.date}T12:00:00`), "dd")}
              </strong>
              <span>
                {format(new Date(`${proposal.date}T12:00:00`), "MMM yyyy", {
                  locale: es,
                })}
              </span>
              <small>{proposal.time || "Sin hora"}</small>
            </div>
            <div className="date-proposal-body">
              <div>
                <b>{proposal.type}</b>
                <span>
                  {proposal.dateBasis === "explicit"
                    ? "Fecha explícita"
                    : proposal.dateBasis === "file_date"
                      ? "Fecha del archivo"
                      : "Fecha inferida"}
                </span>
                <span>Confianza {(proposal.certainty * 100).toFixed(0)}%</span>
              </div>
              <h2>{proposal.reason}</h2>
              <p>{proposal.warning}</p>
              <div className="proposal-sources">
                {proposal.sources.map((source) => (
                  <a
                    href={evidenceDownloadUrl(source.evidenceId)}
                    key={source.sourceId}
                  >
                    {source.sourceId} · {source.evidenceName}
                  </a>
                ))}
              </div>
            </div>
            <div className="proposal-actions">
              {proposal.status === "pending_review" ? (
                <>
                  <button onClick={() => review(proposal, "reject")}>
                    Descartar
                  </button>
                  <button
                    className="approve"
                    onClick={() => review(proposal, "approve")}
                  >
                    <Check size={15} /> Aprobar y agendar
                  </button>
                </>
              ) : (
                <span>
                  {proposal.status === "approved"
                    ? "Incorporado al calendario"
                    : "Descartado"}
                </span>
              )}
            </div>
          </article>
        ))}
        {proposals.length === 0 && (
          <article className="panel vault-empty">
            <CalendarDays />
            <strong>No hay fechas propuestas</strong>
            <p>
              GORE sólo propondrá fechas vinculadas con una acción concreta y
              una fuente identificable.
            </p>
          </article>
        )}
      </div>
    </>
  );
}

function ChronologyAIView({
  onEventApproved,
}: {
  onEventApproved: (event: EventItem) => void;
}) {
  const [proposals, setProposals] = useState<ChronologyProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiGet<ChronologyProposal[]>("/api/ai/chronology/proposals")
      .then(setProposals)
      .catch(() => undefined);
  }, []);
  async function generate() {
    setLoading(true);
    setError("");
    try {
      const result = await apiPost<{ proposals: ChronologyProposal[] }>(
        "/api/ai/chronology/generate",
        {},
      );
      setProposals((previous) => [...result.proposals, ...previous]);
    } catch {
      setError(
        "No se pudieron generar propuestas. Verificá GroqCloud y las evidencias indexadas.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function review(
    proposal: ChronologyProposal,
    action: "approve" | "reject",
  ) {
    try {
      if (action === "approve") {
        const result = await apiPost<{
          proposal: ChronologyProposal;
          event: EventItem;
        }>(`/api/ai/chronology/proposals/${proposal.id}/approve`, {});
        setProposals((previous) =>
          previous.map((item) =>
            item.id === proposal.id ? result.proposal : item,
          ),
        );
        onEventApproved(result.event);
      } else {
        const result = await apiPost<ChronologyProposal>(
          `/api/ai/chronology/proposals/${proposal.id}/reject`,
          {},
        );
        setProposals((previous) =>
          previous.map((item) => (item.id === proposal.id ? result : item)),
        );
      }
    } catch {
      setError("No se pudo registrar la revisión de esa propuesta.");
    }
  }
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">
            AGENTE LOCAL · REVISIÓN OBLIGATORIA
          </span>
          <h1>Cronología asistida</h1>
          <p>
            Detecta posibles acontecimientos en evidencias sin modificar el
            calendario automáticamente.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={generate}
          disabled={loading}
        >
          <Sparkles size={16} />{" "}
          {loading ? "Analizando…" : "Buscar acontecimientos"}
        </button>
      </section>
      {error && <div className="login-error">{error}</div>}
      <article className="panel chronology-agent">
        <div className="chronology-proposals">
          {proposals.map((proposal) => (
            <section
              className={`chronology-proposal ${proposal.status}`}
              key={proposal.id}
            >
              <div className="proposal-date">
                <strong>
                  {format(new Date(`${proposal.date}T12:00:00`), "dd")}
                </strong>
                <span>
                  {format(new Date(`${proposal.date}T12:00:00`), "MMM yyyy", {
                    locale: es,
                  })}
                </span>
                {proposal.time && <small>{proposal.time}</small>}
              </div>
              <div>
                <div className="proposal-badges">
                  <span>
                    {proposal.dateBasis === "explicit"
                      ? "Fecha explícita"
                      : proposal.dateBasis === "file_date"
                        ? "Fecha del archivo"
                        : "Fecha inferida"}
                  </span>
                  <span>
                    Confianza {(proposal.certainty * 100).toFixed(0)}%
                  </span>
                </div>
                <p>{proposal.description}</p>
                {proposal.people.length > 0 && (
                  <small>Personas: {proposal.people.join(", ")}</small>
                )}
                <div className="proposal-sources">
                  {proposal.sources.map((source) => (
                    <a
                      href={evidenceDownloadUrl(source.evidenceId)}
                      key={source.sourceId}
                    >
                      {source.sourceId} · {source.evidenceName}
                    </a>
                  ))}
                </div>
              </div>
              <div className="proposal-actions">
                {proposal.status === "pending_review" ? (
                  <>
                    <button onClick={() => review(proposal, "reject")}>
                      Descartar
                    </button>
                    <button
                      className="approve"
                      onClick={() => review(proposal, "approve")}
                    >
                      <Check size={15} /> Aprobar
                    </button>
                  </>
                ) : (
                  <span>
                    {proposal.status === "approved"
                      ? "Incorporado al calendario"
                      : "Descartado"}
                  </span>
                )}
              </div>
            </section>
          ))}
          {proposals.length === 0 && (
            <div className="vault-empty">
              <Clock3 />
              <strong>Sin propuestas pendientes</strong>
              <p>
                GORE sólo mostrará acontecimientos que pueda vincular con
                fuentes.
              </p>
            </div>
          )}
        </div>
      </article>
    </>
  );
}

function EventsView({
  events,
  openModal,
  openEvent,
  caseConfig,
}: {
  events: EventItem[];
  openModal: () => void;
  openEvent: (event: EventItem) => void;
  caseConfig: CaseConfig;
}) {
  const [query, setQuery] = useState("");
  const filtered = events.filter((e) =>
    `${e.title} ${e.description} ${e.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">REGISTRO OBJETIVO</span>
          <h1>Acontecimientos</h1>
          <p>
            Una cronología clara de hechos, comunicaciones y cambios relevantes.
          </p>
        </div>
        <button className="primary-button" onClick={openModal}>
          <Plus size={18} /> Nuevo acontecimiento
        </button>
      </section>
      <article className="milestone-banner">
        <div className="milestone-date">
          <strong>
            {format(new Date(`${caseConfig.mainMilestone}T12:00:00`), "dd")}
          </strong>
          <span>
            {format(
              new Date(`${caseConfig.mainMilestone}T12:00:00`),
              "MMM yyyy",
              { locale: es },
            ).toUpperCase()}
          </span>
        </div>
        <div>
          <span className="eyebrow">HITO PRINCIPAL DEL EXPEDIENTE</span>
          <h2>{caseConfig.title}</h2>
          <p>
            Fecha principal configurada para organizar la lectura del
            expediente. Los hechos anteriores y posteriores permanecen visibles
            en la misma cronología.
          </p>
        </div>
        <Gavel size={22} />
      </article>
      <article className="panel list-panel">
        <div className="list-tools">
          <label>
            <Search size={18} />
            <input
              placeholder="Buscar por palabra, categoría o fecha…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button>
            Todos los estados <ChevronRight size={16} />
          </button>
        </div>
        <div className="events-list">
          {filtered.map((event, i) => (
            <EventRow
              key={event.id}
              event={event}
              last={i === filtered.length - 1}
              onOpen={openEvent}
            />
          ))}
          {filtered.length === 0 && (
            <div className="empty-inline">
              No encontramos acontecimientos con ese criterio.
            </div>
          )}
        </div>
      </article>
    </>
  );
}

function DayModal({
  date,
  events,
  evidence,
  close,
  openEvent,
  newEvent,
  onEvidence,
}: {
  date: string;
  events: EventItem[];
  evidence: Evidence[];
  close: () => void;
  openEvent: (event: EventItem) => void;
  newEvent: () => void;
  onEvidence: (item: Evidence) => void;
}) {
  const dayEvents = events.filter((event) => event.date === date);
  const eventIds = new Set(dayEvents.map((event) => event.id));
  const dayEvidence = evidence.filter(
    (item) =>
      item.factDate === date || (item.eventId && eventIds.has(item.eventId)),
  );
  const [relatedEvent, setRelatedEvent] = useState(dayEvents[0]?.id ?? "");
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setProcessing(true);
    setUploadError("");
    try {
      for (const file of Array.from(files))
        onEvidence(
          await apiUpload<Evidence>(
            "/api/evidence",
            file,
            relatedEvent || undefined,
            date,
          ),
        );
    } catch {
      setUploadError(
        "El archivo fue rechazado por las reglas de seguridad o no pudo incorporarse.",
      );
    } finally {
      setProcessing(false);
    }
  }
  const readable = format(
    new Date(`${date}T12:00:00`),
    "EEEE d 'de' MMMM 'de' yyyy",
    { locale: es },
  );
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className="modal day-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow accent">VISTA DIARIA</span>
            <h2>{readable}</h2>
            <p>
              {dayEvents.length} acontecimiento
              {dayEvents.length === 1 ? "" : "s"} · {dayEvidence.length}{" "}
              evidencia{dayEvidence.length === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <div className="day-modal-content">
          <section>
            <div className="day-section-head">
              <div>
                <h3>Acontecimientos del día</h3>
                <span>Todo lo registrado para esta fecha</span>
              </div>
              <button className="text-button" onClick={newEvent}>
                <Plus size={16} /> Agregar
              </button>
            </div>
            {dayEvents.length ? (
              <div className="day-event-list">
                {dayEvents.map((event, index) => (
                  <EventRow
                    event={event}
                    last={index === dayEvents.length - 1}
                    onOpen={openEvent}
                    key={event.id}
                  />
                ))}
              </div>
            ) : (
              <div className="day-empty">
                <CalendarDays />
                <strong>No hay acontecimientos cargados</strong>
                <p>
                  Podés crear el primero manteniendo seleccionada esta fecha.
                </p>
                <button className="primary-button" onClick={newEvent}>
                  <Plus size={16} /> Crear acontecimiento
                </button>
              </div>
            )}
          </section>
          <section>
            <div className="day-section-head">
              <div>
                <h3>Evidencias del día</h3>
                <span>Fotos, documentos, audios o conversaciones</span>
              </div>
            </div>
            {dayEvents.length > 0 && (
              <label className="day-related">
                Asociar también con
                <select
                  value={relatedEvent}
                  onChange={(event) => setRelatedEvent(event.target.value)}
                >
                  <option value="">Solo con la fecha</option>
                  {dayEvents.map((event) => (
                    <option value={event.id} key={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={`day-upload ${processing ? "processing" : ""}`}>
              <input
                type="file"
                multiple
                onChange={(event) => upload(event.target.files)}
              />
              <Upload />
              <div>
                <strong>
                  {processing
                    ? "Preservando originales…"
                    : "Adjuntar evidencias"}
                </strong>
                <span>
                  Imágenes, documentos, audios, videos o exportaciones
                </span>
              </div>
            </label>
            {uploadError && <div className="login-error">{uploadError}</div>}
            {dayEvidence.length > 0 && (
              <div className="day-files">
                {dayEvidence.map((item) => (
                  <div key={item.id}>
                    <FileCheck2 />
                    <span>
                      <strong>{item.name}</strong>
                      <small>SHA-256 registrado</small>
                    </span>
                    <a href={evidenceDownloadUrl(item.id)}>
                      <Download />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function EvidenceView({
  evidence,
  setEvidence,
  setBackendOnline,
  events,
}: {
  evidence: Evidence[];
  setEvidence: React.Dispatch<React.SetStateAction<Evidence[]>>;
  setBackendOnline: (value: boolean) => void;
  events: EventItem[];
}) {
  const [processing, setProcessing] = useState(false);
  const [relatedEvent, setRelatedEvent] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [textEvidence, setTextEvidence] = useState<Evidence | null>(null);
  const [extractedText, setExtractedText] = useState<ExtractedText | null>(
    null,
  );
  const [textLoading, setTextLoading] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticResults, setSemanticResults] =
    useState<SemanticSearchResponse | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState("");
  const [audioIndex, setAudioIndex] = useState<AudioIndexStatus | null>(null);
  const [audioPreparing, setAudioPreparing] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      apiGet<AudioIndexStatus>("/api/ai/audio-index/status")
        .then((result) => active && setAudioIndex(result))
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  async function openExtractedText(file: Evidence) {
    setTextEvidence(file);
    setExtractedText(null);
    setTextLoading(true);
    try {
      setExtractedText(
        await apiGet<ExtractedText>(`/api/evidence/${file.id}/text`),
      );
    } finally {
      setTextLoading(false);
    }
  }
  async function searchEvidence(event: React.FormEvent) {
    event.preventDefault();
    if (semanticQuery.trim().length < 2) return;
    setSemanticLoading(true);
    setSemanticError("");
    try {
      setSemanticResults(
        await apiPost<SemanticSearchResponse>("/api/ai/search", {
          query: semanticQuery.trim(),
          limit: 8,
        }),
      );
    } catch {
      setSemanticError(
        "No se pudo realizar la búsqueda. Comprobá que existan documentos indexados e intentá nuevamente.",
      );
    } finally {
      setSemanticLoading(false);
    }
  }
  async function prepareAudios() {
    setAudioPreparing(true);
    setSemanticError("");
    try {
      const result = await apiPost<{ status: AudioIndexStatus }>(
        "/api/ai/audio-index/prepare",
        {},
      );
      setAudioIndex(result.status);
    } catch {
      setSemanticError("No se pudo iniciar la preparación de los audios.");
    } finally {
      setAudioPreparing(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setProcessing(true);
    setUploadMessage("");
    const rows: Evidence[] = [];
    let serverAccepted = false;
    for (const file of Array.from(files)) {
      try {
        rows.push(
          await apiUpload<Evidence>(
            "/api/evidence",
            file,
            relatedEvent || undefined,
          ),
        );
        serverAccepted = true;
        setBackendOnline(true);
      } catch (problem) {
        if (problem instanceof Error && problem.message.startsWith("API ")) {
          setUploadMessage(
            "Uno de los archivos fue rechazado porque su formato, contenido o tamaño no cumple las reglas de seguridad.",
          );
          continue;
        }
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        );
        const hash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        rows.push({
          id: `LOCAL-${Date.now()}-${rows.length + 1}`,
          name: file.name,
          size: file.size,
          type: file.type || "Archivo",
          hash,
          addedAt: new Date().toISOString(),
        });
        setBackendOnline(false);
      }
    }
    if (serverAccepted) {
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      try {
        setEvidence(await apiGet<Evidence[]>("/api/evidence"));
      } catch {
        setEvidence((prev) => [
          ...rows,
          ...prev.filter((item) => !rows.some((row) => row.id === item.id)),
        ]);
      }
    } else
      setEvidence((prev) => [
        ...rows,
        ...prev.filter((item) => !rows.some((row) => row.id === item.id)),
      ]);
    setProcessing(false);
  }
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">ORIGINALES PROTEGIDOS</span>
          <h1>Bóveda de evidencias</h1>
          <p>
            Cada archivo incorporado recibe automáticamente una huella SHA-256
            para detectar cualquier modificación.
          </p>
        </div>
      </section>
      <div className="evidence-linker">
        <label>
          Relacionar la próxima carga con un acontecimiento
          <select
            value={relatedEvent}
            onChange={(e) => setRelatedEvent(e.target.value)}
          >
            <option value="">Sin relación por ahora</option>
            {events.map((event) => (
              <option value={event.id} key={event.id}>
                {event.date} · {event.title}
              </option>
            ))}
          </select>
        </label>
        <span>
          <Info size={15} /> La relación permite encontrar rápidamente qué
          original respalda cada hecho.
        </span>
      </div>
      <label className={`upload-zone ${processing ? "processing" : ""}`}>
        <input type="file" multiple onChange={(e) => upload(e.target.files)} />
        <div className="upload-icon">
          <Upload />
        </div>
        <strong>
          {processing
            ? "Verificando el archivo original…"
            : "Incorporar archivos originales"}
        </strong>
        <p>Arrastrá archivos aquí o hacé clic para seleccionarlos</p>
        <span>
          Formatos permitidos con verificación de contenido real · máximo 500 MB
        </span>
      </label>
      {uploadMessage && (
        <div className="login-error evidence-upload-error">{uploadMessage}</div>
      )}
      <article className="panel semantic-search-panel">
        <div className="panel-head">
          <div>
            <h2>Búsqueda inteligente del expediente</h2>
            <p>
              Encontrá conceptos aunque el documento no use exactamente las
              mismas palabras.
            </p>
          </div>
          <Sparkles />
        </div>
        <form onSubmit={searchEvidence}>
          <Search />
          <input
            value={semanticQuery}
            onChange={(event) => setSemanticQuery(event.target.value)}
            placeholder="Ejemplo: cambio de modalidad del cuidado"
          />
          <button
            className="primary-button"
            disabled={semanticLoading || semanticQuery.trim().length < 2}
          >
            {semanticLoading ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {audioIndex && audioIndex.total > 0 && (
          <div className="audio-index-progress">
            <div>
              <strong>
                Audios preparados para búsqueda: {audioIndex.indexed} de{" "}
                {audioIndex.total}
              </strong>
              <span>
                {audioIndex.queued
                  ? `${audioIndex.queued} en procesamiento progresivo`
                  : audioIndex.transcribed < audioIndex.total
                    ? `${audioIndex.total - audioIndex.transcribed} todavía necesitan transcripción`
                    : "Todos los audios tienen transcripción"}
              </span>
            </div>
            {audioIndex.indexed < audioIndex.total && (
              <button
                type="button"
                onClick={prepareAudios}
                disabled={audioPreparing || audioIndex.queued > 0}
              >
                {audioPreparing
                  ? "Preparando…"
                  : audioIndex.queued
                    ? "Procesando…"
                    : "Preparar audios"}
              </button>
            )}
          </div>
        )}
        {semanticError && <div className="login-error">{semanticError}</div>}
        {semanticResults && (
          <div className="semantic-results">
            <div className="semantic-results-head">
              <strong>{semanticResults.results.length} coincidencias</strong>
              <span>
                {semanticResults.indexedEvidence} evidencias indexadas ·{" "}
                {semanticResults.model}
              </span>
            </div>
            {semanticResults.results.length ? (
              semanticResults.results.map((result, index) => (
                <button
                  type="button"
                  className="semantic-result"
                  key={`${result.evidenceId}-${result.sectionIndex}-${result.chunkIndex}`}
                  onClick={() => {
                    const file = evidence.find(
                      (item) => item.id === result.evidenceId,
                    );
                    if (file) openExtractedText(file);
                  }}
                >
                  <span className="semantic-rank">{index + 1}</span>
                  <div>
                    <strong>
                      {result.evidenceName} · {result.sectionLabel}
                    </strong>
                    <p>{result.text}</p>
                    <small>
                      Coincidencia {(result.score * 100).toFixed(1)}% · SHA-256
                      del fragmento {result.textHash.slice(0, 16)}…
                    </small>
                  </div>
                </button>
              ))
            ) : (
              <div className="vault-empty">
                <Search />
                <strong>No se encontraron coincidencias</strong>
                <p>Probá describiendo el hecho con otras palabras.</p>
              </div>
            )}
          </div>
        )}
      </article>
      <article className="panel evidence-panel">
        <div className="panel-head">
          <div>
            <h2>Archivos incorporados</h2>
            <p>
              {evidence.length} original{evidence.length === 1 ? "" : "es"}{" "}
              registrado{evidence.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="safe-badge">
            <ShieldCheck size={16} /> SHA-256 activo
          </span>
        </div>
        {evidence.length === 0 ? (
          <div className="vault-empty">
            <FolderLock />
            <strong>La bóveda está preparada</strong>
            <p>
              El primer archivo que incorpores aparecerá aquí con su
              identificación y hash.
            </p>
          </div>
        ) : (
          <div className="file-list">
            {evidence.map((file) => (
              <div className="file-row" key={file.id}>
                <div className="file-icon">
                  <FileText />
                </div>
                <div className="file-info">
                  <strong>{file.name}</strong>
                  <span>
                    {(file.size / 1024).toFixed(1)} KB · Incorporado{" "}
                    {format(new Date(file.addedAt), "dd/MM/yyyy 'a las' HH:mm")}
                  </span>
                  <code title={file.hash}>{file.hash}</code>
                  {file.extractionStatus &&
                    file.extractionStatus !== "not_applicable" && (
                      <small
                        className={`extraction-state extraction-${file.extractionStatus}`}
                      >
                        {file.extractionStatus === "ready"
                          ? "Texto disponible para IA"
                          : file.extractionStatus === "empty"
                            ? "Sin texto legible"
                            : file.extractionStatus === "failed"
                              ? "Extracción pendiente de revisión"
                              : "Extrayendo texto localmente…"}
                      </small>
                    )}
                </div>
                <span
                  className={`verified processing-${file.processingStatus || "ready"}`}
                >
                  {file.processingStatus === "pending" ||
                  file.processingStatus === "processing" ? (
                    <Clock3 size={14} />
                  ) : file.processingStatus === "quarantined" ||
                    file.processingStatus === "failed" ? (
                    <X size={14} />
                  ) : (
                    <Check size={14} />
                  )}{" "}
                  {file.id.startsWith("LOCAL-")
                    ? "Huella local"
                    : file.processingStatus === "pending"
                      ? "Pendiente"
                      : file.processingStatus === "processing"
                        ? "Verificando"
                        : file.processingStatus === "quarantined"
                          ? "En cuarentena"
                          : file.processingStatus === "failed"
                            ? "Revisión necesaria"
                            : "Original verificado"}
                </span>
                <div className="file-actions">
                  {file.extractionStatus &&
                    file.extractionStatus !== "not_applicable" && (
                      <button
                        type="button"
                        onClick={() => openExtractedText(file)}
                        title="Ver texto extraído"
                      >
                        <Eye />
                      </button>
                    )}
                  {file.id.startsWith("LOCAL-") ? (
                    <button title="Archivo local">
                      <MoreHorizontal />
                    </button>
                  ) : (
                    <a
                      className="download-file"
                      href={evidenceDownloadUrl(file.id)}
                      title="Descargar original"
                    >
                      <Download />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
      {textEvidence && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setTextEvidence(null)
          }
        >
          <div className="modal extracted-text-modal">
            <div className="modal-head">
              <div>
                <span className="eyebrow accent">LECTURA LOCAL TRAZABLE</span>
                <h2>{textEvidence.name}</h2>
                <p>Texto auxiliar vinculado al original SHA-256</p>
              </div>
              <button type="button" onClick={() => setTextEvidence(null)}>
                <X />
              </button>
            </div>
            <div className="extracted-text-content">
              {textLoading ? (
                <div className="vault-empty">
                  <Clock3 />
                  <strong>Recuperando el texto…</strong>
                </div>
              ) : extractedText?.status === "ready" ? (
                <>
                  {extractedText.summary && (
                    <div className="extraction-summary">
                      <span>
                        {extractedText.summary.character_count.toLocaleString(
                          "es-AR",
                        )}{" "}
                        caracteres
                      </span>
                      <span>
                        {extractedText.summary.section_count} secciones
                      </span>
                      <span>Motor: {extractedText.summary.engine}</span>
                    </div>
                  )}
                  {extractedText.chunks.map((chunk, index) => (
                    <section
                      key={`${chunk.section_index}-${chunk.chunk_index}`}
                    >
                      <strong>
                        {index === 0 ||
                        extractedText.chunks[index - 1].section_index !==
                          chunk.section_index
                          ? chunk.section_label
                          : `${chunk.section_label} · continuación`}
                      </strong>
                      <p>{chunk.text}</p>
                      <small>Huella del fragmento: {chunk.text_sha256}</small>
                    </section>
                  ))}
                </>
              ) : (
                <div className="vault-empty">
                  <FileText />
                  <strong>
                    {extractedText?.status === "empty"
                      ? "No se detectó texto legible"
                      : extractedText?.status === "failed"
                        ? "No se pudo extraer el texto"
                        : "La extracción está en proceso"}
                  </strong>
                  <p>
                    El archivo original permanece preservado y siempre prevalece
                    sobre esta lectura auxiliar.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AIAssistantView({
  audioProgress,
}: {
  audioProgress: AudioIndexStatus | null;
}) {
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<AssistantAnswer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (value.length < 3) return;
    setLoading(true);
    setError("");
    try {
      const answer = await apiPost<AssistantAnswer>("/api/ai/ask", {
        question: value,
      });
      setAnswers((previous) => [answer, ...previous]);
      setQuestion("");
    } catch {
      setError(
        "No se pudo generar la respuesta. Comprobá la conexión con GroqCloud e intentá nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">ANÁLISIS LOCAL CON FUENTES</span>
          <h1>Asistente documental</h1>
          <p>
            Consultá el expediente usando solamente información recuperada de
            las evidencias.
          </p>
        </div>
      </section>
      <article className="panel assistant-panel">
        <div className="assistant-safety">
          <ShieldCheck />
          <div>
            <strong>Respuestas limitadas por evidencia</strong>
            <span>
              GORE debe indicar cuando no encuentra respaldo suficiente. Las
              transcripciones son auxiliares y el audio original siempre
              prevalece.
            </span>
          </div>
        </div>
        {audioProgress && !audioProgress.finished && (
          <div className="assistant-progress">
            <Clock3 />
            <span>
              La cobertura continúa aumentando: {audioProgress.completed} de{" "}
              {audioProgress.total} audios transcritos ({audioProgress.percent}
              %).
            </span>
          </div>
        )}
        <form onSubmit={ask}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ejemplo: ¿Qué comunicaciones mencionan cambios en la modalidad de cuidado?"
            maxLength={2000}
          />
          <div>
            <small>{question.length}/2000</small>
            <button
              className="primary-button"
              disabled={loading || question.trim().length < 3}
            >
              <Sparkles size={16} />{" "}
              {loading ? "Analizando evidencias…" : "Preguntar a GORE"}
            </button>
          </div>
        </form>
        {error && <div className="login-error">{error}</div>}
      </article>
      <div className="assistant-answers">
        {answers.map((item, answerIndex) => (
          <article
            className="panel assistant-answer"
            key={`${item.question}-${answerIndex}`}
          >
            <span className="assistant-question">{item.question}</span>
            <div
              className={`assistant-answer-status ${item.insufficientEvidence ? "insufficient" : ""}`}
            >
              <Sparkles />
              <strong>
                {item.insufficientEvidence
                  ? "Evidencia insuficiente"
                  : "Respuesta respaldada"}
              </strong>
              <small>
                {item.model === "none"
                  ? "Sin ejecutar modelo generativo"
                  : `${item.model} · perfil ${item.profile}`}
              </small>
            </div>
            <p>{item.answer}</p>
            {item.caveats.length > 0 && (
              <ul>
                {item.caveats.map((caveat) => (
                  <li key={caveat}>{caveat}</li>
                ))}
              </ul>
            )}
            {item.citations.length > 0 && (
              <div className="assistant-citations">
                <strong>Fuentes utilizadas</strong>
                {item.citations.map((citation) => (
                  <a
                    href={evidenceDownloadUrl(citation.evidenceId)}
                    key={citation.sourceId}
                  >
                    <span>{citation.sourceId}</span>
                    <div>
                      <strong>
                        {citation.evidenceName} · {citation.sectionLabel}
                      </strong>
                      <p>{citation.text}</p>
                      <small>
                        Coincidencia {(citation.score * 100).toFixed(1)}% · SHA{" "}
                        {citation.textHash}
                      </small>
                    </div>
                    <Download />
                  </a>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function EvidenceAnalysisView() {
  const [analysis, setAnalysis] = useState<EvidenceAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiGet<{ analysis: EvidenceAnalysis | null }>("/api/ai/analyses/evidence")
      .then((result) => setAnalysis(result.analysis))
      .catch(() => undefined);
  }, []);
  async function analyze() {
    setLoading(true);
    setError("");
    try {
      setAnalysis(
        await apiPost<EvidenceAnalysis>("/api/ai/analyses/evidence", {}),
      );
    } catch {
      setError(
        "No se pudo organizar la evidencia. Verificá que existan archivos indexados y que GroqCloud esté conectado.",
      );
    } finally {
      setLoading(false);
    }
  }
  const source = (id: string) =>
    analysis?.sources.find((item) => item.sourceId === id);
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">ORGANIZACIÓN LOCAL CON FUENTES</span>
          <h1>Análisis de evidencias</h1>
          <p>
            Ordena utilidad, límites y alertas observables sin decidir
            admisibilidad ni responsabilidad.
          </p>
        </div>
        <button className="primary-button" onClick={analyze} disabled={loading}>
          <FileCheck2 size={17} />{" "}
          {loading
            ? "Organizando…"
            : analysis
              ? "Actualizar análisis"
              : "Analizar evidencias"}
        </button>
      </section>
      <div className="contradiction-warning">
        <ShieldCheck />
        <div>
          <strong>Clasificación documental, no valoración judicial</strong>
          <span>
            “Favorable” significa que ayuda a documentar un hecho; no significa
            que garantice un resultado legal.
          </span>
        </div>
      </div>
      {error && <div className="login-error">{error}</div>}
      {analysis ? (
        <>
          <div className="evidence-analysis-grid">
            {analysis.items.map((item) => {
              const file = source(item.sourceId);
              return (
                <article
                  className="panel evidence-analysis-card"
                  key={item.sourceId}
                >
                  <div className="evidence-analysis-head">
                    <span>{item.sourceId}</span>
                    <b className={item.classification}>{item.classification}</b>
                    <small>
                      Confianza {(item.confidence * 100).toFixed(0)}%
                    </small>
                  </div>
                  <h2>{file?.evidenceName ?? "Evidencia vinculada"}</h2>
                  <section>
                    <strong>Qué ayuda a documentar</strong>
                    <p>
                      {item.relevance ||
                        "No se determinó una utilidad concreta."}
                    </p>
                  </section>
                  <section>
                    <strong>Límites</strong>
                    <p>
                      {item.limitations ||
                        "Requiere revisión del original y su contexto."}
                    </p>
                  </section>
                  <section>
                    <strong>Alertas de autenticidad o contexto</strong>
                    {item.authenticityConcerns.length ? (
                      <ul>
                        {item.authenticityConcerns.map((concern) => (
                          <li key={concern}>{concern}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>
                        No se identificaron alertas observables en esta lectura
                        auxiliar.
                      </p>
                    )}
                  </section>
                  {file && (
                    <a href={evidenceDownloadUrl(file.evidenceId)}>
                      <Download size={14} /> Revisar archivo original
                    </a>
                  )}
                </article>
              );
            })}
          </div>
          <article className="panel missing-evidence">
            <div>
              <Search />
              <span>
                <strong>Evidencia o información faltante</strong>
                <small>
                  Sugerencias para completar el contexto, sujetas a revisión.
                </small>
              </span>
            </div>
            {analysis.missingEvidence.length ? (
              <ul>
                {analysis.missingEvidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>
                No se identificaron faltantes concretos en las fuentes
                analizadas.
              </p>
            )}
          </article>
          <small className="analysis-footer">
            Análisis local con {analysis.model} ·{" "}
            {format(new Date(analysis.generatedAt), "dd/MM/yyyy 'a las' HH:mm")}{" "}
            · Los originales siempre prevalecen.
          </small>
        </>
      ) : (
        <article className="panel vault-empty">
          <FileCheck2 />
          <strong>Todavía no se organizaron las evidencias</strong>
          <p>
            El análisis quedará guardado y vinculado a los archivos originales
            mediante sus fuentes y hashes.
          </p>
        </article>
      )}
    </>
  );
}

function ContradictionsView() {
  const [analysis, setAnalysis] = useState<ContradictionsAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiGet<{ analysis: ContradictionsAnalysis | null }>(
      "/api/ai/analyses/contradictions",
    )
      .then((result) => setAnalysis(result.analysis))
      .catch(() => undefined);
  }, []);
  async function analyze() {
    setLoading(true);
    setError("");
    try {
      setAnalysis(
        await apiPost<ContradictionsAnalysis>(
          "/api/ai/analyses/contradictions",
          {},
        ),
      );
    } catch {
      setError(
        "No se pudo completar la comparación. Se necesitan al menos dos evidencias distintas indexadas y GroqCloud conectado.",
      );
    } finally {
      setLoading(false);
    }
  }
  const source = (id: string) =>
    analysis?.sources.find((item) => item.sourceId === id);
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">COMPARACIÓN LOCAL TRAZABLE</span>
          <h1>Posibles contradicciones</h1>
          <p>
            Compara versiones provenientes de evidencias diferentes sin atribuir
            intenciones ni conclusiones jurídicas.
          </p>
        </div>
        <button className="primary-button" onClick={analyze} disabled={loading}>
          <Scale size={17} />{" "}
          {loading
            ? "Comparando…"
            : analysis
              ? "Volver a analizar"
              : "Analizar evidencias"}
        </button>
      </section>
      <div className="contradiction-warning">
        <Info />
        <div>
          <strong>Indicadores para revisión, no conclusiones</strong>
          <span>
            Una posible incompatibilidad puede deberse a fechas, contextos o
            errores de transcripción. Siempre revisá los originales.
          </span>
        </div>
      </div>
      {error && <div className="login-error">{error}</div>}
      {analysis ? (
        <div className="contradictions-list">
          {analysis.contradictions.map((item, index) => (
            <article
              className="panel contradiction-card"
              key={`${item.sourceA}-${item.sourceB}-${index}`}
            >
              <div className="contradiction-head">
                <span>POSIBLE CONTRADICCIÓN {index + 1}</span>
                <div>
                  <b className={`severity ${item.severity}`}>
                    {item.severity === "high"
                      ? "Alta"
                      : item.severity === "medium"
                        ? "Media"
                        : "Baja"}
                  </b>
                  <small>Confianza {(item.confidence * 100).toFixed(0)}%</small>
                </div>
              </div>
              <div className="claims-compare">
                <section>
                  <span>{item.sourceA}</span>
                  <p>{item.claimA}</p>
                  {source(item.sourceA) && (
                    <a
                      href={evidenceDownloadUrl(
                        source(item.sourceA)!.evidenceId,
                      )}
                    >
                      {source(item.sourceA)!.evidenceName} <Download />
                    </a>
                  )}
                </section>
                <Scale />
                <section>
                  <span>{item.sourceB}</span>
                  <p>{item.claimB}</p>
                  {source(item.sourceB) && (
                    <a
                      href={evidenceDownloadUrl(
                        source(item.sourceB)!.evidenceId,
                      )}
                    >
                      {source(item.sourceB)!.evidenceName} <Download />
                    </a>
                  )}
                </section>
              </div>
              <div className="contradiction-reason">
                <strong>Motivo de la posible incompatibilidad</strong>
                <p>{item.reason}</p>
                <strong>Explicación alternativa</strong>
                <p>
                  {item.alternativeExplanation ||
                    "No fue identificada; requiere revisión humana."}
                </p>
              </div>
            </article>
          ))}
          {analysis.noContradictionsFound && (
            <article className="panel vault-empty">
              <ShieldCheck />
              <strong>
                No se detectaron contradicciones suficientemente respaldadas
              </strong>
              <p>
                Esto no demuestra que no existan; indica que las fuentes
                comparadas no alcanzaron el criterio mínimo.
              </p>
            </article>
          )}
          <small className="analysis-footer">
            Análisis local con {analysis.model} ·{" "}
            {format(new Date(analysis.generatedAt), "dd/MM/yyyy 'a las' HH:mm")}{" "}
            · Revisión humana obligatoria.
          </small>
        </div>
      ) : (
        <article className="panel vault-empty">
          <Scale />
          <strong>Todavía no se compararon las evidencias</strong>
          <p>
            GORE exigirá dos archivos distintos y conservará el resultado para
            futuras revisiones.
          </p>
        </article>
      )}
    </>
  );
}

function DraftsView() {
  const [drafts, setDrafts] = useState<AIDraft[]>([]);
  const [draftType, setDraftType] = useState("internal_report");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    apiGet<AIDraft[]>("/api/ai/drafts")
      .then(setDrafts)
      .catch(() => undefined);
  }, []);
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const draft = await apiPost<AIDraft>("/api/ai/drafts", {
        draftType,
        instructions: instructions.trim(),
      });
      setDrafts((previous) => [draft, ...previous]);
      setInstructions("");
    } catch {
      setError(
        "No se pudo generar el borrador. Revisá las indicaciones, las evidencias indexadas y GroqCloud.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function copyDraft(draft: AIDraft) {
    try {
      await navigator.clipboard.writeText(
        `${draft.title}\n\n${draft.body}\n\n${draft.disclaimer}`,
      );
      setCopied(draft.id);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("El navegador no permitió copiar el borrador.");
    }
  }
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">REDACCIÓN LOCAL CON REVISIÓN</span>
          <h1>Borradores asistidos</h1>
          <p>
            Prepara textos basados en fuentes sin enviar, firmar ni presentar
            nada automáticamente.
          </p>
        </div>
      </section>
      <form className="panel draft-form" onSubmit={generate}>
        <div className="panel-head">
          <div>
            <h2>Nuevo borrador</h2>
            <p>Elegí el formato y explicá qué necesitás preparar.</p>
          </div>
          <Sparkles />
        </div>
        <div className="draft-form-fields">
          <label>
            Tipo de borrador
            <select
              value={draftType}
              onChange={(event) => setDraftType(event.target.value)}
            >
              <option value="client_summary">Resumen para cliente</option>
              <option value="internal_report">Informe interno</option>
              <option value="questions">Lista de preguntas</option>
              <option value="minutes">Minuta</option>
              <option value="email">Correo</option>
              <option value="document_request">
                Solicitud de documentación
              </option>
              <option value="generic_legal">Borrador jurídico genérico</option>
            </select>
          </label>
          <label>
            Indicaciones opcionales
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={2000}
              placeholder="Ejemplo: preparar una lista breve de preguntas sobre las fechas y la modalidad de cuidado."
            />
          </label>
        </div>
        <div className="draft-form-actions">
          <span>
            {instructions.length}/2000 · Sólo se usarán evidencias relacionadas.
          </span>
          <button className="primary-button" disabled={loading}>
            <FileText size={16} />{" "}
            {loading ? "Redactando…" : "Generar borrador"}
          </button>
        </div>
        {error && <div className="login-error">{error}</div>}
      </form>
      <div className="draft-list">
        {drafts.map((draft) => (
          <article className="panel draft-card" key={draft.id}>
            <div className="draft-card-head">
              <div>
                <span>{draft.draftTypeLabel}</span>
                <h2>{draft.title}</h2>
                <small>
                  {format(
                    new Date(draft.generatedAt),
                    "dd/MM/yyyy 'a las' HH:mm",
                  )}{" "}
                  · {draft.model}
                </small>
              </div>
              <button onClick={() => copyDraft(draft)}>
                <FileCheck2 size={15} />{" "}
                {copied === draft.id ? "Copiado" : "Copiar borrador"}
              </button>
            </div>
            <div className="draft-disclaimer">
              <Info />
              <span>{draft.disclaimer}</span>
            </div>
            <div className="draft-body">{draft.body}</div>
            {(draft.reviewFields.length > 0 ||
              draft.unconfirmedInformation.length > 0) && (
              <div className="draft-review">
                <section>
                  <strong>Campos para revisar</strong>
                  {draft.reviewFields.length ? (
                    <ul>
                      {draft.reviewFields.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sin campos señalados.</p>
                  )}
                </section>
                <section>
                  <strong>Información no confirmada</strong>
                  {draft.unconfirmedInformation.length ? (
                    <ul>
                      {draft.unconfirmedInformation.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sin afirmaciones adicionales pendientes.</p>
                  )}
                </section>
              </div>
            )}
            <div className="assistant-citations">
              <strong>Documentos utilizados</strong>
              {draft.sources.map((source) => (
                <a
                  href={evidenceDownloadUrl(source.evidenceId)}
                  key={source.sourceId}
                >
                  <span>{source.sourceId}</span>
                  <div>
                    <strong>{source.evidenceName}</strong>
                    <p>{source.text}</p>
                    <small>SHA {source.textHash}</small>
                  </div>
                  <Download />
                </a>
              ))}
            </div>
          </article>
        ))}
        {drafts.length === 0 && (
          <article className="panel vault-empty">
            <FileText />
            <strong>No hay borradores guardados</strong>
            <p>
              Los textos generados aparecerán aquí y seguirán disponibles
              después de reiniciar GORE.
            </p>
          </article>
        )}
      </div>
    </>
  );
}

function AISourceReference({ source }: { source: AISourcePreview }) {
  return (
    <details className="ai-source-reference">
      <summary>
        <span>{source.sourceId}</span>
        {source.evidenceName}
      </summary>
      <div>
        <strong>
          {source.sectionLabel || "Fragmento utilizado por la IA"}
        </strong>
        {source.text ? (
          <p>{source.text}</p>
        ) : (
          <p>La vista previa textual no está disponible para esta fuente.</p>
        )}
        {source.textHash && (
          <code title={source.textHash}>
            SHA-256 del fragmento: {source.textHash}
          </code>
        )}
        <footer>
          <small>
            {source.sourceType === "whatsapp_chat"
              ? "Mensajes escritos preservados en el simulador"
              : source.method
                ? `Extracción local: ${source.method}`
                : "Fuente preservada en la bóveda"}
          </small>
          {source.evidenceId && (
            <a href={evidenceDownloadUrl(source.evidenceId)}>
              <Download /> Abrir original
            </a>
          )}
        </footer>
      </div>
    </details>
  );
}

function AIMessageFeedback({
  message,
  onSaved,
}: {
  message: AIChatMessage;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<"incorrect" | "review" | null>(null);
  const [comment, setComment] = useState(message.feedback?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const labels = { useful: "Útil", incorrect: "Incorrecta", review: "Revisar" };
  async function save(rating: "useful" | "incorrect" | "review", note = "") {
    setSaving(true);
    try {
      await apiPost(`/api/ai/chat/messages/${message.id}/feedback`, {
        rating,
        comment: note.trim(),
      });
      setEditing(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  if (message.role !== "assistant" || message.status !== "completed")
    return null;
  return (
    <div className="ai-message-feedback">
      <span>REVISIÓN HUMANA</span>
      <div className="ai-feedback-actions">
        <button
          className={
            message.feedback?.rating === "useful" ? "selected useful" : ""
          }
          disabled={saving}
          onClick={() => save("useful")}
        >
          <Check /> Útil
        </button>
        <button
          className={
            message.feedback?.rating === "incorrect" ? "selected incorrect" : ""
          }
          disabled={saving}
          onClick={() => {
            setEditing("incorrect");
            setComment(
              message.feedback?.rating === "incorrect"
                ? message.feedback.comment
                : "",
            );
          }}
        >
          <X /> Incorrecta
        </button>
        <button
          className={
            message.feedback?.rating === "review" ? "selected review" : ""
          }
          disabled={saving}
          onClick={() => {
            setEditing("review");
            setComment(
              message.feedback?.rating === "review"
                ? message.feedback.comment
                : "",
            );
          }}
        >
          <Clock3 /> Revisar
        </button>
      </div>
      {editing && (
        <div className="ai-feedback-note">
          <textarea
            maxLength={1000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={
              editing === "incorrect"
                ? "Explicá brevemente qué dato o interpretación debería corregirse…"
                : "Anotá qué aspecto queda pendiente de revisión…"
            }
          />
          <div>
            <small>{comment.length}/1000</small>
            <button disabled={saving} onClick={() => save(editing, comment)}>
              {saving ? "Guardando…" : "Guardar revisión"}
            </button>
          </div>
        </div>
      )}
      {message.feedback && !editing && (
        <small className="ai-feedback-saved">
          {labels[message.feedback.rating]}
          {message.feedback.comment ? ` · ${message.feedback.comment}` : ""}
        </small>
      )}
    </div>
  );
}

function AIActionCard({
  action,
  onReviewed,
}: {
  action: AIActionProposal;
  onReviewed: () => void;
}) {
  const [working, setWorking] = useState(false);
  const title =
    action.actionType === "create_event"
      ? action.payload.title
      : action.actionType === "link_evidence_to_event"
        ? `Asociar ${action.payload.evidenceName}`
        : action.actionType === "update_event_category"
          ? `Reclasificar ${action.payload.eventTitle}`
          : `Corregir ${action.payload.eventTitle}`;
  const detail =
    action.actionType === "create_event"
      ? `${action.payload.date} · ${action.payload.time} · ${action.payload.category}`
      : action.actionType === "link_evidence_to_event"
        ? `Destino: ${action.payload.eventTitle}${action.payload.previousEventId ? " · actualmente asociada a otro acontecimiento" : " · actualmente sin asociar"}`
        : action.actionType === "update_event_category"
          ? `${action.payload.previousCategory} → ${action.payload.newCategory}`
          : `${Object.keys(action.payload.changes ?? {}).length} campos cambiarán`;
  const description =
    action.actionType === "create_event"
      ? action.payload.description
      : action.actionType === "link_evidence_to_event"
        ? `La evidencia ${action.payload.evidenceId} quedará vinculada al acontecimiento ${action.payload.eventId}.`
        : action.actionType === "update_event_category"
          ? `Sólo cambiará la categoría del acontecimiento ${action.payload.eventId}; el resto de sus datos conservará una versión anterior.`
          : `Se actualizarán únicamente los campos indicados. La versión completa anterior quedará preservada.`;
  const approvalLabel =
    action.actionType === "create_event"
      ? "Aprobar y crear acontecimiento"
      : action.actionType === "link_evidence_to_event"
        ? "Aprobar asociación"
        : action.actionType === "update_event_category"
          ? "Aprobar reclasificación"
          : "Aprobar correcciones";
  async function review(decision: "approve" | "reject") {
    setWorking(true);
    try {
      await apiPost(`/api/ai/chat/actions/${action.id}/${decision}`, {});
      onReviewed();
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className={`ai-action-card ${action.status}`}>
      <div>
        <span>ACCIÓN PROPUESTA · REQUIERE TU CONFIRMACIÓN</span>
        <strong>{title}</strong>
        <small>{detail}</small>
        <p>{description}</p>
        {action.actionType === "update_event_details" && (
          <div className="ai-action-changes">
            {Object.entries(action.payload.changes ?? {}).map(
              ([field, change]) => (
                <div key={field}>
                  <b>{field}</b>
                  <del>{change.before || "Sin dato"}</del>
                  <span>→</span>
                  <ins>{change.after || "Sin dato"}</ins>
                </div>
              ),
            )}
          </div>
        )}
        {action.rationale && <em>{action.rationale}</em>}
        <small>Fuentes: {action.sourceIds.join(", ")}</small>
      </div>
      {action.status === "pending_review" ? (
        <div>
          <button disabled={working} onClick={() => review("reject")}>
            Descartar
          </button>
          <button
            className="approve"
            disabled={working}
            onClick={() => review("approve")}
          >
            <Check /> {approvalLabel}
          </button>
        </div>
      ) : (
        <b>
          {action.status === "approved"
            ? "Aprobado e incorporado"
            : "Descartado"}
        </b>
      )}
    </div>
  );
}

function SaveChatReportButton({ message }: { message: AIChatMessage }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  if (message.role !== "assistant" || message.status !== "completed")
    return null;
  async function save() {
    setState("saving");
    try {
      await apiPost(`/api/ai/chat/messages/${message.id}/save-report`, {});
      setState("saved");
    } catch {
      setState("error");
    }
  }
  return (
    <button
      type="button"
      className={`save-chat-report ${state}`}
      disabled={state === "saving" || state === "saved"}
      onClick={save}
    >
      <FileText />
      {state === "saving"
        ? "Guardando informe…"
        : state === "saved"
          ? "Guardado en Informes"
          : state === "error"
            ? "Reintentar guardado"
            : "Guardar como informe interno"}
    </button>
  );
}

function AIChatView() {
  const [conversations, setConversations] = useState<AIConversationSummary[]>(
    [],
  );
  const [archivedConversations, setArchivedConversations] = useState<
    AIConversationSummary[]
  >([]);
  const [active, setActive] = useState<AIConversation | null>(null);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingConversation, setEditingConversation] = useState<string | null>(
    null,
  );
  const [conversationTitle, setConversationTitle] = useState("");
  const [conversationAction, setConversationAction] = useState<string | null>(
    null,
  );
  const refreshList = () =>
    apiGet<AIConversationSummary[]>("/api/ai/chat/conversations")
      .then(setConversations)
      .catch(() => undefined);
  const refreshArchived = () =>
    apiGet<AIConversationSummary[]>("/api/ai/chat/conversations/archived")
      .then(setArchivedConversations)
      .catch(() => undefined);
  const loadConversation = (id: string) =>
    apiGet<AIConversation>(`/api/ai/chat/conversations/${id}`).then(setActive);
  useEffect(() => {
    refreshList();
  }, []);
  useEffect(() => {
    if (!active) return;
    const pending = active.messages.some(
      (item) => item.job && ["pending", "processing"].includes(item.job.status),
    );
    if (!pending) return;
    const timer = window.setInterval(() => {
      loadConversation(active.id)
        .then(refreshList)
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [active]);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const value =
      message.trim() ||
      (attachments.length
        ? "Analizá los archivos adjuntos y explicá sus datos relevantes, limitaciones y preguntas pendientes."
        : "");
    if (!value) return;
    setSending(true);
    setError("");
    try {
      const uploaded: Evidence[] = [];
      for (const file of attachments)
        uploaded.push(await apiUpload<Evidence>("/api/evidence", file));
      const result = await apiPost<AIConversation>("/api/ai/chat/messages", {
        conversationId: active?.id ?? null,
        message: value,
        evidenceIds: uploaded.map((item) => item.id),
      });
      setActive(result);
      setMessage("");
      setAttachments([]);
      refreshList();
    } catch {
      setError(
        "No se pudo subir algún adjunto o poner el mensaje en espera. Revisá el archivo y la conexión con GroqCloud.",
      );
    } finally {
      setSending(false);
    }
  }
  function addAttachments(files: FileList | null) {
    if (!files) return;
    setError("");
    setAttachments((previous) => {
      const next = [...previous];
      for (const file of Array.from(files))
        if (
          !next.some(
            (item) =>
              item.name === file.name &&
              item.size === file.size &&
              item.lastModified === file.lastModified,
          )
        )
          next.push(file);
      if (next.length > 10)
        setError("Podés adjuntar hasta 10 archivos en un mismo mensaje.");
      return next.slice(0, 10);
    });
  }
  async function retryFailed(index: number) {
    if (!active) return;
    const previous = [...active.messages.slice(0, index)]
      .reverse()
      .find((item) => item.role === "user");
    if (!previous) return;
    setSending(true);
    setError("");
    try {
      setActive(
        await apiPost<AIConversation>("/api/ai/chat/messages", {
          conversationId: active.id,
          message: previous.content,
        }),
      );
      refreshList();
    } catch {
      setError("No se pudo reintentar. Comprobá la conexión con GroqCloud.");
    } finally {
      setSending(false);
    }
  }
  async function cancelJob(jobId: string) {
    setError("");
    try {
      await apiPost(`/api/ai/chat/jobs/${jobId}/cancel`, {});
      if (active) await loadConversation(active.id);
      refreshList();
    } catch {
      setError(
        "No se pudo cancelar la tarea. Es posible que ya haya terminado.",
      );
    }
  }
  function beginRename(item: AIConversationSummary) {
    setEditingConversation(item.id);
    setConversationTitle(item.title);
    setError("");
  }
  async function renameConversation(event: React.FormEvent, id: string) {
    event.preventDefault();
    const title = conversationTitle.trim();
    if (!title) return;
    setConversationAction(id);
    setError("");
    try {
      const updated = await apiPut<AIConversationSummary>(
        `/api/ai/chat/conversations/${id}`,
        { title },
      );
      setConversations((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, ...updated } : item,
        ),
      );
      setActive((previous) =>
        previous?.id === id ? { ...previous, title: updated.title } : previous,
      );
      setEditingConversation(null);
    } catch {
      setError("No se pudo cambiar el nombre de la conversación.");
    } finally {
      setConversationAction(null);
    }
  }
  async function archiveConversation(id: string) {
    setConversationAction(id);
    setError("");
    try {
      await apiPost(`/api/ai/chat/conversations/${id}/archive`, {});
      if (active?.id === id) setActive(null);
      setEditingConversation(null);
      await Promise.all([refreshList(), refreshArchived()]);
    } catch {
      setError("No se pudo archivar la conversación.");
    } finally {
      setConversationAction(null);
    }
  }
  async function restoreConversation(id: string) {
    setConversationAction(id);
    setError("");
    try {
      await apiPost(`/api/ai/chat/conversations/${id}/restore`, {});
      await Promise.all([refreshList(), refreshArchived()]);
    } catch {
      setError("No se pudo restaurar la conversación.");
    } finally {
      setConversationAction(null);
    }
  }
  function toggleArchived() {
    setShowArchived((previous) => {
      if (!previous) refreshArchived();
      return !previous;
    });
  }
  const waiting = active?.messages.findLast(
    (item) => item.job && ["pending", "processing"].includes(item.job.status),
  );
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">
            CONVERSACIÓN PRIVADA EN SEGUNDO PLANO
          </span>
          <h1>Chat del expediente</h1>
          <p>
            Conversá en lenguaje neutral usando evidencias, análisis guardados y
            aclaraciones aportadas por vos.
          </p>
        </div>
      </section>
      <div className="ai-chat-layout">
        <aside className="panel ai-chat-history">
          <button className="primary-button" onClick={() => setActive(null)}>
            <Plus size={15} /> Nueva conversación
          </button>
          <div className="ai-conversation-list">
            {conversations.map((item) => (
              <div
                className={`ai-conversation-row ${active?.id === item.id ? "active" : ""}`}
                key={item.id}
              >
                {editingConversation === item.id ? (
                  <form
                    className="ai-conversation-rename"
                    onSubmit={(event) => renameConversation(event, item.id)}
                  >
                    <input
                      autoFocus
                      maxLength={100}
                      value={conversationTitle}
                      onChange={(event) =>
                        setConversationTitle(event.target.value)
                      }
                      aria-label="Nombre de la conversación"
                    />
                    <button
                      type="submit"
                      disabled={
                        !conversationTitle.trim() ||
                        conversationAction === item.id
                      }
                      aria-label="Guardar nombre"
                    >
                      <Check />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingConversation(null)}
                      aria-label="Cancelar"
                    >
                      <X />
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      className="ai-conversation-open"
                      onClick={() => loadConversation(item.id)}
                    >
                      <MessageCircle />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {format(new Date(item.updatedAt), "dd/MM HH:mm")}
                        </small>
                      </span>
                    </button>
                    <div className="ai-conversation-actions">
                      <button
                        onClick={() => beginRename(item)}
                        aria-label={`Renombrar ${item.title}`}
                        title="Renombrar"
                      >
                        <Pencil />
                      </button>
                      <button
                        onClick={() => archiveConversation(item.id)}
                        disabled={conversationAction === item.id}
                        aria-label={`Archivar ${item.title}`}
                        title="Archivar"
                      >
                        <Archive />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <button
            className={`ai-archived-toggle ${showArchived ? "open" : ""}`}
            onClick={toggleArchived}
          >
            <Archive />
            <span>
              {showArchived ? "Ocultar archivadas" : "Ver archivadas"}
            </span>
            <small>{archivedConversations.length || ""}</small>
          </button>
          {showArchived && (
            <div className="ai-archived-list">
              {archivedConversations.map((item) => (
                <div className="ai-archived-row" key={item.id}>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {format(new Date(item.updatedAt), "dd/MM HH:mm")}
                    </small>
                  </span>
                  <button
                    onClick={() => restoreConversation(item.id)}
                    disabled={conversationAction === item.id}
                    title="Restaurar"
                  >
                    <RotateCcw /> Restaurar
                  </button>
                </div>
              ))}
              {archivedConversations.length === 0 && (
                <p>No hay conversaciones archivadas.</p>
              )}
            </div>
          )}
        </aside>
        <section className="panel ai-chat-main">
          <div className="ai-chat-notice">
            <ShieldCheck />
            <div>
              <strong>Modelo avanzado · carga moderada</strong>
              <span>
                Una sola tarea a la vez, contexto reducido y liberación
                automática del modelo. Las aclaraciones tuyas se identifican
                como datos aportados por el usuario.
              </span>
            </div>
          </div>
          <div className="ai-chat-messages">
            {active?.messages.map((item, index) => (
              <div
                className={`ai-chat-message ${item.role} ${["failed", "cancelled"].includes(item.status) ? "failed" : ""}`}
                key={item.id}
              >
                <div>
                  <span>
                    {item.role === "user"
                      ? "Vos · dato aportado por el usuario"
                      : "GORE · IA del expediente"}
                  </span>
                  {item.status === "queued" || item.status === "processing" ? (
                    <div className="ai-job-progress">
                      <div>
                        <strong>{item.job?.stage ?? "En cola"}</strong>
                        <small>
                          {item.job?.model} · {item.job?.progress ?? 0}%
                        </small>
                      </div>
                      <div className="ai-job-track">
                        <i style={{ width: `${item.job?.progress ?? 0}%` }} />
                      </div>
                      <p>
                        Podés cambiar de pestaña o cerrar GORE. La tarea
                        continuará y se recuperará al reiniciar.
                      </p>
                      {item.job && (
                        <button
                          type="button"
                          className="cancel-ai-job"
                          onClick={() => cancelJob(item.job!.id)}
                        >
                          <X size={13} /> Cancelar análisis
                        </button>
                      )}
                    </div>
                  ) : item.status === "failed" ? (
                    <div className="chat-failed">
                      <p>
                        La IA no terminó la respuesta dentro del tiempo
                        permitido permitido.
                      </p>
                      <button
                        onClick={() => retryFailed(index)}
                        disabled={sending}
                      >
                        <Clock3 size={14} /> Reintentar este mensaje
                      </button>
                    </div>
                  ) : (
                    <p>{item.content}</p>
                  )}
                  {item.sources.length > 0 && (
                    <div className="chat-sources">
                      {item.sources.map((source) => (
                        <AISourceReference
                          source={source}
                          key={source.sourceId}
                        />
                      ))}
                    </div>
                  )}
                  {item.actions?.map((action) => (
                    <AIActionCard
                      action={action}
                      onReviewed={() => active && loadConversation(active.id)}
                      key={action.id}
                    />
                  ))}
                  <SaveChatReportButton message={item} />
                  <AIMessageFeedback
                    message={item}
                    onSaved={() => active && loadConversation(active.id)}
                  />
                </div>
              </div>
            ))}
            {!active && (
              <div className="vault-empty">
                <MessageCircle />
                <strong>Iniciá una conversación</strong>
                <p>
                  Podés saludar, consultar pendientes o adjuntar archivos para
                  analizarlos. GORE distinguirá tus aclaraciones de las
                  evidencias originales.
                </p>
              </div>
            )}
          </div>
          {waiting && (
            <div className="chat-background-indicator">
              <Clock3 /> La IA está trabajando en segundo plano. Podés seguir
              usando el resto de GORE.
            </div>
          )}
          <form className="ai-chat-form" onSubmit={send}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={50000}
              placeholder="Consultá el expediente o pedí propuestas para organizarlo…"
            />
            {attachments.length > 0 && (
              <div className="ai-chat-attachments">
                {attachments.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}`}>
                    <FileCheck2 />
                    <span>
                      <strong>{file.name}</strong>
                      <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((previous) =>
                          previous.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                      aria-label={`Quitar ${file.name}`}
                    >
                      <X />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <span className="ai-chat-form-meta">
                <label className={attachments.length >= 10 ? "disabled" : ""}>
                  <input
                    type="file"
                    multiple
                    disabled={sending || attachments.length >= 10}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.mp3,.wav,.ogg,.opus,.m4a,.aac,.mp4,.webm"
                    onChange={(event) => {
                      addAttachments(event.target.files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <Paperclip /> Adjuntar
                </label>
                <small>
                  {message.length.toLocaleString("es-AR")}/50.000 ·{" "}
                  {attachments.length}/10 archivos
                </small>
              </span>
              <button
                className="primary-button"
                disabled={
                  sending || (!message.trim() && attachments.length === 0)
                }
              >
                <ArrowRight size={16} />{" "}
                {sending ? "Subiendo y encolando…" : "Enviar"}
              </button>
            </div>
          </form>
          {error && <div className="login-error">{error}</div>}
        </section>
      </div>
    </>
  );
}

function CommunicationsView({
  events,
  openModal,
  openEvent,
}: {
  events: EventItem[];
  openModal: () => void;
  openEvent: (event: EventItem) => void;
}) {
  const communications = events.filter((event) =>
    ["Comunicación", "Videollamada"].includes(event.category),
  );
  const completed = communications.filter((event) =>
    /realizada|concretada|atendida/i.test(
      `${event.actual} ${event.description}`,
    ),
  ).length;
  const pending = communications.filter(
    (event) => event.status !== "Revisado",
  ).length;
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">CONTACTO Y COORDINACIÓN</span>
          <h1>Comunicaciones</h1>
          <p>
            Solicitudes, llamadas, videollamadas y respuestas reunidas en una
            cronología específica.
          </p>
        </div>
        <button className="primary-button" onClick={openModal}>
          <Plus size={18} /> Registrar comunicación
        </button>
      </section>
      <section className="summary-grid communication-summary">
        <article className="summary-card">
          <div className="summary-icon blue">
            <MessageCircle />
          </div>
          <div>
            <span>Registros</span>
            <strong>{communications.length}</strong>
            <small>comunicaciones documentadas</small>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon green">
            <Check />
          </div>
          <div>
            <span>Concretadas</span>
            <strong>{completed}</strong>
            <small>según el registro objetivo</small>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon amber">
            <Clock3 />
          </div>
          <div>
            <span>Pendientes</span>
            <strong>{pending}</strong>
            <small>por revisar</small>
          </div>
        </article>
      </section>
      <article className="panel list-panel">
        <div className="panel-head">
          <div>
            <h2>Historial de comunicaciones</h2>
            <p>Ordenado desde el registro más reciente</p>
          </div>
        </div>
        <div className="events-list">
          {communications.length ? (
            communications.map((event, index) => (
              <EventRow
                event={event}
                last={index === communications.length - 1}
                onOpen={openEvent}
                key={event.id}
              />
            ))
          ) : (
            <div className="vault-empty">
              <MessageCircle />
              <strong>Todavía no hay comunicaciones</strong>
              <p>
                Usá “Registrar comunicación” y elegí la categoría Comunicación o
                Videollamada.
              </p>
            </div>
          )}
        </div>
      </article>
    </>
  );
}

function parseWhatsApp(text: string): ChatMessage[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const dash =
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.*)$/;
  const bracket =
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;
  const messages: ChatMessage[] = [];
  for (const line of lines) {
    const match = line.match(dash) ?? line.match(bracket);
    if (match) {
      const payload = match[3];
      const separator = payload.indexOf(": ");
      if (separator > 0)
        messages.push({
          id: messages.length + 1,
          date: match[1],
          time: match[2].slice(0, 5),
          sender: payload.slice(0, separator).trim(),
          text: payload.slice(separator + 2),
          system: false,
        });
      else
        messages.push({
          id: messages.length + 1,
          date: match[1],
          time: match[2].slice(0, 5),
          sender: "",
          text: payload,
          system: true,
        });
    } else if (messages.length && line.trim())
      messages[messages.length - 1].text += `\n${line}`;
  }
  return messages;
}

function chatFingerprint(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `CHAT-${(hash >>> 0).toString(16).padStart(8, "0")}-${text.length}`;
}

function normalizedChatDate(value: string) {
  const [day, month, rawYear] = value.split("/").map(Number);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function capturedTimestamp(value: string | null) {
  const text = value ?? "";
  const dateMatch = text.match(/([0-3]?\d)[/.-]([01]?\d)[/.-](20\d{2}|\d{2})/);
  const timeMatch = text.match(/([0-2]?\d):([0-5]\d)/);
  if (!dateMatch || !timeMatch) return null;
  const year =
    Number(dateMatch[3]) < 100
      ? 2000 + Number(dateMatch[3])
      : Number(dateMatch[3]);
  return {
    date: `${dateMatch[1].padStart(2, "0")}/${dateMatch[2].padStart(2, "0")}/${year}`,
    time: `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`,
  };
}

function audioFileDate(file: File) {
  const compact = file.name.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  if (file.lastModified)
    return format(new Date(file.lastModified), "yyyy-MM-dd");
  return "";
}

function audioSequence(file: File) {
  const match =
    file.name.match(/(?:WA|PTT|AUD)[-_]?(\d{3,6})(?!.*(?:WA|PTT|AUD))/i) ??
    file.name.match(/(\d+)(?=\.[^.]+$)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function chatMessageTimestamp(message: ChatMessage) {
  const [day, month, rawYear] = message.date.split("/").map(Number);
  const [hours, minutes] = message.time.split(":").map(Number);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return new Date(year, month - 1, day, hours, minutes).getTime();
}

function reliableFileTimestamp(file: File, expectedDate: string) {
  if (!file.lastModified) return 0;
  return format(new Date(file.lastModified), "yyyy-MM-dd") === expectedDate
    ? file.lastModified
    : 0;
}

function automaticallyMatchAudio(
  messages: ChatMessage[],
  files: File[],
): AudioMatch[] {
  const audioFiles = files
    .filter(
      (file) =>
        /\.(opus|ogg|oga|m4a|aac|mp3|wav|webm|amr)$/i.test(file.name) ||
        file.type.startsWith("audio/"),
    )
    .sort(
      (left, right) =>
        audioFileDate(left).localeCompare(audioFileDate(right)) ||
        audioSequence(left) - audioSequence(right) ||
        left.lastModified - right.lastModified ||
        left.name.localeCompare(right.name),
    );
  const omitted = messages.filter(
    (message) =>
      !message.system &&
      /(?:multimedia|archivo).{0,30}omitid|audio omitid/i.test(message.text),
  );
  const unusedMessages = new Set(omitted);
  const results: AudioMatch[] = [];
  for (const file of audioFiles) {
    const date = audioFileDate(file);
    const fileTimestamp = reliableFileTimestamp(file, date);
    if (!fileTimestamp) continue;
    const nearest = omitted
      .filter(
        (message) =>
          unusedMessages.has(message) &&
          normalizedChatDate(message.date) === date,
      )
      .map((message) => ({
        message,
        difference: Math.abs(fileTimestamp - chatMessageTimestamp(message)),
      }))
      .sort((left, right) => left.difference - right.difference)[0];
    if (!nearest) continue;
    const differenceMinutes = Math.round(nearest.difference / 60_000);
    if (differenceMinutes > 10) continue;
    const message = nearest.message;
    unusedMessages.delete(message);
    const confidence: AudioMatch["confidence"] =
      differenceMinutes <= 2 ? "high" : "probable";
    const reason =
      confidence === "high"
        ? `Fecha coincidente y horario del archivo a ${differenceMinutes} min del mensaje.`
        : confidence === "probable"
          ? "Fecha coincidente; asociación por horario disponible y secuencia del nombre."
          : "No hay coincidencia de fecha suficiente; requiere revisión antes de utilizarla.";
    results.push({
      messageId: message.id,
      file,
      confidence,
      reason,
      previewUrl: URL.createObjectURL(file),
    });
  }
  return results;
}

function WhatsAppSimulator({
  evidence,
  onEvidence,
  audioProgress,
  prepareAllAudios,
}: {
  evidence: Evidence[];
  onEvidence: (item: Evidence) => void;
  audioProgress: AudioIndexStatus | null;
  prepareAllAudios: () => Promise<void>;
}) {
  const [raw, setRaw] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [self, setSelf] = useState("");
  const [contactName, setContactName] = useState("Contacto");
  const [error, setError] = useState("");
  const [chatId, setChatId] = useState("");
  const [audioMatches, setAudioMatches] = useState<AudioMatch[]>([]);
  const [audioStatus, setAudioStatus] = useState("");
  const [savedChats, setSavedChats] = useState<StoredChatSummary[]>([]);
  const [transcriptions, setTranscriptions] = useState<
    Record<string, AudioTranscription>
  >({});
  const [bulkStarting, setBulkStarting] = useState(false);
  const [writtenAnalysis, setWrittenAnalysis] =
    useState<WhatsAppAnalysisStatus | null>(null);
  const [writtenStarting, setWrittenStarting] = useState(false);
  const refreshSavedChatsRef = useRef<
    (openLatest?: boolean) => Promise<void>
  >(async () => undefined);
  const senders = useMemo(
    () =>
      Array.from(
        new Set(
          messages
            .filter((message) => !message.system)
            .map((message) => message.sender),
        ),
      ),
    [messages],
  );
  async function refreshSavedChats(openLatest = false) {
    try {
      const rows = await apiGet<StoredChatSummary[]>("/api/whatsapp/chats");
      setSavedChats(rows);
      if (openLatest && rows[0]) await loadSavedChat(rows[0].id);
    } catch {
      /* modo local */
    }
  }
  refreshSavedChatsRef.current = refreshSavedChats;
  async function analyzeWrittenMessages() {
    if (!chatId) return;
    setWrittenStarting(true);
    try {
      setWrittenAnalysis(
        await apiPost<WhatsAppAnalysisStatus>(
          `/api/ai/whatsapp-analysis/${encodeURIComponent(chatId)}/start`,
          {},
        ),
      );
    } catch {
      setError(
        "No se pudo iniciar el análisis incremental. Verificá que el chat esté guardado y GroqCloud conectado.",
      );
    } finally {
      setWrittenStarting(false);
    }
  }
  useEffect(() => {
    if (!chatId) {
      setWrittenAnalysis(null);
      return;
    }
    let active = true;
    const refresh = () =>
      apiGet<{ items: WhatsAppAnalysisStatus[] }>(
        `/api/ai/whatsapp-analysis/status?chatId=${encodeURIComponent(chatId)}`,
      )
        .then((result) => active && setWrittenAnalysis(result.items[0] ?? null))
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [chatId]);
  async function persistChat(
    id: string,
    display: string,
    ownName: string,
    sourceRaw: string,
    chatMessages: ChatMessage[],
    matches: AudioMatch[],
    sourceType = "whatsapp_export",
  ) {
    if (!id || !chatMessages.length) return;
    await apiPut(`/api/whatsapp/chats/${encodeURIComponent(id)}`, {
      id,
      displayName: display || "Contacto",
      selfName: ownName,
      sourceType,
      rawText: sourceRaw,
      messages: chatMessages,
      audioMatches: matches
        .filter((item) => item.evidence)
        .map((item) => ({
          messageId: item.messageId,
          evidenceId: item.evidence?.id,
          confidence: item.confidence,
          reason: item.reason,
        })),
    });
    await refreshSavedChats();
  }
  async function loadSavedChat(id: string) {
    try {
      const stored = await apiGet<StoredChat>(
        `/api/whatsapp/chats/${encodeURIComponent(id)}`,
      );
      const restored = stored.audioMatches.map((item) => ({
        messageId: item.messageId,
        evidence: evidence.find(
          (candidate) => candidate.id === item.evidenceId,
        ),
        confidence: item.confidence,
        reason: item.reason,
      }));
      setChatId(stored.id);
      setRaw(stored.rawText);
      setMessages(stored.messages);
      setSelf(stored.selfName);
      setContactName(stored.displayName);
      setAudioMatches(restored);
      setError("");
      setAudioStatus(
        `${stored.messages.length} mensajes y ${restored.length} audios recuperados de la base de datos.`,
      );
    } catch {
      setError("No pudimos recuperar esa conversación.");
    }
  }
  async function deleteSavedChat(id: string) {
    if (
      !window.confirm(
        "¿Quitar esta conversación del simulador? Las evidencias originales permanecerán en la bóveda.",
      )
    )
      return;
    await apiDelete(`/api/whatsapp/chats/${encodeURIComponent(id)}`);
    if (chatId === id) {
      setChatId("");
      setRaw("");
      setMessages([]);
      setAudioMatches([]);
    }
    await refreshSavedChats();
  }
  async function showTranscription(evidenceId: string, force = false) {
    setTranscriptions((previous) => ({
      ...previous,
      [evidenceId]: {
        evidence_id: evidenceId,
        text: "",
        status: "processing",
        language: "es",
        engine: "faster-whisper-small",
        updated_at: "",
      },
    }));
    try {
      let result = await apiGet<AudioTranscription>(
        `/api/evidence/${encodeURIComponent(evidenceId)}/transcription`,
      );
      if (force || !["completed", "empty"].includes(result.status)) {
        try {
          result = await apiPost<AudioTranscription>(
            `/api/evidence/${encodeURIComponent(evidenceId)}/transcribe`,
            {},
          );
        } catch {
          // Si el túnel interrumpe una solicitud larga, el servidor puede continuar procesándola.
          // Consultamos el estado antes de informar un fallo inexistente al usuario.
          for (let attempt = 0; attempt < 45; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 2_000));
            result = await apiGet<AudioTranscription>(
              `/api/evidence/${encodeURIComponent(evidenceId)}/transcription`,
            );
            if (["completed", "empty"].includes(result.status)) break;
            if (result.status === "failed")
              throw new Error("transcription_failed");
          }
          if (!["completed", "empty"].includes(result.status))
            throw new Error("transcription_timeout");
        }
      }
      setTranscriptions((previous) => ({ ...previous, [evidenceId]: result }));
    } catch {
      setTranscriptions((previous) => ({
        ...previous,
        [evidenceId]: {
          evidence_id: evidenceId,
          text: "",
          status: "failed",
          language: "",
          engine: "",
          updated_at: "",
        },
      }));
    }
  }
  async function simulate(text = raw) {
    const parsed = parseWhatsApp(text);
    if (!parsed.length) {
      setError("No encontramos mensajes con el formato original de WhatsApp.");
      return;
    }
    const nextChatId = chatFingerprint(text);
    const restored = evidence
      .filter((item) => item.chatMessageRef?.startsWith(`${nextChatId}:`))
      .map((item) => ({
        messageId: Number(item.chatMessageRef?.split(":").at(-1)),
        evidence: item,
        confidence: (item.matchConfidence ||
          "probable") as AudioMatch["confidence"],
        reason: item.matchDetails || "Asociación recuperada de la bóveda.",
      }));
    setError("");
    setMessages(parsed);
    setChatId(nextChatId);
    setAudioMatches(restored);
    setAudioStatus(
      restored.length
        ? `${restored.length} audios vinculados fueron recuperados de la bóveda.`
        : "",
    );
    const participants = Array.from(
      new Set(
        parsed
          .filter((message) => !message.system)
          .map((message) => message.sender),
      ),
    );
    const nextSelf = participants.includes(self)
      ? self
      : (participants[0] ?? "");
    const nextContact =
      participants.find((item) => item !== nextSelf) ??
      participants[0] ??
      "Contacto";
    setSelf(nextSelf);
    setContactName(nextContact);
    try {
      await persistChat(
        nextChatId,
        nextContact,
        nextSelf,
        text,
        parsed,
        restored,
      );
    } catch {
      setError("El chat se abrió, pero no pudo guardarse en la base de datos.");
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      let text = "";
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const entry = Object.values(zip.files).find(
          (item) => !item.dir && item.name.toLowerCase().endsWith(".txt"),
        );
        if (!entry) throw new Error("ZIP sin TXT");
        text = await entry.async("string");
      } else text = await file.text();
      setRaw(text);
      await simulate(text);
    } catch {
      setError(
        "No pudimos leer el archivo. Importá el ZIP o TXT original exportado por WhatsApp.",
      );
    }
  }
  async function importCapturedPackage(file: File | undefined) {
    if (!file) return;
    setError("");
    setAudioStatus("Validando el paquete capturado por la extensión…");
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry)
        throw new Error("El paquete no contiene manifest.json.");
      const manifest = validateGoreWhatsAppManifest(
        JSON.parse(await manifestEntry.async("string")),
      ) as GoreWhatsAppManifest;
      for (const media of manifest.media) {
        const entry = zip.file(media.exportedFilename);
        if (!entry)
          throw new Error(`Falta el original ${media.exportedFilename}.`);
        const buffer = await entry.async("arraybuffer");
        if (
          buffer.byteLength !== media.size ||
          (await sha256Hex(buffer)) !== media.sha256
        )
          throw new Error(
            `Falló la integridad SHA-256 de ${media.exportedFilename}.`,
          );
      }
      const occupied = new Set<number>();
      let nextId = Math.max(0, ...messages.map((item) => item.id)) + 1;
      const addedMessages: ChatMessage[] = [];
      const targets = new Map<string, ChatMessage>();
      if (!messages.length) {
        for (const captured of [...manifest.messages].sort(
          (left, right) => left.position - right.position,
        )) {
          const stamp = capturedTimestamp(captured.visibleTimestamp);
          const fallback = stamp ?? {
            date: format(new Date(), "dd/MM/yyyy"),
            time: format(new Date(), "HH:mm"),
          };
          const target = {
            id: captured.position,
            date: fallback.date,
            time: fallback.time,
            sender: captured.sender || "Contacto",
            text:
              captured.type === "voice_note"
                ? "<Nota de voz capturada por la extensión GORE>"
                : captured.text || "",
            system: captured.direction === "system",
          };
          addedMessages.push(target);
          if (captured.type === "voice_note" && captured.mediaId)
            targets.set(captured.id, target);
        }
      } else {
        for (const captured of manifest.messages.filter(
          (item) => item.type === "voice_note" && item.mediaId,
        )) {
          const stamp = capturedTimestamp(captured.visibleTimestamp);
          let target = stamp
            ? messages.find(
                (item) =>
                  !occupied.has(item.id) &&
                  item.date === stamp.date &&
                  item.time === stamp.time &&
                  /omitid/i.test(item.text),
              )
            : undefined;
          if (!target) {
            const fallback = stamp ?? {
              date: format(new Date(), "dd/MM/yyyy"),
              time: format(new Date(), "HH:mm"),
            };
            target = {
              id: nextId++,
              date: fallback.date,
              time: fallback.time,
              sender: captured.sender || "Contacto",
              text: "<Nota de voz capturada por la extensión GORE>",
              system: false,
            };
            addedMessages.push(target);
          }
          occupied.add(target.id);
          targets.set(captured.id, target);
        }
      }
      const imported: AudioMatch[] = [];
      setAudioStatus(
        `Enviando ${manifest.media.length} audios para una segunda verificación en el servidor…`,
      );
      const result = await apiUpload<{
        items: { messageId: string; evidence: Evidence }[];
      }>("/api/imports/whatsapp-package", file);
      for (const capturedItem of result.items) {
        const target = targets.get(capturedItem.messageId);
        if (!target) continue;
        const reason =
          capturedItem.evidence.matchDetails ||
          `Capturado desde una burbuja específica por la extensión GORE ${manifest.source.extensionVersion}.`;
        onEvidence(capturedItem.evidence);
        imported.push({
          messageId: target.id,
          evidence: capturedItem.evidence,
          confidence: "captured",
          reason,
        });
      }
      const finalMessages = [...messages, ...addedMessages].sort(
        (left, right) =>
          normalizedChatDate(left.date).localeCompare(
            normalizedChatDate(right.date),
          ) || left.time.localeCompare(right.time),
      );
      const finalMatches = [
        ...audioMatches.filter(
          (item) => !imported.some((next) => next.messageId === item.messageId),
        ),
        ...imported,
      ];
      const targetChatId = chatId || `CAPTURE-${manifest.chat.stableKey}`;
      setMessages(finalMessages);
      setChatId(targetChatId);
      setContactName(manifest.chat.displayName);
      setAudioMatches(finalMatches);
      await persistChat(
        targetChatId,
        manifest.chat.displayName,
        self,
        raw,
        finalMessages,
        finalMatches,
        "chrome_extension",
      );
      setAudioStatus(
        `Paquete verificado: ${imported.length} audios preservados con SHA-256 y asociación directa de burbuja.`,
      );
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "No pudimos validar el paquete de la extensión GORE.",
      );
      setAudioStatus(
        "No se incorporó ningún audio que no hubiera superado la validación.",
      );
    }
  }
  async function scanAudioFolder(files: FileList | null) {
    if (!files?.length || !messages.length) return;
    const candidates = Array.from(files);
    const proposed = automaticallyMatchAudio(messages, candidates);
    const withFiles = proposed.filter((match) => match.file);
    if (!withFiles.length) {
      setAudioStatus(
        "No encontramos archivos de audio compatibles en la carpeta seleccionada.",
      );
      return;
    }
    if (withFiles.length > 200) {
      setAudioStatus(
        `Protección activada: se detectaron ${withFiles.length} coincidencias. No se subió ningún archivo; reducí la carpeta o el fragmento del chat.`,
      );
      return;
    }
    const confirmed = window.confirm(
      `GORE encontró ${withFiles.length} audios con fecha y horario cercanos a este chat. ¿Querés preservar solamente estos ${withFiles.length} archivos?`,
    );
    if (!confirmed) {
      setAudioStatus("Operación cancelada. No se subió ningún archivo.");
      return;
    }
    setAudioStatus(`Analizando y preservando ${withFiles.length} audios…`);
    const stored: AudioMatch[] = [];
    for (let index = 0; index < proposed.length; index++) {
      const match = proposed[index];
      if (!match.file) {
        stored.push(match);
        continue;
      }
      const message = messages.find((item) => item.id === match.messageId);
      if (!message) continue;
      setAudioStatus(`Preservando audio ${index + 1} de ${withFiles.length}…`);
      try {
        const item = await apiUpload<Evidence>(
          "/api/evidence",
          match.file,
          undefined,
          normalizedChatDate(message.date),
          {
            chatMessageRef: `${chatId}:${message.id}`,
            matchConfidence: match.confidence,
            matchDetails: match.reason,
          },
        );
        onEvidence(item);
        stored.push({ ...match, evidence: item });
      } catch {
        stored.push({
          ...match,
          confidence: "low",
          reason: `${match.reason} No se pudo preservar el original en el servidor.`,
        });
      }
    }
    setAudioMatches(stored);
    try {
      await persistChat(chatId, contactName, self, raw, messages, stored);
    } catch {
      setError(
        "Los audios se preservaron, pero no pudimos actualizar la conversación guardada.",
      );
    }
    const high = stored.filter((item) => item.confidence === "high").length;
    const probable = stored.filter(
      (item) => item.confidence === "probable",
    ).length;
    const low = stored.filter((item) => item.confidence === "low").length;
    setAudioStatus(
      `Proceso completo: ${high} coincidencias confirmadas, ${probable} probables y ${low} de baja confianza.`,
    );
  }
  // Se ejecuta una sola vez para restaurar la conversación más reciente sin reabrirla ante cada cambio de evidencia.
  useEffect(() => {
    void refreshSavedChatsRef.current(true);
  }, []);
  useEffect(() => {
    const other = senders.find((sender) => sender !== self);
    if (other) setContactName(other);
  }, [self, senders]);
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">RECONSTRUCCIÓN VISUAL AUXILIAR</span>
          <h1>Simulador de chats de WhatsApp</h1>
          <p>
            Importá el ZIP o TXT original, o pegá un fragmento, para
            reconstruirlo visualmente sin modificar la fuente.
          </p>
        </div>
      </section>
      <section className="wa-transcription-progress">
        <div className="wa-progress-head">
          <div>
            <strong>Análisis incremental de mensajes escritos</strong>
            <span>
              {writtenAnalysis
                ? `${writtenAnalysis.analyzedMessages} de ${writtenAnalysis.totalMessages} analizados · ${writtenAnalysis.pendingMessages} nuevos o pendientes`
                : "La IA creará un mapa trazable del chat completo y después revisará solamente los mensajes nuevos."}
            </span>
          </div>
          <button
            type="button"
            disabled={
              writtenStarting ||
              !chatId ||
              messages.length === 0 ||
              ["pending", "processing"].includes(writtenAnalysis?.status ?? "")
            }
            onClick={analyzeWrittenMessages}
          >
            {writtenStarting
              ? "Preparando…"
              : ["pending", "processing"].includes(
                    writtenAnalysis?.status ?? "",
                  )
                ? "Trabajando en segundo plano"
                : writtenAnalysis?.pendingMessages === 0 &&
                    writtenAnalysis.totalMessages > 0
                  ? "Todo actualizado"
                  : writtenAnalysis?.status === "failed"
                    ? "Reintentar análisis"
                    : "Analizar chat y transcripciones"}
          </button>
        </div>
        {writtenAnalysis && (
          <>
            <div className="wa-progress-track">
              <span style={{ width: `${writtenAnalysis.percent}%` }} />
            </div>
            <small>
              {writtenAnalysis.percent}% · {writtenAnalysis.stage}
              {writtenAnalysis.proposalsCreated
                ? ` · ${writtenAnalysis.proposalsCreated} propuestas creadas`
                : ""}
              {writtenAnalysis.summarySegments
                ? ` · ${writtenAnalysis.summarySegments} bloques disponibles para el Chat del expediente`
                : ""}
              . Podés cerrar GORE; continuará al volver a iniciar el servidor.
              Nada pasa al calendario sin aprobación.
            </small>
          </>
        )}
      </section>
      {audioProgress && audioProgress.total > 0 && (
        <section className="wa-transcription-progress">
          <div className="wa-progress-head">
            <div>
              <strong>Transcripción de todos los audios</strong>
              <span>
                {audioProgress.completed} de {audioProgress.total} procesados
                {audioProgress.failed
                  ? ` · ${audioProgress.failed} requieren revisión`
                  : ""}
              </span>
            </div>
            <button
              type="button"
              disabled={
                bulkStarting ||
                audioProgress.queued > 0 ||
                audioProgress.finished
              }
              onClick={async () => {
                setBulkStarting(true);
                try {
                  await prepareAllAudios();
                } finally {
                  setBulkStarting(false);
                }
              }}
            >
              {audioProgress.finished
                ? "Completado"
                : audioProgress.queued
                  ? "Trabajando en segundo plano"
                  : bulkStarting
                    ? "Preparando…"
                    : "Transcribir todos los audios"}
            </button>
          </div>
          <div className="wa-progress-track">
            <span style={{ width: `${audioProgress.percent}%` }} />
          </div>
          <small>
            {audioProgress.percent}% · Podés cambiar de pestaña o cerrar esta
            página. El servidor conservará y retomará el progreso.
          </small>
        </section>
      )}
      <div className="wa-workspace">
        <aside className="panel wa-import">
          <div className="panel-head">
            <div>
              <h2>Conversación original</h2>
              <p>El procesamiento se realiza dentro de GORE</p>
            </div>
            <FileArchive />
          </div>
          <div className="wa-saved-chats">
            <strong>Seleccionar conversación</strong>
            <div className="wa-chat-select-row">
              <select
                value={chatId}
                onChange={(event) =>
                  event.target.value && loadSavedChat(event.target.value)
                }
              >
                <option value="">
                  {savedChats.length
                    ? "Elegí un contacto"
                    : "Todavía no hay chats guardados"}
                </option>
                {savedChats.map((chat) => (
                  <option value={chat.id} key={chat.id}>
                    {chat.displayName} · {chat.messageCount} mensajes ·{" "}
                    {chat.audioCount} audios
                  </option>
                ))}
              </select>
              {chatId && (
                <button
                  title="Quitar esta conversación"
                  onClick={() => deleteSavedChat(chatId)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <small>
              Al importar otro ZIP o TXT se agregará automáticamente como una
              conversación separada.
            </small>
          </div>
          <div className="wa-extension-card">
            <div>
              <ShieldCheck />
              <span>
                <strong>Captura directa desde Chrome</strong>
                <small>Complemento independiente para WhatsApp Web</small>
              </span>
            </div>
            <p>
              Captura cada nota de voz desde su burbuja, calcula SHA-256 y crea
              un paquete verificable.
            </p>
            <div className="wa-extension-actions">
              <a href="/downloads/GORE-Chrome-v1.2.0.zip" download>
                <Download size={16} /> Descargar extensión
              </a>
              <label>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(event) =>
                    importCapturedPackage(event.target.files?.[0])
                  }
                />
                <FileCheck2 size={16} /> Importar paquete GORE
              </label>
            </div>
            <details>
              <summary>Cómo instalarla en Chrome</summary>
              <ol>
                <li>Descomprimí el ZIP descargado.</li>
                <li>
                  Abrí <code>chrome://extensions</code>.
                </li>
                <li>Activá “Modo desarrollador”.</li>
                <li>
                  Elegí “Cargar extensión sin empaquetar” y seleccioná la
                  carpeta.
                </li>
              </ol>
            </details>
          </div>
          <label className="wa-file">
            <input
              type="file"
              accept=".zip,.txt,text/plain,application/zip"
              onChange={(event) => importFile(event.target.files?.[0])}
            />
            <Upload />
            <span>
              <strong>Importar ZIP o TXT</strong>
              <small>Exportación original de WhatsApp</small>
            </span>
          </label>
          <div className="wa-or">
            <span>o pegá el contenido</span>
          </div>
          <textarea
            className="wa-source"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={
              "13/7/2026, 10:35 - Nombre: Mensaje…\n13/7/2026, 10:36 - Otro nombre: Respuesta…"
            }
          />
          <button
            className="primary-button wa-simulate"
            onClick={() => simulate()}
            disabled={!raw.trim()}
          >
            <MessageCircle size={17} /> Simular conversación
          </button>
          {error && <div className="login-error">{error}</div>}
          {messages.length > 0 && (
            <div className="wa-controls">
              <label>
                Tus mensajes
                <select
                  value={self}
                  onChange={(event) => setSelf(event.target.value)}
                  onBlur={() =>
                    persistChat(
                      chatId,
                      contactName,
                      self,
                      raw,
                      messages,
                      audioMatches,
                    )
                  }
                >
                  {senders.map((sender) => (
                    <option key={sender}>{sender}</option>
                  ))}
                </select>
              </label>
              <label>
                Nombre visible del contacto
                <input
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  onBlur={() =>
                    persistChat(
                      chatId,
                      contactName,
                      self,
                      raw,
                      messages,
                      audioMatches,
                    )
                  }
                />
              </label>
              <div className="wa-result">
                <span>
                  <strong>
                    {messages.filter((item) => !item.system).length}
                  </strong>{" "}
                  mensajes
                </span>
                <span>
                  <strong>
                    {
                      messages.filter((item) => /omitid/i.test(item.text))
                        .length
                    }
                  </strong>{" "}
                  multimedia omitida
                </span>
              </div>
              <div className="wa-audio-scan">
                <div>
                  <FileArchive />
                  <span>
                    <strong>Completar audios automáticamente</strong>
                    <small>
                      Elegí una sola vez la carpeta que contiene los audios de
                      WhatsApp.
                    </small>
                  </span>
                </div>
                <label>
                  <input
                    type="file"
                    multiple
                    accept="audio/*,.opus,.ogg,.oga,.m4a,.aac,.mp3,.wav,.amr"
                    {...({
                      webkitdirectory: "",
                      directory: "",
                    } as React.InputHTMLAttributes<HTMLInputElement>)}
                    onChange={(event) => scanAudioFolder(event.target.files)}
                  />
                  <Search size={16} /> Buscar y asociar audios
                </label>
                {audioStatus && <p>{audioStatus}</p>}
              </div>
            </div>
          )}
          <div className="security-tip">
            <Info size={16} />
            <span>
              GORE solo recibe la carpeta que seleccionás. Cada audio preservado
              obtiene SHA-256 y una explicación de su asociación.
            </span>
          </div>
        </aside>
        <section className="wa-phone">
          <div className="wa-app">
            <header className="wa-header">
              <ChevronLeft />
              <div className="wa-avatar">
                {contactName.trim().slice(0, 1).toUpperCase() || "?"}
              </div>
              <div>
                <strong>{contactName || "Contacto"}</strong>
                <span>conversación preservada</span>
              </div>
              <Video />
              <Phone />
              <MoreHorizontal />
            </header>
            <div className="wa-chat">
              {messages.length === 0 ? (
                <div className="wa-chat-empty">
                  <MessageCircle />
                  <strong>La conversación aparecerá acá</strong>
                  <span>
                    Importá un archivo o elegí una conversación guardada.
                  </span>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={message.id}>
                    {(index === 0 ||
                      messages[index - 1].date !== message.date) && (
                      <div className="wa-date">{message.date}</div>
                    )}
                    {message.system ? (
                      <div className="wa-system">{message.text}</div>
                    ) : (
                      <WhatsAppBubble
                        message={message}
                        outgoing={message.sender === self}
                        audioMatch={audioMatches.find(
                          (match) => match.messageId === message.id,
                        )}
                        transcription={
                          audioMatches.find(
                            (match) => match.messageId === message.id,
                          )?.evidence
                            ? transcriptions[
                                audioMatches.find(
                                  (match) => match.messageId === message.id,
                                )!.evidence!.id
                              ]
                            : undefined
                        }
                        onTranscribe={showTranscription}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
            <footer className="wa-compose">
              <Smile />
              <div>Mensaje</div>
              <Paperclip />
              <span>
                <Phone />
              </span>
            </footer>
          </div>
        </section>
      </div>
      {audioMatches.length > 0 && (
        <section className="panel wa-association-summary">
          <div>
            <ShieldCheck />
            <span>
              <strong>Resumen de asociación de audios</strong>
              <small>
                Esta información se muestra fuera de la conversación para
                conservar una lectura limpia.
              </small>
            </span>
          </div>
          <div className="wa-association-stats">
            <span className="captured">
              <b>
                {
                  audioMatches.filter((item) => item.confidence === "captured")
                    .length
                }
              </b>{" "}
              Captura directa
            </span>
            <span className="high">
              <b>
                {
                  audioMatches.filter((item) => item.confidence === "high")
                    .length
                }
              </b>{" "}
              Coincidencia confirmada
            </span>
            <span className="probable">
              <b>
                {
                  audioMatches.filter((item) => item.confidence === "probable")
                    .length
                }
              </b>{" "}
              Coincidencia probable
            </span>
            <span className="low">
              <b>
                {
                  audioMatches.filter((item) => item.confidence === "low")
                    .length
                }
              </b>{" "}
              Por revisar
            </span>
          </div>
        </section>
      )}
    </>
  );
}

function WhatsAppBubble({
  message,
  outgoing,
  audioMatch,
  transcription,
  onTranscribe,
}: {
  message: ChatMessage;
  outgoing: boolean;
  audioMatch?: AudioMatch;
  transcription?: AudioTranscription;
  onTranscribe: (evidenceId: string, force?: boolean) => void;
}) {
  const [showText, setShowText] = useState(false);
  const isMedia =
    /omitid[oa]|multimedia|imagen|video|audio|documento/i.test(message.text) &&
    message.text.length < 140;
  const audioSource =
    audioMatch?.previewUrl ??
    (audioMatch?.evidence ? evidenceDownloadUrl(audioMatch.evidence.id) : "");
  const evidenceId = audioMatch?.evidence?.id;
  const hideOmittedLabel = Boolean(
    isMedia &&
    /(?:multimedia|archivo|audio).{0,30}omitid|nota de voz capturada/i.test(
      message.text,
    ),
  );
  function toggleText() {
    const next = !showText;
    setShowText(next);
    if (next && audioMatch?.evidence && !transcription)
      onTranscribe(audioMatch.evidence.id);
  }
  return (
    <div className={`wa-message-wrap ${outgoing ? "outgoing" : "incoming"}`}>
      <div className="wa-bubble">
        {!outgoing && <b>{message.sender}</b>}
        {audioSource ? (
          <div className="wa-audio-player">
            <audio controls preload="metadata" src={audioSource} />
            {evidenceId && (
              <button className="wa-textual-trigger" onClick={toggleText}>
                {showText ? "Ocultar textual" : "Ver textual"}
              </button>
            )}
            {showText && (
              <div className="wa-transcription">
                {!transcription || transcription.status === "processing" ? (
                  <span>Transcribiendo con mayor precisión…</span>
                ) : transcription.status === "failed" ? (
                  <>
                    <span>No pudimos transcribir este audio.</span>
                    {evidenceId && (
                      <button onClick={() => onTranscribe(evidenceId, true)}>
                        Reintentar
                      </button>
                    )}
                  </>
                ) : transcription.text ? (
                  <>
                    <strong>Transcripción auxiliar</strong>
                    <p>{transcription.text}</p>
                    <small>
                      El audio original prevalece ante cualquier diferencia.
                    </small>
                    {transcription.engine !== "faster-whisper-small" &&
                      evidenceId && (
                        <button onClick={() => onTranscribe(evidenceId, true)}>
                          Mejorar transcripción
                        </button>
                      )}
                  </>
                ) : (
                  <span>No se detectó voz comprensible.</span>
                )}
              </div>
            )}
          </div>
        ) : (
          isMedia && (
            <div className="wa-media-placeholder">
              <Image />
              <span>Archivo multimedia pendiente</span>
            </div>
          )
        )}
        {!hideOmittedLabel && <p>{message.text}</p>}
        <small>
          {message.time}
          {outgoing && <CheckCheck />}
        </small>
      </div>
    </div>
  );
}

function ReportsView({
  events,
  evidence,
}: {
  events: EventItem[];
  evidence: Evidence[];
}) {
  const [summary, setSummary] = useState<CaseSummary | null>(null);
  const [savedReports, setSavedReports] = useState<SavedAIReport[]>([]);
  const [advancedReports, setAdvancedReports] = useState<AdvancedAIReport[]>(
    [],
  );
  const [advancedType, setAdvancedType] = useState("communication_and_contact");
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  useEffect(() => {
    apiGet<{ analysis: CaseSummary | null }>("/api/ai/analyses/summary")
      .then((result) => setSummary(result.analysis))
      .catch(() => undefined);
    apiGet<SavedAIReport[]>("/api/ai/reports")
      .then(setSavedReports)
      .catch(() => undefined);
    apiGet<AdvancedAIReport[]>("/api/ai/reports/advanced")
      .then(setAdvancedReports)
      .catch(() => undefined);
  }, []);
  async function archiveReport(id: string) {
    await apiPost(`/api/ai/reports/${id}/archive`, {});
    setSavedReports((items) => items.filter((item) => item.id !== id));
    setAdvancedReports((items) => items.filter((item) => item.id !== id));
  }
  async function generateAdvancedReport() {
    setAdvancedLoading(true);
    setAdvancedError("");
    try {
      const report = await apiPost<AdvancedAIReport>(
        "/api/ai/reports/generate",
        {
          reportType: advancedType,
        },
      );
      setAdvancedReports((items) => [report, ...items]);
    } catch {
      setAdvancedError(
        "No se pudo preparar el informe. VerificÃ¡ la conexiÃ³n con GroqCloud y que el expediente tenga registros analizados.",
      );
    } finally {
      setAdvancedLoading(false);
    }
  }
  async function generateSummary() {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      setSummary(await apiPost<CaseSummary>("/api/ai/analyses/summary", {}));
    } catch {
      setSummaryError(
        "No se pudo generar el resumen. Verificá que haya evidencias indexadas y que GroqCloud esté conectado.",
      );
    } finally {
      setSummaryLoading(false);
    }
  }
  const groups = summary
    ? ([
        ["Hechos principales", summary.mainFacts],
        ["Personas mencionadas", summary.peopleInvolved],
        ["Evidencia disponible", summary.availableEvidence],
        ["Información faltante", summary.missingInformation],
        ["Preguntas pendientes", summary.questionsPending],
      ] as [string, string[]][])
    : [];
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">PRESENTACIÓN PROFESIONAL</span>
          <h1>Informes y exportaciones</h1>
          <p>
            Prepará una lectura clara del expediente sin alterar ni reemplazar
            los archivos originales.
          </p>
        </div>
      </section>
      <article className="panel case-summary-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow accent">AGENTE LOCAL CON FUENTES</span>
            <h2>Resumen estructurado del expediente</h2>
            <p>
              Organiza lo respaldado, lo faltante y las preguntas que requieren
              revisión.
            </p>
          </div>
          <button
            className="primary-button"
            onClick={generateSummary}
            disabled={summaryLoading}
          >
            <Sparkles size={16} />{" "}
            {summaryLoading
              ? "Analizando…"
              : summary
                ? "Actualizar resumen"
                : "Generar resumen"}
          </button>
        </div>
        {summaryError && <div className="login-error">{summaryError}</div>}
        {summary ? (
          <div className="case-summary-result">
            <div className="summary-meta">
              <span>
                <ShieldCheck /> Revisión humana obligatoria
              </span>
              <span>Confianza {(summary.confidence * 100).toFixed(0)}%</span>
              <span>{summary.model}</span>
            </div>
            <p className="summary-executive">{summary.executiveSummary}</p>
            <div className="summary-groups">
              {groups.map(([title, items]) => (
                <section key={title}>
                  <strong>{title}</strong>
                  {items.length ? (
                    <ul>
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Sin información respaldada.</p>
                  )}
                </section>
              ))}
            </div>
            <div className="assistant-citations">
              <strong>Fuentes utilizadas</strong>
              {summary.sources.map((source) => (
                <a
                  href={evidenceDownloadUrl(source.evidenceId)}
                  key={source.sourceId}
                >
                  <span>{source.sourceId}</span>
                  <div>
                    <strong>{source.evidenceName}</strong>
                    <p>{source.text}</p>
                    <small>SHA {source.textHash}</small>
                  </div>
                  <Download />
                </a>
              ))}
            </div>
            <small className="summary-date">
              Generado con asistencia de IA el{" "}
              {format(
                new Date(summary.generatedAt),
                "dd/MM/yyyy 'a las' HH:mm",
              )}
              . No reemplaza la revisión profesional.
            </small>
          </div>
        ) : (
          <div className="vault-empty">
            <Sparkles />
            <strong>Todavía no hay un resumen generado</strong>
            <p>
              El resultado quedará guardado y seguirá disponible después de
              reiniciar GORE.
            </p>
          </div>
        )}
      </article>
      <article className="panel advanced-reports-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow accent">
              INFORMES TEMÁTICOS CON FUENTES
            </span>
            <h2>Lectura asistida para revisión profesional</h2>
            <p>
              Reúne situaciones documentadas, sus límites y preguntas pendientes
              sin modificar los registros originales.
            </p>
          </div>
          <ShieldCheck />
        </div>
        <div className="advanced-report-controls">
          <label>
            Tema del informe
            <select
              value={advancedType}
              onChange={(event) => setAdvancedType(event.target.value)}
            >
              <option value="communication_and_contact">
                Comunicación y contacto con los hijos
              </option>
              <option value="impediments">
                Posibles impedimentos y restricciones
              </option>
              <option value="disqualifications">
                Expresiones hostiles y descalificaciones
              </option>
              <option value="full_chronology">Cronología integral</option>
            </select>
          </label>
          <button
            className="primary-button"
            disabled={advancedLoading}
            onClick={generateAdvancedReport}
          >
            <Sparkles size={16} />
            {advancedLoading ? "Preparando informe…" : "Generar informe"}
          </button>
        </div>
        <small className="advanced-report-notice">
          La IA no determina culpabilidad ni reemplaza el criterio de tu
          abogado. Cada resultado exige revisión humana.
        </small>
        {advancedError && <div className="login-error">{advancedError}</div>}
        {advancedReports.length ? (
          <div className="advanced-report-list">
            {advancedReports.map((report) => (
              <section key={report.id}>
                <header>
                  <div>
                    <strong>{report.title}</strong>
                    <small>
                      {format(new Date(report.generatedAt), "dd/MM/yyyy HH:mm")}{" "}
                      · {report.model} · Confianza{" "}
                      {(report.confidence * 100).toFixed(0)}%
                    </small>
                  </div>
                  <div>
                    <a href={apiFileUrl(`/api/ai/reports/${report.id}.pdf`)}>
                      <Download /> PDF
                    </a>
                    <button onClick={() => archiveReport(report.id)}>
                      <Archive /> Archivar
                    </button>
                  </div>
                </header>
                <p className="advanced-report-summary">
                  {report.executiveSummary}
                </p>
                <div className="advanced-situations">
                  {report.documentedSituations.map((situation, index) => (
                    <article key={`${report.id}-${index}`}>
                      <span>{situation.date || "Sin fecha confirmada"}</span>
                      <strong>{situation.category}</strong>
                      <p>{situation.description}</p>
                      <small>Fuentes: {situation.sourceIds.join(", ")}</small>
                      <small>Limitaciones: {situation.limitations}</small>
                    </article>
                  ))}
                </div>
                <div className="advanced-review-grid">
                  {(
                    [
                      [
                        "Temas recurrentes para revisar",
                        report.recurringThemes,
                      ],
                      ["Información faltante", report.missingInformation],
                      ["Preguntas pendientes", report.questionsForReview],
                    ] as [string, string[]][]
                  ).map(([title, items]) => (
                    <section key={title}>
                      <strong>{title}</strong>
                      {items.length ? (
                        <ul>
                          {items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Sin elementos respaldados.</p>
                      )}
                    </section>
                  ))}
                </div>
                <div className="chat-sources">
                  {report.sources.map((source) => (
                    <AISourceReference source={source} key={source.sourceId} />
                  ))}
                </div>
                <small className="report-disclaimer">{report.disclaimer}</small>
              </section>
            ))}
          </div>
        ) : (
          <div className="vault-empty compact-empty">
            <Scale />
            <strong>Todavía no hay informes temáticos</strong>
            <p>
              Elegí un tema para crear una versión persistente y descargable.
            </p>
          </div>
        )}
      </article>
      <article className="panel saved-ai-reports">
        <div className="panel-head">
          <div>
            <span className="eyebrow accent">DESDE EL CHAT DEL EXPEDIENTE</span>
            <h2>Informes internos guardados</h2>
            <p>
              Respuestas seleccionadas por vos, con sus fuentes y procedencia.
            </p>
          </div>
          <FileText />
        </div>
        {savedReports.length ? (
          <div className="saved-ai-report-list">
            {savedReports.map((report) => (
              <section key={report.id}>
                <header>
                  <div>
                    <strong>{report.title}</strong>
                    <small>
                      {format(new Date(report.generatedAt), "dd/MM/yyyy HH:mm")}{" "}
                      · {report.model}
                    </small>
                  </div>
                  <button onClick={() => archiveReport(report.id)}>
                    <Archive /> Archivar
                  </button>
                </header>
                <p>{report.body}</p>
                <div className="chat-sources">
                  {report.sources.map((source) => (
                    <AISourceReference source={source} key={source.sourceId} />
                  ))}
                </div>
                <small className="report-disclaimer">{report.disclaimer}</small>
              </section>
            ))}
          </div>
        ) : (
          <div className="vault-empty">
            <FileText />
            <strong>Todavía no guardaste respuestas del chat</strong>
            <p>
              Usá “Guardar como informe interno” debajo de una respuesta útil.
            </p>
          </div>
        )}
      </article>
      <div className="report-grid">
        <article className="panel report-card">
          <div className="report-icon">
            <FileText />
          </div>
          <span className="eyebrow">INFORME DE LECTURA</span>
          <h2>Informe cronológico PDF</h2>
          <p>
            Datos del caso, línea de tiempo, comparación parental e índice de
            evidencias.
          </p>
          <div className="report-stats">
            <span>
              <strong>{events.length}</strong> acontecimientos
            </span>
            <span>
              <strong>{evidence.length}</strong> evidencias
            </span>
          </div>
          <a
            className="primary-button report-download"
            href={apiFileUrl("/api/exports/report.pdf")}
          >
            <Download size={18} /> Descargar informe PDF
          </a>
        </article>
        <article className="panel report-card dark">
          <div className="report-icon">
            <Archive />
          </div>
          <span className="eyebrow">PAQUETE VERIFICABLE</span>
          <h2>Originales y manifiesto ZIP</h2>
          <p>
            Archivos originales, inventario, tabla de hashes y datos de
            exportación.
          </p>
          <div className="report-stats">
            <span>
              <ShieldCheck /> Verificación previa de originales
            </span>
          </div>
          <a
            className="report-download"
            href={apiFileUrl("/api/exports/package.zip")}
          >
            <Download size={18} /> Descargar paquete ZIP
          </a>
        </article>
      </div>
      <div className="export-notice">
        <Info size={17} />
        <div>
          <strong>Exportación objetiva</strong>
          <span>
            Las observaciones privadas quedan excluidas. Cada descarga se
            registra en la auditoría del expediente.
          </span>
        </div>
      </div>
    </>
  );
}

const auditLabels: Record<string, string> = {
  LOGIN_SUCCESS: "Inicio de sesión correcto",
  LOGIN_FAILED: "Intento de acceso rechazado",
  EVENT_CREATED: "Acontecimiento registrado",
  EVENT_UPDATED: "Acontecimiento corregido con versión preservada",
  EVIDENCE_INCORPORATED: "Evidencia incorporada",
  EVIDENCE_DOWNLOADED: "Original descargado y verificado",
  INTEGRITY_FAILURE: "Fallo de integridad detectado",
  PASSWORD_CHANGED: "Contraseña modificada",
  CASE_CONFIG_UPDATED: "Datos del expediente actualizados",
  REPORT_PDF_EXPORTED: "Informe cronológico PDF exportado",
  ORIGINALS_PACKAGE_EXPORTED: "Paquete verificable de originales exportado",
  WHATSAPP_AUDIO_CAPTURED:
    "Audio capturado directamente desde una burbuja de WhatsApp",
  WHATSAPP_PACKAGE_IMPORTED:
    "Paquete de captura de WhatsApp verificado e incorporado",
  WHATSAPP_CHAT_SAVED: "Conversación de WhatsApp guardada",
  WHATSAPP_CHAT_REMOVED: "Conversación quitada del simulador",
  AUDIO_TRANSCRIBED: "Audio transcrito localmente",
  AUDIO_TRANSCRIPTION_UPDATED: "Texto auxiliar de audio actualizado",
  AUDIO_TRANSCRIPTION_FAILED: "Falló una transcripción de audio",
};

function AuditView() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiGet<AuditItem[]>("/api/audit")
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">TRAZABILIDAD PROTEGIDA</span>
          <h1>Historial de auditoría</h1>
          <p>
            Cada acción importante se encadena criptográficamente con la
            anterior para facilitar la detección de alteraciones.
          </p>
        </div>
        <div className="integrity-pill online">
          <ShieldCheck size={20} />
          <div>
            <strong>Cadena activa</strong>
            <span>{items.length} acciones visibles</span>
          </div>
        </div>
      </section>
      <article className="panel audit-panel">
        <div className="panel-head">
          <div>
            <h2>Actividad del expediente</h2>
            <p>Accesos, cambios e interacción con originales</p>
          </div>
          <span className="safe-badge">
            <ShieldCheck size={16} /> Registro inalterable
          </span>
        </div>
        {loading ? (
          <div className="empty-inline">Cargando auditoría…</div>
        ) : items.length === 0 ? (
          <div className="vault-empty">
            <ShieldCheck />
            <strong>Sin actividad registrada</strong>
          </div>
        ) : (
          <div className="audit-list">
            {items.map((item) => (
              <div className="audit-row" key={item.id}>
                <div className="audit-symbol">
                  <Check />
                </div>
                <div>
                  <strong>{auditLabels[item.action] ?? item.action}</strong>
                  <span>
                    {format(
                      new Date(item.occurred_at),
                      "dd/MM/yyyy 'a las' HH:mm:ss",
                    )}
                  </span>
                  <small>
                    {item.entity_type} · {item.entity_id}
                  </small>
                </div>
                <code title={item.entry_hash}>
                  {item.entry_hash.slice(0, 14)}…
                </code>
              </div>
            ))}
          </div>
        )}
      </article>
    </>
  );
}

function AIHistoryView() {
  const [items, setItems] = useState<AIHistoryItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const labels: Record<string, string> = {
    case_summary: "Resumen del expediente",
    contradictions: "Posibles contradicciones",
    evidence_organization: "Organización de evidencias",
    draft: "Borrador asistido",
    chat_report: "Informe interno desde el chat",
  };
  async function refresh() {
    setLoading(true);
    try {
      setItems(await apiGet<AIHistoryItem[]>("/api/ai/history"));
      setError("");
    } catch {
      setError("No se pudo recuperar el historial de análisis.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const visible =
    filter === "all" ? items : items.filter((item) => item.type === filter);
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">
            MEMORIA TRAZABLE DEL EXPEDIENTE
          </span>
          <h1>Historial de análisis</h1>
          <p>
            Consultá resultados guardados sin consumir nuevas solicitudes ni
            modificar el expediente.
          </p>
        </div>
        <button className="primary-button" onClick={refresh}>
          <Search size={16} /> Actualizar
        </button>
      </section>
      <div className="ai-history-filters">
        <button
          className={filter === "all" ? "active" : ""}
          onClick={() => setFilter("all")}
        >
          Todos <b>{items.length}</b>
        </button>
        {Object.entries(labels).map(([type, label]) => (
          <button
            className={filter === type ? "active" : ""}
            onClick={() => setFilter(type)}
            key={type}
          >
            {label} <b>{items.filter((item) => item.type === type).length}</b>
          </button>
        ))}
      </div>
      {error && <div className="login-error">{error}</div>}
      <div className="ai-history-list">
        {visible.map((item) => (
          <article className="panel ai-history-card" key={item.id}>
            <div className="ai-history-icon">
              <Archive />
            </div>
            <div className="ai-history-content">
              <div className="ai-history-head">
                <div>
                  <span>{labels[item.type] ?? item.type}</span>
                  <strong>
                    {format(
                      new Date(item.generatedAt),
                      "dd/MM/yyyy 'a las' HH:mm",
                    )}
                  </strong>
                </div>
                <b>Revisión humana requerida</b>
              </div>
              <p>{item.preview || "Resultado guardado sin vista previa."}</p>
              <div className="ai-history-meta">
                <span>
                  <Sparkles /> {item.model}
                </span>
                <span>
                  <FileCheck2 /> {item.sourceCount} fuente
                  {item.sourceCount === 1 ? "" : "s"}
                </span>
                <span>
                  <ShieldCheck /> Guardado localmente
                </span>
              </div>
              {item.sources.length > 0 && (
                <div className="chat-sources">
                  {item.sources.map((source) => (
                    <AISourceReference
                      source={source}
                      key={`${item.id}-${source.sourceId}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
        {!loading && visible.length === 0 && (
          <article className="panel vault-empty">
            <Archive />
            <strong>No hay análisis en esta categoría</strong>
            <p>
              Cuando generes un resultado con alguna herramienta IA aparecerá
              automáticamente aquí.
            </p>
          </article>
        )}
        {loading && (
          <article className="panel empty-inline">
            Recuperando análisis guardados…
          </article>
        )}
      </div>
    </>
  );
}

function AIOperationsView() {
  const [status, setStatus] = useState<AIOperationsStatus | null>(null);
  const [error, setError] = useState("");
  const refresh = () =>
    apiGet<AIOperationsStatus>("/api/ai/operations/status")
      .then((result) => {
        setStatus(result);
        setError("");
      })
      .catch(() =>
        setError("No pudimos consultar el estado de las herramientas IA."),
      );
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);
  const active =
    (status?.processingJobs.pending ?? 0) +
    (status?.processingJobs.processing ?? 0) +
    (status?.chatJobs.pending ?? 0) +
    (status?.chatJobs.processing ?? 0);
  const failures =
    (status?.processingJobs.failed ?? 0) +
    (status?.chatJobs.failed ?? 0) +
    (status?.evidence.failed ?? 0);
  const duration = status?.averageChatSeconds
    ? status.averageChatSeconds >= 60
      ? `${Math.round(status.averageChatSeconds / 60)} min`
      : `${Math.round(status.averageChatSeconds)} s`
    : "Sin datos";
  const statusLabel: Record<string, string> = {
    pending: "En espera",
    processing: "Trabajando",
    completed: "Completado",
    failed: "Falló",
    cancelled: "Cancelado",
  };
  return (
    <>
      <section className="page-heading compact with-action">
        <div>
          <span className="eyebrow accent">CONTROL DE SERVICIOS Y TAREAS</span>
          <h1>Estado de la IA</h1>
          <p>
            Comprobá qué está haciendo GroqCloud, cuántas tareas quedan
            pendientes y si algún archivo necesita atención.
          </p>
        </div>
        <button className="primary-button" onClick={refresh}>
          <Search size={16} /> Actualizar
        </button>
      </section>
      {error && <div className="login-error">{error}</div>}
      <section className="summary-grid ai-operations-summary">
        <article className="summary-card">
          <div
            className={`summary-icon ${status?.providerAvailable ? "green" : "amber"}`}
          >
            <Sparkles />
          </div>
          <div>
            <span>GroqCloud</span>
            <strong>
              {status?.providerAvailable ? "Conectado" : "Sin conexión"}
            </strong>
            <small>{status?.activeModel ?? "Comprobando modelo…"}</small>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon blue">
            <Clock3 />
          </div>
          <div>
            <span>Tareas activas</span>
            <strong>{active}</strong>
            <small>en espera o trabajando ahora</small>
          </div>
        </article>
        <article className="summary-card">
          <div className={`summary-icon ${failures ? "amber" : "green"}`}>
            <ShieldCheck />
          </div>
          <div>
            <span>Requieren atención</span>
            <strong>{failures}</strong>
            <small>errores acumulados del expediente</small>
          </div>
        </article>
      </section>
      <div className="ai-operations-grid">
        <article className="panel ai-operations-card">
          <div className="panel-head">
            <div>
              <h2>Actividad acumulada</h2>
              <p>Metadatos técnicos; no contiene mensajes ni documentos</p>
            </div>
            <ShieldCheck />
          </div>
          <div className="ai-operation-metrics">
            <div>
              <span>Respuestas de chat</span>
              <strong>{status?.chatJobs.completed ?? 0}</strong>
            </div>
            <div>
              <span>Análisis guardados</span>
              <strong>{status?.completedAnalyses ?? 0}</strong>
            </div>
            <div>
              <span>Procesamientos completados</span>
              <strong>{status?.processingJobs.completed ?? 0}</strong>
            </div>
            <div>
              <span>Tiempo medio del chat</span>
              <strong>{duration}</strong>
            </div>
            <div>
              <span>Evidencias del expediente</span>
              <strong>{status?.evidence.total ?? 0}</strong>
            </div>
            <div>
              <span>Extrayendo contenido</span>
              <strong>{status?.evidence.extracting ?? 0}</strong>
            </div>
          </div>
        </article>
        <article className="panel ai-operations-card">
          <div className="panel-head">
            <div>
              <h2>Últimas respuestas de la IA</h2>
              <p>El estado se actualiza automáticamente cada 5 segundos</p>
            </div>
            <Clock3 />
          </div>
          <div className="ai-operations-list">
            {status?.latestChatJobs.map((job) => (
              <div key={job.id}>
                <span className={`ai-operation-state ${job.status}`}>
                  {statusLabel[job.status] ?? job.status}
                </span>
                <div>
                  <strong>{job.stage}</strong>
                  <small>
                    {job.model} ·{" "}
                    {format(new Date(job.updatedAt), "dd/MM HH:mm")}
                  </small>
                </div>
                <b>{job.progress}%</b>
              </div>
            ))}
            {status && status.latestChatJobs.length === 0 && (
              <div className="empty-inline">
                Todavía no hay respuestas registradas.
              </div>
            )}
          </div>
        </article>
      </div>
      <div className="contradiction-warning">
        <Info />
        <div>
          <strong>Los errores no eliminan ni modifican evidencias</strong>
          <span>
            Los originales permanecen preservados. Un fallo indica que la
            extracción, indexación o respuesta puede necesitar un reintento.
          </span>
        </div>
      </div>
    </>
  );
}

function GroqConnectCard() {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [message, setMessage] = useState("");
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    apiGet<AIStatus>("/api/ai/status")
      .then(setStatus)
      .catch(() => undefined);
  }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setConnecting(true);
    setMessage("Comprobando la clave con GroqCloud…");
    try {
      const response = await fetch("/api/ai/groq/connect", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail =
          typeof result?.detail === "string"
            ? result.detail
            : "La clave no pudo verificarse.";
        throw new Error(detail);
      }
      setStatus(result as AIStatus);
      setApiKey("");
      setMessage("GroqCloud quedó conectado correctamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "La clave no pudo verificarse. Volvé a copiarla desde GroqCloud.",
      );
    } finally {
      setConnecting(false);
    }
  }
  return (
    <section className="panel settings-card groq-connect-card">
      <div className="panel-head">
        <div>
          <h2>Conectar IA rápida</h2>
          <p>
            GroqCloud procesa las consultas sin utilizar la memoria ni la placa
            de video de esta computadora.
          </p>
        </div>
        <Sparkles />
      </div>
      <form onSubmit={connect}>
        <label>
          Clave privada de GroqCloud
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Pegá aquí la clave que empieza con gsk_"
          />
        </label>
        <button
          className="primary-button"
          disabled={connecting || !apiKey.trim()}
        >
          {connecting
            ? "Comprobando…"
            : status?.configured
              ? "Reemplazar clave"
              : "Conectar GroqCloud"}
        </button>
      </form>
      <div className={`ai-health ${status?.available ? "online" : "offline"}`}>
        <span />
        <div>
          <strong>
            {status?.available
              ? "GroqCloud conectado"
              : "Todavía no está conectado"}
          </strong>
          <small>
            {message ||
              (status?.configured
                ? "La clave está guardada y protegida por Windows."
                : "Pegá la clave una sola vez. GORE no volverá a mostrarla.")}
          </small>
        </div>
      </div>
    </section>
  );
}

function AISettingsCard() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [message, setMessage] = useState("Comprobando GroqCloud…");
  const labels: Record<string, { name: string; description: string }> = {
    fast: { name: "Rápido", description: "Clasificación y tareas sencillas" },
    balanced: {
      name: "Equilibrado",
      description: "Recomendado para el uso habitual",
    },
    quality: {
      name: "Mayor calidad",
      description: "Análisis complejos con mayor espera",
    },
  };
  async function refresh() {
    try {
      const result = await apiGet<AIStatus>("/api/ai/status");
      setStatus(result);
      setMessage(
        result.available
          ? `${result.version} disponible`
          : "GroqCloud no está conectado.",
      );
    } catch {
      setMessage("No pudimos consultar el estado de GroqCloud.");
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function select(profile: string) {
    setMessage("Cambiando el modelo activo…");
    try {
      const result = await apiPut<AIStatus>("/api/ai/settings", {
        activeProfile: profile,
      });
      setStatus(result);
      setMessage(`Perfil ${labels[profile]?.name.toLowerCase()} activado.`);
    } catch {
      setMessage("No se pudo activar ese perfil. Verificá la conexión con GroqCloud.");
    }
  }
  return (
    <section className="panel settings-card ai-settings-card">
      <div className="panel-head">
        <div>
          <h2>Perfiles de inteligencia artificial</h2>
          <p>
            Elegí el nivel de análisis según la tarea. GORE envía únicamente el
            contexto necesario al proveedor configurado.
          </p>
        </div>
        <Sparkles />
      </div>
      <div className={`ai-health ${status?.available ? "online" : "offline"}`}>
        <span />
        <div>
          <strong>
            {status?.available ? "GroqCloud conectado" : "GroqCloud no disponible"}
          </strong>
          <small>{message}</small>
        </div>
        <button type="button" onClick={refresh}>
          Volver a comprobar
        </button>
      </div>
      <div className="ai-profile-grid">
        {status?.profiles.map((profile) => {
          const label = labels[profile.id];
          const active = profile.id === status.activeProfile;
          return (
            <button
              type="button"
              key={profile.id}
              className={active ? "active" : ""}
              disabled={!profile.installed || !status.available}
              onClick={() => select(profile.id)}
            >
              <span>
                {active ? <Check size={17} /> : <Sparkles size={17} />}
              </span>
              <strong>{label?.name ?? profile.id}</strong>
              <small>{label?.description}</small>
              <code>{profile.model}</code>
              <b>
                {profile.installed
                  ? active
                    ? "Activo"
                    : "Instalado"
                  : "No instalado"}
              </b>
            </button>
          );
        })}
      </div>
      <div className="ai-embedding-status">
        <ShieldCheck size={16} />
        <span>
          <strong>Búsqueda documental</strong>
          <small>
            {status?.embeddingModel ?? "Comprobando modelo…"} ·{" "}
            {status?.embeddingInstalled ? "instalado" : "pendiente"}
          </small>
        </span>
      </div>
    </section>
  );
}

function SettingsView({
  config,
  onSaved,
  onLogout,
}: {
  config: CaseConfig;
  onSaved: (config: CaseConfig) => void;
  onLogout: () => void;
}) {
  const [form, setForm] = useState(config);
  const [caseMessage, setCaseMessage] = useState("");
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    repeatPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const refreshSecurity = () =>
    apiGet<SecurityStatus>("/api/security/status")
      .then(setSecurity)
      .catch(() => setBackupMessage("No pudimos comprobar la seguridad del almacenamiento."));
  useEffect(() => {
    apiGet<SecurityStatus>("/api/security/status")
      .then(setSecurity)
      .catch(() => setBackupMessage("No pudimos comprobar la seguridad del almacenamiento."));
  }, []);
  const update = (key: keyof CaseConfig, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  async function saveCase(event: React.FormEvent) {
    event.preventDefault();
    setCaseMessage("Guardando…");
    try {
      const saved = await apiPut<CaseConfig>("/api/case", form);
      onSaved(saved);
      setCaseMessage("Datos guardados correctamente.");
    } catch {
      setCaseMessage("No se pudieron guardar los cambios.");
    }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordMessage("");
    if (passwords.newPassword !== passwords.repeatPassword) {
      setPasswordMessage("Las contraseñas nuevas no coinciden.");
      return;
    }
    try {
      await apiPost("/api/auth/change-password", {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({
        currentPassword: "",
        newPassword: "",
        repeatPassword: "",
      });
      setPasswordMessage("Contraseña cambiada correctamente.");
    } catch {
      setPasswordMessage(
        "No se pudo cambiar. Revisá la contraseña actual y usá al menos 6 caracteres.",
      );
    }
  }
  async function createBackup() {
    setBackupLoading(true);
    setBackupMessage("Creando y verificando la copia…");
    try {
      await apiPost("/api/security/backup", {});
      await refreshSecurity();
      setBackupMessage("Copia verificada correctamente.");
    } catch {
      setBackupMessage("No se pudo crear la copia de seguridad.");
    } finally {
      setBackupLoading(false);
    }
  }
  return (
    <>
      <section className="page-heading compact">
        <div>
          <span className="eyebrow accent">ADMINISTRACIÓN PRIVADA</span>
          <h1>Configuración</h1>
          <p>
            Actualizá los datos generales del expediente y la seguridad de
            acceso.
          </p>
        </div>
      </section>
      <div className="settings-grid">
        <form className="panel settings-card" onSubmit={saveCase}>
          <div className="panel-head">
            <div>
              <h2>Datos del expediente</h2>
              <p>Estos datos identifican el espacio de trabajo</p>
            </div>
            <FileText />
          </div>
          <div className="settings-fields">
            <label>
              Código del expediente
              <input
                value={form.caseCode}
                onChange={(e) => update("caseCode", e.target.value)}
                required
              />
            </label>
            <label>
              Nombre interno
              <input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                required
              />
            </label>
            <label>
              Estado
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option>En documentación</option>
                <option>Pendiente de revisión</option>
                <option>En mediación</option>
                <option>En proceso judicial</option>
                <option>Archivado</option>
              </select>
            </label>
            <label>
              Hito principal
              <input
                type="date"
                value={form.mainMilestone}
                onChange={(e) => update("mainMilestone", e.target.value)}
              />
            </label>
            <label className="full">
              Modalidad anterior
              <textarea
                value={form.previousModality}
                onChange={(e) => update("previousModality", e.target.value)}
                placeholder="Descripción neutral de la organización anterior"
              />
            </label>
          </div>
          <div className="settings-actions">
            <span>{caseMessage}</span>
            <button className="primary-button">Guardar datos</button>
          </div>
        </form>
        <form className="panel settings-card" onSubmit={changePassword}>
          <div className="panel-head">
            <div>
              <h2>Seguridad de acceso</h2>
              <p>Protegé el expediente con una contraseña privada</p>
            </div>
            <ShieldCheck />
          </div>
          <div className="settings-fields single">
            <label>
              Contraseña actual
              <input
                type="password"
                value={passwords.currentPassword}
                onChange={(e) =>
                  setPasswords((p) => ({
                    ...p,
                    currentPassword: e.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Nueva contraseña
              <input
                type="password"
                minLength={6}
                value={passwords.newPassword}
                onChange={(e) =>
                  setPasswords((p) => ({ ...p, newPassword: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Repetir nueva contraseña
              <input
                type="password"
                minLength={6}
                value={passwords.repeatPassword}
                onChange={(e) =>
                  setPasswords((p) => ({
                    ...p,
                    repeatPassword: e.target.value,
                  }))
                }
                required
              />
            </label>
          </div>
          <div className="security-tip">
            <ShieldCheck size={17} />
            <span>
              Usá una frase larga que no utilices en otros servicios. Al
              cambiarla se cerrarán las demás sesiones abiertas.
            </span>
          </div>
          <div className="settings-actions">
            <span>{passwordMessage}</span>
            <button className="primary-button">Cambiar contraseña</button>
          </div>
          <button className="logout-wide" type="button" onClick={onLogout}>
            <LogOut size={16} /> Cerrar esta sesión
          </button>
        </form>
        <article className="panel settings-card security-storage-card">
          <div className="panel-head">
            <div>
              <h2>Integridad y copias de seguridad</h2>
              <p>Control verificable del almacenamiento interno de GORE</p>
            </div>
            <FolderLock />
          </div>
          <small className="security-backup-detail">GORE v{security?.version ?? "1.0.0"} · versión estable de producción</small>
          <div className="security-storage-grid">
            <div>
              <span>Base de datos</span>
              <strong>{security?.databaseIntegrity === "ok" ? "Íntegra" : "Requiere revisión"}</strong>
            </div>
            <div>
              <span>Copias automáticas</span>
              <strong>{security?.automaticBackups ?? "—"}</strong>
            </div>
            <div>
              <span>Evidencias verificadas</span>
              <strong>{security ? `${security.evidence.verified} de ${security.evidence.total}` : "—"}</strong>
            </div>
            <div>
              <span>Clave de GroqCloud</span>
              <strong>{security?.groqKeyProtected ? "Protegida por Windows" : "Sin configurar"}</strong>
            </div>
          </div>
          {security?.latestBackup && (
            <small className="security-backup-detail">
              Última copia: {format(new Date(security.latestBackup.updatedAt), "dd/MM/yyyy HH:mm")} · {Math.max(1, Math.round(security.latestBackup.size / 1024))} KB
            </small>
          )}
          <div className="settings-actions">
            <span>{backupMessage || "GORE crea una copia diaria al iniciar el servidor y conserva las 14 más recientes."}</span>
            <button className="primary-button" type="button" disabled={backupLoading} onClick={createBackup}>
              <Archive size={16} /> {backupLoading ? "Creando…" : "Crear copia ahora"}
            </button>
          </div>
        </article>
      </div>
    </>
  );
}

function EventModal({
  initial,
  initialDate,
  close,
  save,
}: {
  initial: EventItem | null;
  initialDate: string | null;
  close: () => void;
  save: (e: EventItem) => Promise<void>;
}) {
  const [form, setForm] = useState(
    initial
      ? {
          date: initial.date,
          time: initial.time,
          category: initial.category,
          title: initial.title,
          description: initial.description,
          privateNotes: initial.privateNotes ?? "",
          expected: initial.expected ?? "",
          actual: initial.actual ?? "",
          status: initial.status,
        }
      : {
          date: initialDate ?? format(new Date(), "yyyy-MM-dd"),
          time: format(new Date(), "HH:mm"),
          category: categories[0],
          title: "",
          description: "",
          privateNotes: "",
          expected: "",
          actual: "",
          status: "Borrador" as const,
        },
  );
  const set = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    await save({
      ...form,
      id:
        initial?.id ??
        `EVT-${form.date.replaceAll("-", "")}-${String(Date.now()).slice(-3)}`,
      evidenceCount: initial?.evidenceCount ?? 0,
    });
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <form className="modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <span className="eyebrow accent">NUEVO REGISTRO</span>
            <h2>Registrar acontecimiento</h2>
            <p>Describí lo ocurrido de forma concreta y neutral.</p>
          </div>
          <button type="button" onClick={close}>
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Fecha del hecho
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              required
            />
          </label>
          <label>
            Hora
            <input
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
              required
            />
          </label>
          <label className="full">
            Categoría
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="full">
            Título
            <input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ej.: Solicitud de comunicación telefónica"
              required
            />
          </label>
          <label className="full">
            Descripción objetiva
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Indicá qué ocurrió, cuándo, por qué medio y quiénes participaron. Evitá conclusiones jurídicas."
              required
            />
          </label>
          <div className="neutral-note full">
            <Info size={17} />
            <span>
              <strong>Hechos, no conclusiones.</strong> La calificación jurídica
              puede ser agregada posteriormente por un profesional.
            </span>
          </div>
          <label>
            Modalidad esperada
            <input
              value={form.expected}
              onChange={(e) => set("expected", e.target.value)}
              placeholder="Qué estaba previsto"
            />
          </label>
          <label>
            Modalidad efectiva
            <input
              value={form.actual}
              onChange={(e) => set("actual", e.target.value)}
              placeholder="Qué ocurrió realmente"
            />
          </label>
          <label className="full private-label">
            Observaciones privadas <span>No se incluyen en informes</span>
            <textarea
              value={form.privateNotes}
              onChange={(e) => set("privateNotes", e.target.value)}
              placeholder="Tu interpretación personal, contexto o recordatorios…"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button className="primary-button" type="submit">
            <Check size={18} /> Guardar acontecimiento
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
