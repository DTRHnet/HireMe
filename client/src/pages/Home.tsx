import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Download,
  FileText,
  History,
  LockKeyhole,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  makeAnalysis,
  extractText,
  type AnalysisResult,
  type ExtractedDocument,
  type EvidenceGrade,
  type ProviderId,
  safeFileName,
} from "@shared/hireme";
import {
  buildAssessmentPrompt,
  buildStudyGuidePrompt,
} from "@shared/promptTemplates";
import { trpc } from "@/lib/trpc";
import { exportDocx, exportPdf, buildZipBundle } from "@/lib/exporters";
import { Streamdown } from "streamdown";

type View = "analyze" | "history" | "settings" | "about";
type InputState = {
  text: string;
  fileName: string | null;
  warnings: string[];
  provenance: string;
};
const emptyInput: InputState = {
  text: "",
  fileName: null,
  warnings: [],
  provenance: "Awaiting source",
};
const initialJob = `Senior Operations Manager\nCompany: Northstar Services\nLocation: Toronto\n\nRequired:\n- Lead a cross-functional operations team and improve service quality\n- Build reliable workflows using Excel and CRM systems\n- Partner with stakeholders and manage competing priorities\nPreferred:\n- Experience with regulated environments\n- Bachelor degree or equivalent experience`;
const initialResume = `Jordan Lee\njordan@example.com\n\nOperations leader with experience improving workflows and coaching teams.\n\nOperations Manager | 2021 - Present\n- Led a customer operations team and redesigned service workflows.\n- Used Excel reporting and CRM tools to track quality improvement.\n- Partnered with internal stakeholders on process changes.\n\nEducation\nBachelor of Arts`;

