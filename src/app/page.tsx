"use client";
import { useState, useRef, useCallback } from "react";
import { BLOOD_MARKERS, BloodMarker, getRange, getStatus } from "@/lib/bloodMarkers";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AnalysisResult {
  summary: string;
  flags: Array<{ marker: string; value: string; status: "HIGH" | "LOW" | "NORMAL"; inScope: boolean; concern: string; referral: string | null }>;
  medicineSuggestions: Array<{ name: string; reason: string; priority: "HIGH" | "MEDIUM" | "LOW"; dosageNote: string }>;
  prescriptionMatch: { score: number; matches: string[]; mismatches: string[]; notes: string };
  outOfScopeItems: string[];
  overallRisk: "LOW" | "MODERATE" | "HIGH";
  followUpRecommended: string;
}

interface HistoryData {
  reports: Array<{ id: string; report_date: string; summary: string; match_score: number }>;
  trends: Record<string, Array<{ date: string; value: number; status: string }>>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cx = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(" ");

const RISK_COLOR = { LOW: "#10b981", MODERATE: "#f59e0b", HIGH: "#f43f5e" };

const CHART_COLORS: Record<string, string> = {
  testosterone_total: "#3b82f6",
  estradiol: "#f43f5e",
  vitamin_d: "#f59e0b",
  ferritin: "#00d4aa",
  progesterone: "#a78bfa",
  dheas: "#fb923c",
  lh: "#34d399",
  tsh: "#f472b6",
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status, inScope }: { status: string; inScope: boolean }) {
  if (!inScope) return (
    <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 12, background: "rgba(59,130,246,0.15)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)", letterSpacing: 1, textTransform: "uppercase" as const }}>
      ⚑ Refer
    </span>
  );
  const map = { HIGH: ["rgba(244,63,94,0.15)", "#f43f5e", "rgba(244,63,94,0.3)", "▲ High"], LOW: ["rgba(245,158,11,0.15)", "#f59e0b", "rgba(245,158,11,0.3)", "▼ Low"], NORMAL: ["rgba(16,185,129,0.15)", "#10b981", "rgba(16,185,129,0.3)", "✓ Normal"] } as Record<string, string[]>;
  const [bg, color, border, label] = map[status] || map.NORMAL;
  return <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 12, background: bg, color, border: `1px solid ${border}`, letterSpacing: 1, textTransform: "uppercase" as const }}>{label}</span>;
}

function Spinner({ text }: { text?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "60px 0" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #1c2d44", borderTopColor: "#00d4aa" }} className="animate-spin" />
      {text && <div style={{ fontSize: 12, color: "var(--muted)", letterSpacing: 1 }}>{text}</div>}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, marginBottom: 20, ...style }}>
      {children}
    </div>
  );
}

function CardTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-head)", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" as const, color: "var(--muted)", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "var(--accent)", fontSize: 16 }}>{icon}</span>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState<"input" | "results" | "medicines" | "rxcheck" | "progress" | "formulary">("input");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [values, setValues] = useState<Record<string, string>>({});
  const [prescriptionText, setPrescriptionText] = useState("Testosterone Cypionate 200mg/2wks IM\nAnastrozole 0.5mg EOD\nVitamin D3 5000IU daily");
  const [patientId, setPatientId] = useState("patient-001");
  const [loading, setLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medicines, setMedicines] = useState<Array<{ id: string; name: string; category: string; indication: string; dosage: string; route: string; side_effects: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const setValue = (key: string, val: string) => setValues((v) => ({ ...v, [key]: val }));

  const getLiveStatus = (m: BloodMarker) => {
    const v = parseFloat(values[m.key]);
    if (!values[m.key] || isNaN(v)) return null;
    return getStatus(m, v, gender);
  };

  // ── Upload PDF ──────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploadLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("patientId", patientId);
      fd.append("gender", gender);
      fd.append("reportDate", new Date().toISOString().split("T")[0]);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Populate form with extracted values
      const newValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.extractedValues)) {
        newValues[k] = String(v);
      }
      setValues(newValues);
      setReportId(data.reportId);
      setError(null);
      alert(`✅ Extracted ${data.markerCount} markers from PDF! Review the values below and run analysis.`);
    } catch (e) {
      setError("PDF extraction failed: " + String(e));
    } finally {
      setUploadLoading(false);
    }
  };

  // ── Run Analysis ────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    const filled = BLOOD_MARKERS.filter((m) => values[m.key] && values[m.key] !== "");
    if (filled.length === 0) { setError("Please enter at least one blood marker value."); return; }

    setLoading(true);
    setError(null);
    setTab("results");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, gender, values, prescriptionText, reportDate: new Date().toISOString().split("T")[0], reportId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAnalysis(data.analysis);
      setReportId(data.reportId);
    } catch (e) {
      setError("Analysis failed: " + String(e));
      setTab("input");
    } finally {
      setLoading(false);
    }
  };

  // ── Load History ────────────────────────────────────────────────────────────
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/history?patientId=${encodeURIComponent(patientId)}`);
      const data = await res.json();
      if (data.success) setHistory(data);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const loadMedicines = async () => {
    const res = await fetch("/api/medicines");
    const data = await res.json();
    if (data.success) setMedicines(data.medicines);
  };

  // ── Tab styles ──────────────────────────────────────────────────────────────
  const tabs = [
    { id: "input", label: "01 · Input" },
    { id: "results", label: "02 · Analysis" },
    { id: "medicines", label: "03 · Medicines" },
    { id: "rxcheck", label: "04 · Rx Check" },
    { id: "progress", label: "05 · Progress" },
    { id: "formulary", label: "06 · Formulary" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* ── Header ── */}
      <header style={{ borderBottom: "1px solid var(--border)", padding: "18px 32px", display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(90deg, #080d18 0%, #0d1929 100%)" }}>
        <div style={{ width: 42, height: 42, background: "linear-gradient(135deg, #00d4aa, #3b82f6)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🧬</div>
        <div>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: 800 }}>HemoSight AI</div>
          <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 2, textTransform: "uppercase" }}>Blood Report Analysis · HRT Clinic MVP</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>Patient:</div>
          <input
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12, width: 140, outline: "none" }}
          />
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", background: "rgba(0,212,170,0.12)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)", padding: "4px 12px", borderRadius: 20 }}>
            ⚡ Groq llama-3.3-70b
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 32px", background: "var(--surface)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id as typeof tab);
              if (t.id === "progress") loadHistory();
              if (t.id === "formulary") loadMedicines();
            }}
            style={{
              padding: "14px 18px", fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              cursor: "pointer", border: "none", background: "none", fontFamily: "var(--font-mono)",
              color: tab === t.id ? "var(--accent)" : "var(--muted)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── Content ── */}
      <main style={{ padding: "28px 32px", maxWidth: 1100 }}>

        {/* ══ TAB: INPUT ══ */}
        {tab === "input" && (
          <div className="animate-fadein">
            {/* Patient & Upload */}
            <Card>
              <CardTitle icon="👤">Patient Profile</CardTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Biological Sex (for reference ranges)</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["male", "female"] as const).map((g) => (
                      <button key={g} onClick={() => setGender(g)} style={{
                        padding: "8px 22px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                        border: `1px solid ${gender === g ? "var(--accent2)" : "var(--border)"}`,
                        background: gender === g ? "rgba(59,130,246,0.12)" : "var(--surface2)",
                        color: gender === g ? "#3b82f6" : "var(--muted)",
                        fontFamily: "var(--font-mono)", transition: "all 0.2s",
                      }}>
                        {g === "male" ? "♂ Male" : "♀ Female"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>Upload Blood Report PDF</div>
                  <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadLoading}
                    style={{ padding: "8px 18px", borderRadius: 8, fontSize: 12, cursor: uploadLoading ? "not-allowed" : "pointer", border: "1px dashed var(--border)", background: "var(--surface2)", color: "var(--muted)", fontFamily: "var(--font-mono)", opacity: uploadLoading ? 0.6 : 1, display: "flex", gap: 8, alignItems: "center" }}
                  >
                    {uploadLoading ? <><span className="animate-spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%" }} /> Extracting...</> : "📄 Upload & Auto-Extract PDF"}
                  </button>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>Or fill values manually below</div>
                </div>
              </div>
            </Card>

            {/* Blood Markers by Category */}
            {(["hormones", "nutrients", "metabolic", "thyroid"] as const).map((cat) => {
              const markers = BLOOD_MARKERS.filter((m) => m.category === cat && (gender === "male" || m.key !== "psa"));
              const catLabels = { hormones: "🧪 Hormones", nutrients: "💊 Nutrients & Supplements", metabolic: "📊 Metabolic Panel", thyroid: "🦋 Thyroid (Out-of-Scope)" };
              return (
                <Card key={cat}>
                  <CardTitle icon="">{catLabels[cat]}</CardTitle>
                  {cat === "thyroid" && (
                    <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#93c5fd" }}>
                      ℹ Thyroid markers are outside HRT clinic scope. If abnormal, AI will flag for specialist referral — no medicine suggestions will be made.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                    {markers.map((marker) => {
                      const range = getRange(marker, gender);
                      const liveStatus = getLiveStatus(marker);
                      const borderColor = liveStatus === "high" ? "var(--danger)" : liveStatus === "low" ? "var(--warn)" : liveStatus === "normal" ? "var(--ok)" : "var(--border)";
                      return (
                        <div key={marker.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{marker.label}</span>
                            {!marker.inScope && <span style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 0.5 }}>OUT-OF-SCOPE</span>}
                          </div>
                          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                            <input
                              type="number"
                              step="any"
                              placeholder={`e.g. ${range ? ((range[0] + range[1]) / 2).toFixed(1) : "—"}`}
                              value={values[marker.key] || ""}
                              onChange={(e) => setValue(marker.key, e.target.value)}
                              style={{
                                width: "100%", background: "var(--surface2)", borderRadius: 8,
                                padding: "9px 46px 9px 11px", fontSize: 13, outline: "none",
                                border: `1px solid ${liveStatus ? borderColor : "var(--border)"}`,
                                color: "var(--text)", fontFamily: "var(--font-mono)", transition: "border-color 0.2s",
                              }}
                            />
                            <span style={{ position: "absolute", right: 10, fontSize: 10, color: "var(--muted)", pointerEvents: "none" }}>{marker.unit}</span>
                          </div>
                          {range && <div style={{ fontSize: 10, color: "#334155" }}>Ref: {range[0]}–{range[1]} {marker.unit}</div>}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}

            {/* Prescription */}
            <Card>
              <CardTitle icon="📋">Doctor&apos;s Prescription</CardTitle>
              <textarea
                value={prescriptionText}
                onChange={(e) => setPrescriptionText(e.target.value)}
                placeholder="Enter current prescription for AI match analysis..."
                style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical", minHeight: 100, outline: "none", lineHeight: 1.8 }}
              />
            </Card>

            {error && <div style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", borderRadius: 8, padding: "12px 16px", fontSize: 12, color: "var(--danger)", marginBottom: 16 }}>⚠ {error}</div>}

            <button
              onClick={runAnalysis}
              disabled={loading}
              style={{ width: "100%", padding: 16, borderRadius: 10, fontSize: 13, fontFamily: "var(--font-head)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer", border: "none", background: loading ? "var(--surface2)" : "linear-gradient(135deg, #00d4aa, #3b82f6)", color: loading ? "var(--muted)" : "#fff", opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Analyzing..." : "▶ Run AI Analysis"}
            </button>
          </div>
        )}

        {/* ══ TAB: RESULTS ══ */}
        {tab === "results" && (
          <div className="animate-fadein">
            {loading ? (
              <Spinner text="Analyzing blood markers with Claude AI..." />
            ) : !analysis ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🔬</div>
                <div>No analysis yet — enter blood values and run analysis</div>
              </div>
            ) : (
              <>
                {/* Overall Risk Badge */}
                <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
                  {[
                    { label: "Overall Risk", value: analysis.overallRisk, color: RISK_COLOR[analysis.overallRisk] },
                    { label: "Out-of-Scope Items", value: analysis.outOfScopeItems.length, color: "#3b82f6" },
                    { label: "Medicine Suggestions", value: analysis.medicineSuggestions.length, color: "#00d4aa" },
                    { label: "Rx Match Score", value: `${analysis.prescriptionMatch?.score || 0}%`, color: analysis.prescriptionMatch?.score >= 80 ? "#10b981" : analysis.prescriptionMatch?.score >= 60 ? "#f59e0b" : "#f43f5e" },
                  ].map((stat) => (
                    <div key={stat.label} style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", borderTop: `3px solid ${stat.color}` }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{stat.label}</div>
                      <div style={{ fontFamily: "var(--font-head)", fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                {/* AI Summary */}
                <div style={{ background: "linear-gradient(135deg, rgba(0,212,170,0.05), rgba(59,130,246,0.05))", border: "1px solid rgba(0,212,170,0.2)", borderRadius: 12, padding: 20, marginBottom: 20, lineHeight: 1.8, fontSize: 13 }}>
                  <div style={{ fontSize: 10, color: "var(--accent)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="animate-pulse" style={{ display: "inline-block", width: 6, height: 6, background: "var(--accent)", borderRadius: "50%" }} />
                    AI Clinical Summary
                  </div>
                  {analysis.summary}
                  {analysis.followUpRecommended && <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>📅 Follow-up: {analysis.followUpRecommended}</div>}
                </div>

                {/* Out-of-scope alert */}
                {analysis.outOfScopeItems.length > 0 && (
                  <div style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 10, padding: 16, marginBottom: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 24 }}>🏥</div>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6, color: "#93c5fd", fontFamily: "var(--font-head)" }}>Outside Clinic Scope — Specialist Referral Required</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
                        The following require specialist referral and will not receive medicine suggestions:<br />
                        <strong style={{ color: "#93c5fd" }}>{analysis.outOfScopeItems.join(", ")}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Flags table */}
                <Card>
                  <CardTitle icon="📊">Marker Analysis</CardTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr", gap: 4, padding: "0 16px 10px", fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase" }}>
                    <div>Marker</div><div style={{ textAlign: "right" }}>Value</div><div style={{ textAlign: "center" }}>Clinical Note</div><div style={{ textAlign: "center" }}>Status</div>
                  </div>
                  {analysis.flags.map((flag, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr", gap: 4, padding: "11px 16px", borderRadius: 8, marginBottom: 6, background: "var(--surface2)", border: "1px solid var(--border)", alignItems: "center" }}>
                      <div style={{ fontSize: 12 }}>{flag.marker}</div>
                      <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: flag.status === "HIGH" ? "var(--danger)" : flag.status === "LOW" ? "var(--warn)" : "var(--ok)" }}>{flag.value}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>{flag.concern}{flag.referral && <span style={{ color: "#3b82f6" }}> → {flag.referral}</span>}</div>
                      <div style={{ textAlign: "center" }}><StatusBadge status={flag.status} inScope={flag.inScope} /></div>
                    </div>
                  ))}
                </Card>
              </>
            )}
          </div>
        )}

        {/* ══ TAB: MEDICINES ══ */}
        {tab === "medicines" && (
          <div className="animate-fadein">
            {!analysis ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>💊</div>
                <div>Run analysis first to see medicine suggestions</div>
              </div>
            ) : (
              <>
                <Card>
                  <CardTitle icon="💊">AI Medicine Suggestions</CardTitle>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20, background: "rgba(0,212,170,0.06)", border: "1px solid rgba(0,212,170,0.15)", borderRadius: 8, padding: "10px 14px" }}>
                    ✓ Suggestions restricted to internal clinic formulary only · No external or generic medications
                  </div>

                  {analysis.medicineSuggestions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 30, color: "var(--muted)", fontSize: 13 }}>No suggestions — all values within normal range or results are outside clinic scope</div>
                  ) : (
                    analysis.medicineSuggestions.map((med, i) => {
                      const pColor = med.priority === "HIGH" ? "var(--danger)" : med.priority === "MEDIUM" ? "var(--warn)" : "var(--ok)";
                      return (
                        <div key={i} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 18, marginBottom: 14, borderLeft: `3px solid ${pColor}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                            <div style={{ fontFamily: "var(--font-head)", fontSize: 15, fontWeight: 700 }}>{med.name}</div>
                            <span style={{ fontSize: 10, color: pColor, letterSpacing: 1, textTransform: "uppercase" }}>{med.priority} PRIORITY</span>
                          </div>
                          {med.dosageNote && <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>💉 {med.dosageNote}</div>}
                          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>{med.reason}</div>
                          <div style={{ marginTop: 10 }}>
                            <span style={{ fontSize: 10, background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.2)", padding: "2px 8px", borderRadius: 10, marginRight: 6 }}>✓ Internal Formulary</span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {analysis.outOfScopeItems.length > 0 && (
                    <div style={{ marginTop: 16, background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 10, padding: 16, fontSize: 12, color: "#93c5fd", display: "flex", gap: 12 }}>
                      <div style={{ fontSize: 20 }}>🚫</div>
                      <div>No medicine suggestions for out-of-scope items (<strong>{analysis.outOfScopeItems.join(", ")}</strong>). These require specialist referral.</div>
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        )}

        {/* ══ TAB: RX CHECK ══ */}
        {tab === "rxcheck" && (
          <div className="animate-fadein">
            {!analysis ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📋</div>
                <div>Run analysis first to check prescription alignment</div>
              </div>
            ) : (
              <Card>
                <CardTitle icon="🔍">Prescription Match Analysis</CardTitle>
                <div style={{ display: "flex", gap: 32, alignItems: "flex-start", marginBottom: 28 }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontFamily: "var(--font-head)", fontSize: 52, fontWeight: 800, color: analysis.prescriptionMatch?.score >= 80 ? "var(--ok)" : analysis.prescriptionMatch?.score >= 60 ? "var(--warn)" : "var(--danger)", lineHeight: 1 }}>
                      {analysis.prescriptionMatch?.score ?? "—"}
                      <span style={{ fontSize: 24, color: "var(--muted)" }}>%</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 }}>Match Score</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ background: "var(--surface2)", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ height: "100%", width: `${analysis.prescriptionMatch?.score || 0}%`, background: "linear-gradient(90deg, var(--accent), var(--accent2))", borderRadius: 6, transition: "width 1.2s ease" }} />
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.7 }}>{analysis.prescriptionMatch?.notes}</div>
                  </div>
                </div>

                {analysis.prescriptionMatch?.matches?.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>✓ Aligned Items</div>
                    {analysis.prescriptionMatch.matches.map((m, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "11px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
                        <span style={{ color: "var(--ok)", flexShrink: 0 }}>✓</span>
                        <span>{m}</span>
                      </div>
                    ))}
                  </>
                )}

                {analysis.prescriptionMatch?.mismatches?.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", margin: "18px 0 10px" }}>⚠ Mismatches / Concerns</div>
                    {analysis.prescriptionMatch.mismatches.map((m, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "11px 14px", background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
                        <span style={{ color: "var(--danger)", flexShrink: 0 }}>⚠</span>
                        <span>{m}</span>
                      </div>
                    ))}
                  </>
                )}

                <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(100,116,139,0.1)", borderRadius: 8, fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
                  ℹ This AI analysis is for administrative review assistance only. The prescribing physician remains the final clinical authority. No changes to treatment should be made solely based on this output.
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══ TAB: PROGRESS ══ */}
        {tab === "progress" && (
          <div className="animate-fadein">
            {historyLoading ? (
              <Spinner text="Loading patient history..." />
            ) : !history || history.reports.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📈</div>
                <div>No history found for patient <strong>{patientId}</strong><br />
                  <span style={{ fontSize: 12 }}>Run multiple analyses over time to see progress charts</span>
                </div>
              </div>
            ) : (
              <>
                <Card>
                  <CardTitle icon="📈">Treatment Progress Tracking</CardTitle>
                  {Object.entries(history.trends).slice(0, 6).map(([markerKey, points]) => {
                    if (points.length < 2) return null;
                    const marker = BLOOD_MARKERS.find((m) => m.key === markerKey);
                    if (!marker) return null;
                    const range = getRange(marker, gender);
                    const color = CHART_COLORS[markerKey] || "#00d4aa";
                    return (
                      <div key={markerKey} style={{ background: "var(--surface2)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
                          {marker.label} ({marker.unit})
                        </div>
                        <ResponsiveContainer width="100%" height={130}>
                          <LineChart data={points} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1c2d44" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                            <Tooltip contentStyle={{ background: "#0f1623", border: "1px solid #1c2d44", borderRadius: 8, fontSize: 11 }} />
                            {range && <ReferenceLine y={range[0]} stroke="#64748b" strokeDasharray="4 4" />}
                            {range && <ReferenceLine y={range[1]} stroke="#64748b" strokeDasharray="4 4" />}
                            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ fill: color, r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })}
                </Card>

                <Card>
                  <CardTitle icon="📋">Report History</CardTitle>
                  {history.reports.map((r) => (
                    <div key={r.id} style={{ padding: "14px 16px", borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--border)", marginBottom: 10, fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "var(--accent)", fontFamily: "var(--font-head)", fontWeight: 600 }}>{r.report_date}</span>
                        {r.match_score !== null && <span style={{ fontSize: 10, color: "var(--muted)" }}>Rx Match: <strong style={{ color: r.match_score >= 80 ? "var(--ok)" : "var(--warn)" }}>{r.match_score}%</strong></span>}
                      </div>
                      <div style={{ color: "var(--muted)", lineHeight: 1.6 }}>{r.summary || "No summary available"}</div>
                    </div>
                  ))}
                </Card>
              </>
            )}
          </div>
        )}

        {/* ══ TAB: FORMULARY ══ */}
        {tab === "formulary" && (
          <div className="animate-fadein">
            <Card>
              <CardTitle icon="🗂">Internal Medicine Formulary</CardTitle>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
                Only these medicines will be suggested by the AI. Add or remove entries to update the suggestion scope.
              </div>
              {medicines.length === 0 ? (
                <Spinner text="Loading formulary..." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {medicines.map((med) => (
                    <div key={med.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                      <div style={{ fontFamily: "var(--font-head)", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{med.name}</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 10, background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.2)", padding: "2px 8px", borderRadius: 10 }}>{med.category}</span>
                        <span style={{ fontSize: 10, background: "rgba(59,130,246,0.1)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.2)", padding: "2px 8px", borderRadius: 10 }}>{med.route}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}><strong>For:</strong> {med.indication}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}><strong>Dose:</strong> {med.dosage}</div>
                      {med.side_effects && <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>⚠ {med.side_effects}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