function download(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function gradeClass(grade: EvidenceGrade) {
  return grade === "Explicit"
    ? "grade-explicit"
    : grade === "Strongly implied"
      ? "grade-strong"
      : grade === "Weakly implied"
        ? "grade-weak"
        : "grade-absent";
}
function providerIdForLabel(label: string): ProviderId {
  if (label === "Google Gemini") return "gemini";
  if (label === "OpenAI-compatible") return "compatible";
  return label.toLowerCase().replace(" ", "") as ProviderId;
}

function SourceCard({
  kind,
  state,
  setState,
  onFile,
}: {
  kind: "job" | "resume";
  state: InputState;
  setState: (next: InputState) => void;
  onFile?: (file: File, kind: "job" | "resume") => Promise<ExtractedDocument>;
}) {
  const title =
    kind === "job" ? "01 / JOB DESCRIPTION" : "02 / CANDIDATE RESUME";
  async function filePicked(file?: File) {
    if (!file) return;
    try {
      const doc = onFile
        ? await onFile(file, kind)
        : await extractText(kind, { file });
      setState({
        text: doc.text,
        fileName: doc.fileName,
        warnings: doc.warnings,
        provenance: doc.provenance.toUpperCase(),
      });
    } catch (error) {
      setState({
        text: "",
        fileName: file.name,
        warnings: [
          error instanceof Error
            ? error.message
            : "The file could not be extracted. Try again or paste the source text.",
        ],
        provenance: "ERROR",
      });
    }
  }
  return (
    <section
      className="source-card"
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        void filePicked(e.dataTransfer.files[0]);
      }}
    >
      <div className="source-card-head">
        <div>
          <span className="eyebrow">{title}</span>
          <h2>{kind === "job" ? "Job description" : "Resume"}</h2>
        </div>
        <div className="source-mark">[{kind === "job" ? "A" : "B"}]</div>
      </div>
      <Textarea
        aria-label={`${kind} text`}
        value={state.text}
        onChange={e =>
          setState({
            ...state,
            text: e.target.value,
            fileName: null,
            provenance: "PASTED",
            warnings: [],
          })
        }
        placeholder={
          kind === "job"
            ? "Paste the full posting here…"
            : "Paste the candidate resume here…"
        }
        className="source-textarea"
      />
      <div className="dropzone">
        <Upload size={18} strokeWidth={2.5} />
        <span>Drop PDF, DOCX, or TXT</span>
        <label className="button-label">
          Browse
          <input
            type="file"
            accept=".pdf,.docx,.txt,text/plain"
            onChange={e => void filePicked(e.target.files?.[0])}
          />
        </label>
      </div>
      <div className="source-meta">
        <span className={state.text ? "status-ready" : "status-idle"}>
          {state.text ? <Check size={14} /> : <FileText size={14} />}{" "}
          {state.text
            ? `${state.text.length.toLocaleString()} chars`
            : "No text extracted"}
        </span>
        <span>{state.fileName ?? state.provenance}</span>
        {state.text && (
          <button
            className="icon-button"
            aria-label={`Clear ${kind}`}
            onClick={() => setState(emptyInput)}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {state.warnings.map(warning => (
        <div className="warning" role="alert" key={warning}>
          <AlertTriangle size={15} />
          <span>{warning}</span>
        </div>
      ))}
    </section>
  );
}

function Progress({
  running,
  complete,
}: {
  running: boolean;
  complete: boolean;
}) {
  const steps = [
    "Extract",
    "Normalize",
    "Evidence",
    "Score",
    "Draft",
    "Audit",
    "Ready",
  ];
  return (
    <div className="progress-strip" aria-label="Analysis progress">
      {steps.map((step, i) => (
        <div
          className={`progress-step ${complete || (running && i < 6) ? "done" : ""} ${running && i === 5 ? "active" : ""}`}
          key={step}
        >
          <span>
            {complete || (running && i < 6)
              ? "✓"
              : String(i + 1).padStart(2, "0")}
          </span>
          {step}
        </div>
      ))}
    </div>
  );
}

function Results({
  result,
  onReset,
}: {
  result: AnalysisResult;
  onReset: () => void;
}) {
  const [tab, setTab] = useState("Overview");
  const tabs = [
    "Overview",
    "Resume Fit Assessment",
    "Interview Study Guide",
    "Evidence Matrix",
    "Normalized Data",
    "Audit",
  ];
  const exportJson = JSON.stringify(result, null, 2);
  const assessmentName = safeFileName(
    result.resume.candidateName,
    result.job.title,
    "Resume_Fit_Assessment"
  );
  const guideName = safeFileName(
    result.resume.candidateName,
    result.job.title,
    "Interview_Study_Guide"
  );
  const exportsBlocked = result.audit.status === "blocked";
  return (
    <div className="results-shell">
      <div className="results-head">
        <div>
          <span className="eyebrow">ANALYSIS READY / {result.id}</span>
          <h1>
            Documented fit
            <br />
            <span>{result.score}</span>
            <small>/ 100</small>
          </h1>
        </div>
        <div className="result-actions">
          <Badge
            className={
              result.audit.status === "passed" ? "audit-pass" : "audit-blocked"
            }
          >
            {result.audit.status === "passed"
              ? "AUDIT PASSED"
              : "EXPORT BLOCKED"}
          </Badge>
          <Button variant="outline" onClick={onReset}>
            <RotateCcw size={16} /> New analysis
          </Button>
        </div>
      </div>
      <div className="provider-line">
        <ShieldCheck size={16} /> Generated with{" "}
        <strong>{result.provider}</strong> / {result.model}. Score means
        documented fit, not hiring probability.
      </div>
      <nav className="result-tabs" aria-label="Result sections">
        {tabs.map(t => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="result-body">
        {tab === "Overview" && (
          <div className="overview-grid">
            <article className="result-card score-card">
              <span className="eyebrow">TRANSPARENT HEURISTIC</span>
              <div className="score-big">
                {result.score}
                <span>/100</span>
              </div>
              <p>
                Every point maps to a weighted requirement and a visible
                evidence grade.
              </p>
              <div className="score-bar">
                <span style={{ width: `${result.score}%` }} />
              </div>
            </article>
            <article className="result-card">
              <span className="eyebrow">STRONGEST ALIGNMENTS</span>
              {result.matrix
                .filter(r => r.evidenceGrade === "Explicit")
                .slice(0, 4)
                .map(r => (
                  <div className="mini-row" key={r.id}>
                    <Check size={16} />
                    <span>{r.requirement}</span>
                  </div>
                ))}
              {!result.matrix.some(r => r.evidenceGrade === "Explicit") && (
                <p className="muted">No criterion reached Explicit yet.</p>
              )}
            </article>
            <article className="result-card gap-card">
              <span className="eyebrow">EVIDENCE GAPS</span>
              {result.matrix
                .filter(r => r.evidenceGrade === "Absent")
                .slice(0, 4)
                .map(r => (
                  <div className="mini-row" key={r.id}>
                    <AlertTriangle size={16} />
                    <span>{r.requirement}</span>
                  </div>
                ))}
            </article>
            <article className="result-card wide-card">
              <span className="eyebrow">METHOD NOTE</span>
              <p>
                HireMe compares the posting against what the supplied resume
                visibly establishes. It distinguishes direct evidence from
                transferability and missing documentation. The shared matrix is
                the source for both deliverables.
              </p>
            </article>
          </div>
        )}
        {tab === "Evidence Matrix" && (
          <div className="matrix-wrap">
            <div className="matrix-toolbar">
              <span>
                {result.matrix.length} criteria / maximum score{" "}
                {result.matrix.reduce((a, r) => a + r.maximumScore, 0)}
              </span>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    download(
                      "evidence-matrix.csv",
                      [
                        "Requirement,Category,Weight,Evidence,Grade,Transferability,Gap,Earned score,Interview implication",
                        ...result.matrix.map(r =>
                          [
                            r.requirement,
                            r.category,
                            r.maximumScore,
                            r.resumeEvidence.map(e => e.quote).join(" "),
                            r.evidenceGrade,
                            r.transferability,
                            r.gapOrAmbiguity ?? "",
                            `${r.earnedScore}/${r.maximumScore}`,
                            r.interviewImplication,
                          ]
                            .map(x => `"${String(x).replaceAll('"', '""')}"`)
                            .join(",")
                        ),
                      ].join("\n"),
                      "text/csv"
                    )
                  }
                >
                  <Download size={15} /> CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    download(
                      "evidence-matrix.json",
                      JSON.stringify(result.matrix, null, 2),
                      "application/json"
                    )
                  }
                >
                  <Download size={15} /> JSON
                </Button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Requirement</th>
                    <th>Category</th>
                    <th>Weight</th>
                    <th>Evidence</th>
                    <th>Grade</th>
                    <th>Transferability / gap</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matrix.map(r => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.requirement}</strong>
                        {r.mandatory && (
                          <span className="mandatory">MANDATORY</span>
                        )}
                      </td>
                      <td>{r.category}</td>
                      <td>{r.maximumScore}</td>
                      <td>
                        {r.resumeEvidence[0]?.quote ?? "No supporting quote"}
                      </td>
                      <td>
                        <span
                          className={`grade ${gradeClass(r.evidenceGrade)}`}
                        >
                          {r.evidenceGrade}
                        </span>
                      </td>
                      <td>
                        {r.transferability}
                        <br />
                        <span className="muted">{r.gapOrAmbiguity}</span>
                      </td>
                      <td>
                        <strong>
                          {r.earnedScore}/{r.maximumScore}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {(tab === "Resume Fit Assessment" ||
          tab === "Interview Study Guide") && (
          <article className="document-view">
            <div className="document-toolbar">
              <span className="eyebrow">
                {tab === "Resume Fit Assessment"
                  ? "FORMAL REPORT"
                  : "CANDIDATE WORKBOOK"}
              </span>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportsBlocked}
                  onClick={() =>
                    download(
                      `${tab === "Resume Fit Assessment" ? assessmentName : guideName}.md`,
                      tab === "Resume Fit Assessment"
                        ? result.assessment
                        : result.studyGuide,
                      "text/markdown"
                    )
                  }
                >
                  <Download size={15} /> Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportsBlocked}
                  onClick={() =>
                    download(
                      `${tab === "Resume Fit Assessment" ? assessmentName : guideName}.json`,
                      JSON.stringify(
                        {
                          content:
                            tab === "Resume Fit Assessment"
                              ? result.assessment
                              : result.studyGuide,
                        },
                        null,
                        2
                      ),
                      "application/json"
                    )
                  }
                >
                  <Download size={15} /> JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportsBlocked}
                  onClick={() =>
                    void exportPdf(
                      `${tab === "Resume Fit Assessment" ? assessmentName : guideName}.pdf`,
                      tab === "Resume Fit Assessment"
                        ? result.assessment
                        : result.studyGuide
                    )
                  }
                >
                  <Download size={15} /> PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportsBlocked}
                  onClick={() =>
                    void exportDocx(
                      `${tab === "Resume Fit Assessment" ? assessmentName : guideName}.docx`,
                      tab === "Resume Fit Assessment"
                        ? result.assessment
                        : result.studyGuide
                    )
                  }
                >
                  <Download size={15} /> DOCX
                </Button>
              </div>
            </div>
            <div className="rendered-markdown">
              <Streamdown>
                {tab === "Resume Fit Assessment"
                  ? result.assessment
                  : result.studyGuide}
              </Streamdown>
            </div>
          </article>
        )}
        {tab === "Normalized Data" && (
          <div className="json-view">
            <pre>
              {JSON.stringify(
                { job: result.job, resume: result.resume },
                null,
                2
              )}
            </pre>
            <Button
              onClick={() =>
                download(
                  "hireme-normalized-data.json",
                  JSON.stringify(
                    { job: result.job, resume: result.resume },
                    null,
                    2
                  ),
                  "application/json"
                )
              }
            >
              <Download size={16} /> Download normalized JSON
            </Button>
          </div>
        )}
        {tab === "Audit" && (
          <div className="audit-view">
            <article
              className={`result-card audit-panel ${result.audit.status}`}
            >
              <span className="eyebrow">CROSS-DOCUMENT CONSISTENCY AUDIT</span>
              <h2>
                {result.audit.status === "passed"
                  ? "Ready to export"
                  : "Export is blocked"}
              </h2>
              <p>
                {result.audit.status === "passed"
                  ? "The generated artifacts remain within the audited evidence boundary."
                  : "Resolve critical unsupported claims before export."}
              </p>
              {[...result.audit.critical, ...result.audit.warnings].map(x => (
                <div className="audit-item" key={x}>
                  <AlertTriangle size={15} />
                  {x}
                </div>
              ))}
            </article>
            <Button
              disabled={result.audit.status === "blocked"}
              onClick={() =>
                download(
                  "hireme-full-analysis.json",
                  exportJson,
                  "application/json"
                )
              }
            >
              <Download size={16} /> Download full analysis JSON
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

const defaultModels: Record<string, string> = {
  "Local deterministic": "Evidence-first baseline",
  OpenAI: "gpt-4o-mini",
  Anthropic: "claude-3-5-sonnet-20241022",
  "Google Gemini": "gemini-1.5-flash",
  OpenRouter: "meta-llama/llama-3.3-70b-instruct:free",
  Ollama: "llama3.2",
  "LM Studio": "local-model",
  "OpenAI-compatible": "gpt-3.5-turbo",
};

export default function Home() {
  const [view, setView] = useState<View>("analyze");
  const extractMutation = trpc.documents.extract.useMutation();
  const providerValidate = trpc.providers.validate.useMutation();
  const providerGenerate = trpc.providers.generate.useMutation();
  const [job, setJob] = useState<InputState>({
    ...emptyInput,
    text: initialJob,
    provenance: "PASTED",
  });
  const [resume, setResume] = useState<InputState>({
    ...emptyInput,
    text: initialResume,
    provenance: "PASTED",
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipDismissed, setZipDismissed] = useState(false);
  const [history, setHistory] = useState<AnalysisResult[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hireme-history") || "[]");
    } catch {
      return [];
    }
  });
  const [saveHistory, setSaveHistory] = useState(
    () => localStorage.getItem("hireme-save-history") === "true"
  );
  const [provider, setProvider] = useState("Local deterministic");
  const [model, setModel] = useState(
    () => localStorage.getItem("hireme-model") || "Evidence-first baseline"
  );
  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem("hireme-endpoint") || ""
  );
  const [apiKey, setApiKey] = useState("");
  const [remoteConsent, setRemoteConsent] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [omitTemperature, setOmitTemperature] = useState(false);
  const [useMaxCompletionTokens, setUseMaxCompletionTokens] = useState(false);
  const canAnalyze =
    job.text.trim().length > 20 &&
    resume.text.trim().length > 20 &&
    !job.warnings.some(x => x.includes("needs a server")) &&
    !resume.warnings.some(x => x.includes("needs a server")) &&
    (provider.toLowerCase().includes("local") || remoteConsent);
  const privacyLabel = provider.toLowerCase().includes("local")
    ? "Local processing selected — sources stay in this browser."
    : "Remote provider selected — sources will be sent only after you click Generate.";
  async function handleFile(file: File, kind: "job" | "resume") {
    if (file.name.toLowerCase().endsWith(".txt"))
      return extractText(kind, { file });
    const base64 = await fileToBase64(file);
    return extractMutation.mutateAsync({
      kind,
      fileName: file.name,
      mimeType: file.type || null,
      base64,
    });
  }
  async function run() {
    if (!canAnalyze) return;
    setRunning(true);
    setRunError(null);
    setZipUrl(null);
    setZipDismissed(false);
    try {
      const jd: ExtractedDocument = {
        kind: "job",
        fileName: job.fileName,
        mimeType: "text/plain",
        text: job.text.trim(),
        provenance:
          job.provenance.toLowerCase() as ExtractedDocument["provenance"],
        warnings: job.warnings,
        sourceSpans: [],
      };
      const rd: ExtractedDocument = {
        kind: "resume",
        fileName: resume.fileName,
        mimeType: "text/plain",
        text: resume.text.trim(),
        provenance:
          resume.provenance.toLowerCase() as ExtractedDocument["provenance"],
        warnings: resume.warnings,
        sourceSpans: [],
      };
      const next = makeAnalysis(
        jd,
        rd,
        provider,
        provider === "Local deterministic" ? "Evidence-first baseline" : model
      );
      if (!provider.toLowerCase().includes("local")) {
        const config = {
          provider: providerIdForLabel(provider),
          model: model || defaultModels[provider] || "gpt-4o-mini",
          endpoint: endpoint || undefined,
          apiKey: apiKey || undefined,
          temperature: 0.2,
          omitTemperature,
          useMaxCompletionTokens,
          maxTokens: 4000,
          streaming: false,
        };
        const assessPrompt = buildAssessmentPrompt(
          next.job,
          next.resume,
          next.matrix,
          next.score
        );
        const guidePrompt = buildStudyGuidePrompt(
          next.job,
          next.resume,
          next.matrix,
          next.score
        );
        const [assessmentReply, guideReply] = await Promise.all([
          providerGenerate.mutateAsync({
            ...config,
            system: assessPrompt.system,
            user: assessPrompt.user,
          }),
          providerGenerate.mutateAsync({
            ...config,
            system: guidePrompt.system,
            user: guidePrompt.user,
          }),
        ]);
        next.assessment = assessmentReply.text;
        next.studyGuide = guideReply.text;
      }
      setResult(next);
      setRunning(false);
      if (saveHistory) {
        const nextHistory = [next, ...history].slice(0, 10);
        setHistory(nextHistory);
        localStorage.setItem("hireme-history", JSON.stringify(nextHistory));
      }
      const aName = safeFileName(
        next.resume.candidateName,
        next.job.title,
        "Resume_Fit_Assessment"
      );
      const gName = safeFileName(
        next.resume.candidateName,
        next.job.title,
        "Interview_Study_Guide"
      );
      buildZipBundle(aName, next.assessment, gName, next.studyGuide)
        .then(blob => {
          const url = URL.createObjectURL(blob);
          setZipUrl(url);
        })
        .catch(() => {});
    } catch (error) {
      setRunning(false);
      const msg =
        error instanceof Error
          ? error.message
          : "Analysis failed. Retry after checking the provider configuration.";
      setRunError(msg);
    }
  }
  function reset() {
    setResult(null);
    setView("analyze");
    setRunError(null);
    setZipUrl(null);
    setZipDismissed(false);
  }
  const nav = useMemo(
    () => [
      { id: "analyze" as View, label: "Analyze", icon: Plus },
      { id: "history" as View, label: "History", icon: History },
      { id: "settings" as View, label: "Settings", icon: Settings2 },
      { id: "about" as View, label: "About", icon: FileText },
    ],
    []
  );
  const zipFileName = result
    ? `${safeFileName(result.resume.candidateName, result.job.title, "HireMe_Package")}.zip`
    : "HireMe_Package.zip";
  const ZipBanner =
    zipUrl && !zipDismissed ? (
      <div className="zip-banner" role="alert">
        <div className="zip-banner-inner">
          <Download size={20} />
          <div>
            <strong>Your PDF package is ready.</strong>
            <span>
              Both documents have been compiled into a single ZIP archive
              containing the Resume Fit Assessment and Interview Study Guide as
              PDFs.
            </span>
          </div>
          <a
            href={zipUrl}
            download={zipFileName}
            className="zip-download-btn"
            onClick={() => setZipDismissed(true)}
          >
            <Download size={15} /> Download ZIP
          </a>
          <button
            className="zip-dismiss"
            aria-label="Dismiss"
            onClick={() => setZipDismissed(true)}
          >
            <X size={15} />
          </button>
        </div>
      </div>
    ) : null;
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-bracket">[</span>
          <span>
            HIRE
            <br />
            ME
          </span>
          <span className="brand-bracket">]</span>
        </div>
        <div className="brand-caption">
          EVIDENCE-FIRST
          <br />
          CAREER WORKSPACE
        </div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              className={view === id ? "nav-active" : ""}
              onClick={() => {
                setView(id);
                if (id !== "analyze") setResult(null);
              }}
              key={id}
            >
              <Icon size={17} />
              {label}
              <ChevronRight className="nav-arrow" size={15} />
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-chip">
            <LockKeyhole size={15} />
            <span>
              PRIVACY
              <br />
              <strong>
                {provider.toLowerCase().includes("local") ? "LOCAL" : "VISIBLE"}
              </strong>
            </span>
          </div>
          <span className="version">HIREME / 01.0</span>
        </div>
      </aside>
      <main className="main-content">
        {ZipBanner}
        {view === "analyze" && !result && (
          <>
            <header className="page-header">
              <div>
                <span className="eyebrow">ANALYSIS WORKSPACE / 001</span>
                <h1>
                  Match the
                  <br />
                  <em>evidence.</em>
                </h1>
                <p>
                  One posting. One resume. A documented path to the interview.
                </p>
              </div>
              <div className="header-rule">
                /\
                <br />
                \/
              </div>
            </header>
            <div className="constraint-note">
              <strong>Exactly two sources.</strong> HireMe will not accept a
              third input. Every claim remains traceable to these documents.
            </div>
            <div className="source-grid">
              <SourceCard
                kind="job"
                state={job}
                setState={setJob}
                onFile={handleFile}
              />
              <SourceCard
                kind="resume"
                state={resume}
                setState={setResume}
                onFile={handleFile}
              />
            </div>
            <Progress running={running} complete={false} />
            <div className="action-row">
              <div className="privacy-consent">
                <LockKeyhole size={17} />
                <span>
                  {privacyLabel}
                  <small>
                    Review your provider in Settings before sending anything
                    remotely.
                  </small>
                  {!provider.toLowerCase().includes("local") && (
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={remoteConsent}
                        onChange={e => setRemoteConsent(e.target.checked)}
                      />{" "}
                      I understand these two sources will be sent to the
                      selected provider.
                    </label>
                  )}
                </span>
              </div>
              <Button
                className="primary-cta"
                disabled={!canAnalyze || running}
                onClick={run}
              >
                {running ? "Building evidence…" : "Generate HireMe Assessment"}
                <ChevronRight size={18} />
              </Button>
            </div>
            {runError && (
              <div className="inline-error" role="alert">
                <AlertTriangle size={16} />
                <span>{runError}</span>
              </div>
            )}
            {!canAnalyze && (job.text || resume.text) && (
              <div className="inline-error" role="alert">
                <AlertTriangle size={16} /> Both source inputs must contain
                readable text. PDF/DOCX warnings must be resolved before
                analysis.
              </div>
            )}
          </>
        )}
        {view === "analyze" && result && (
            <Results result={result} onReset={reset} />
        )}
        {view === "history" && (
          <section className="secondary-page">
            <span className="eyebrow">LOCAL-FIRST ARCHIVE</span>
            <h1>
              History<span>.</span>
            </h1>
            <p className="lede">
              Saved only when you enable history. Nothing is uploaded silently.
            </p>
            {history.length === 0 ? (
              <div className="empty-state">
                <History size={28} />
                <h2>No saved analyses</h2>
                <p>
                  Turn on “Save analysis history” in Settings, then generate an
                  assessment.
                </p>
                <Button onClick={() => setView("settings")}>
                  Open settings
                </Button>
              </div>
            ) : (
              <div className="history-list">
                {history.map(item => (
                  <button
                    className="history-item"
                    key={item.id}
                    onClick={() => {
                      setResult(item);
                      setView("analyze");
                    }}
                  >
                    <span>
                      <strong>
                        {item.resume.candidateName || "Unnamed candidate"}
                      </strong>
                      <small>
                        {item.job.title || "Untitled role"} ·{" "}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </small>
                    </span>
                    <b>
                      {item.score}
                      <small>/100</small>
                    </b>
                    <ChevronRight size={17} />
                  </button>
                ))}
                <Button
                  variant="outline"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem("hireme-history");
                  }}
                >
                  <Trash2 size={16} /> Clear all history
                </Button>
              </div>
            )}
          </section>
        )}
        {view === "settings" && (
          <section className="secondary-page">
            <span className="eyebrow">CONTROL PANEL / PRIVACY</span>
            <h1>
              Settings<span>.</span>
            </h1>
            <p className="lede">
              Choose how evidence is processed. Secrets never render in this
              interface.
            </p>
            <div className="settings-grid">
              <div className="setting-block">
                <span className="eyebrow">PROVIDER</span>
                <h2>Processing route</h2>
                <select
                  value={provider}
                  onChange={e => {
                    const nextP = e.target.value;
                    setProvider(nextP);
                    setTestStatus(null);
                    const def = defaultModels[nextP];
                    if (
                      def &&
                      (!model ||
                        model === "Evidence-first baseline" ||
                        Object.values(defaultModels).includes(model))
                    ) {
                      setModel(def);
                      localStorage.setItem("hireme-model", def);
                    }
                  }}
                >
                  <option>Local deterministic</option>
                  <option>OpenAI</option>
                  <option>Anthropic</option>
                  <option>Google Gemini</option>
                  <option>OpenRouter</option>
                  <option>Ollama</option>
                  <option>LM Studio</option>
                  <option>OpenAI-compatible</option>
                </select>
                <Input
                  value={model}
                  onChange={e => {
                    setModel(e.target.value);
                    localStorage.setItem("hireme-model", e.target.value);
                  }}
                  placeholder="Model identifier"
                  aria-label="Model identifier"
                />
                <Input
                  value={endpoint}
                  onChange={e => {
                    setEndpoint(e.target.value);
                    localStorage.setItem("hireme-endpoint", e.target.value);
                  }}
                  placeholder="Optional endpoint / base URL"
                  aria-label="Endpoint"
                />
                <Input
                  type="password"
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value);
                    setTestStatus(null);
                  }}
                  placeholder="API key — held only for this session"
                  aria-label="API key"
                  autoComplete="off"
                />
                <label className="toggle-line" style={{ marginTop: "12px" }}>
                  <input
                    type="checkbox"
                    checked={expertMode}
                    onChange={e => setExpertMode(e.target.checked)}
                  />
                  <span>Enable Expert / Advanced Model Parameters</span>
                </label>
                {expertMode && (
                  <div
                    style={{
                      background: "#f5f5f1",
                      border: "1px solid #090909",
                      padding: "12px",
                      marginTop: "8px",
                      marginBottom: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <label className="toggle-line" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={omitTemperature}
                        onChange={e => setOmitTemperature(e.target.checked)}
                      />
                      <span>
                        Omit temperature parameter (use model default 1.0)
                      </span>
                    </label>
                    <label className="toggle-line" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={useMaxCompletionTokens}
                        onChange={e =>
                          setUseMaxCompletionTokens(e.target.checked)
                        }
                      />
                      <span>
                        Use max_completion_tokens (for reasoning / strict
                        models)
                      </span>
                    </label>
                  </div>
                )}
                <Button
                  variant="outline"
                  disabled={
                    provider === "Local deterministic" ||
                    providerValidate.isPending
                  }
                  onClick={async () => {
                    setTestStatus(null);
                    try {
                      const res = await providerValidate.mutateAsync({
                        provider: providerIdForLabel(provider),
                        model:
                          model || defaultModels[provider] || "gpt-4o-mini",
                        endpoint: endpoint || undefined,
                        apiKey: apiKey || undefined,
                        temperature: 0.2,
                        omitTemperature,
                        useMaxCompletionTokens,
                        maxTokens: 16,
                        streaming: false,
                      });
                      setTestStatus(res);
                    } catch (err: any) {
                      setTestStatus({
                        ok: false,
                        error: err.message || "Connection test failed.",
                      });
                    }
                  }}
                >
                  {providerValidate.isPending
                    ? "Testing connection…"
                    : "Test connection"}
                </Button>
                {testStatus && (
                  <div
                    className={
                      testStatus.ok ? "test-success-msg" : "test-error-msg"
                    }
                  >
                    {testStatus.ok ? (
                      <Check size={15} />
                    ) : (
                      <AlertTriangle size={15} />
                    )}
                    <span>
                      {testStatus.ok ? testStatus.message : testStatus.error}
                    </span>
                  </div>
                )}
                <p className="setting-help">
                  Remote adapters are user-selected and user-initiated. The API
                  key is never persisted by this UI; it is held only in memory
                  until you leave the page.
                </p>
              </div>
              <div className="setting-block">
                <span className="eyebrow">HISTORY</span>
                <h2>Local persistence</h2>
                <label className="toggle-line">
                  <input
                    type="checkbox"
                    checked={saveHistory}
                    onChange={e => {
                      setSaveHistory(e.target.checked);
                      localStorage.setItem(
                        "hireme-save-history",
                        String(e.target.checked)
                      );
                    }}
                  />
                  <span>Save analysis history in this browser</span>
                </label>
                <Button
                  variant="outline"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem("hireme-history");
                  }}
                >
                  <Trash2 size={16} /> Clear local data
                </Button>
              </div>
            </div>
            <div className="privacy-panel">
              <ShieldCheck size={22} />
              <div>
                <strong>Privacy boundary</strong>
                <p>
                  Job descriptions and resumes are treated as untrusted source
                  data. They are not sent to a remote provider until you click
                  Generate, and local history is opt-in.
                </p>
              </div>
            </div>
          </section>
        )}
        {view === "about" && (
          <section className="secondary-page about-page">
            <span className="eyebrow">METHODOLOGY / ABOUT</span>
            <h1>
              Evidence
              <br />
              <span>over instinct.</span>
            </h1>
            <p className="lede">
              HireMe is an execution layer for a careful, auditable
              resume-to-job comparison method.
            </p>
            <div className="about-columns">
              <div>
                <h2>What it does</h2>
                <p>
                  It normalizes two source documents, maps role requirements to
                  resume evidence, grades each connection, assigns a transparent
                  documented-fit score, and turns gaps into interview
                  preparation.
                </p>
              </div>
              <div>
                <h2>What it refuses</h2>
                <p>
                  It does not predict hiring, invent credentials, manufacture
                  metrics, or turn a missing detail into a claim. Unsupported
                  claims remain gaps.
                </p>
              </div>
            </div>
            <a className="skill-download" href="/hireme-skill.zip" download>
              <Download size={18} /> Download HireMe Skill{" "}
              <span>ORIGINAL PACKAGE</span>
            </a>
          </section>
        )}
      </main>
    </div>
  );
}
