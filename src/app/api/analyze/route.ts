import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getDb, uuid } from "@/lib/db";
import { BLOOD_MARKERS, getRange, getStatus } from "@/lib/bloodMarkers";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { patientId, gender, values, prescriptionText, reportDate, reportId: existingReportId } = body;

    const db = getDb();

    // Resolve or create patient
    let patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(patientId) as { id: string } | undefined;
    if (!patient) {
      const newId = uuid();
      db.prepare("INSERT INTO patients (id, patient_ref, gender) VALUES (?, ?, ?)").run(newId, patientId || `PT-${Date.now()}`, gender);
      patient = { id: newId };
    }

    // Create report entry
    const reportId = existingReportId || uuid();
    if (!existingReportId) {
      db.prepare("INSERT INTO reports (id, patient_id, report_date) VALUES (?, ?, ?)").run(
        reportId, patient.id, reportDate || new Date().toISOString().split("T")[0]
      );
    }

    // Store blood values
    const filledMarkers = BLOOD_MARKERS.filter((m) => values[m.key] !== undefined && values[m.key] !== "");
    const insertVal = db.prepare("INSERT OR REPLACE INTO blood_values (id, report_id, marker_key, marker_label, value, unit, status, in_scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    db.transaction(() => {
      for (const m of filledMarkers) {
        const val = parseFloat(values[m.key]);
        insertVal.run(uuid(), reportId, m.key, m.label, val, m.unit, getStatus(m, val, gender), m.inScope ? 1 : 0);
      }
    })();

    // Build prompt context
    const medicines = db.prepare("SELECT * FROM medicines WHERE active = 1").all() as Array<{ name: string; indication: string; category: string }>;
    const medicineList = medicines.map((m) => `${m.name} [${m.category}] — ${m.indication}`).join("\n");

    const markerSummary = filledMarkers.map((m) => {
      const val = parseFloat(values[m.key]);
      const range = getRange(m, gender);
      const rangeStr = range ? `(ref: ${range[0]}-${range[1]} ${m.unit})` : "(no ref range)";
      const status = m.inScope ? getStatus(m, val, gender).toUpperCase() : "OUT_OF_SCOPE";
      return `${m.label}: ${val} ${m.unit} ${rangeStr} -> ${status}${!m.inScope ? ` [${m.scopeNote}]` : ""}`;
    }).join("\n");

    // Call Groq
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a clinical AI assistant for an HRT clinic. Return ONLY valid JSON, no markdown or extra text.
CLINIC SCOPE: IN SCOPE = hormones (testosterone, estrogen, progesterone, DHEA, SHBG, LH, FSH, cortisol), hematocrit, hemoglobin, vitamins (D, B12), iron/ferritin.
OUT OF SCOPE (flag+refer, NO medicine) = thyroid (TSH/T3/T4), diabetes (glucose/HbA1c), PSA.`
        },
        {
          role: "user",
          content: `Analyze blood results for a ${gender} patient.

BLOOD RESULTS:
${markerSummary}

DOCTOR PRESCRIPTION:
${prescriptionText || "Not provided"}

INTERNAL FORMULARY (ONLY suggest from this list):
${medicineList}

Return JSON with this structure:
{
  "summary": "2-3 sentence clinical overview",
  "flags": [{"marker":"name","value":"val+unit","status":"HIGH|LOW|NORMAL","inScope":true,"concern":"brief note","referral":null}],
  "medicineSuggestions": [{"name":"exact formulary name","reason":"reason from results","priority":"HIGH|MEDIUM|LOW","dosageNote":"dose note"}],
  "prescriptionMatch": {"score":0-100,"matches":["aligned items"],"mismatches":["concerns"],"notes":"overall note"},
  "outOfScopeItems": ["out-of-scope abnormal markers"],
  "overallRisk": "LOW|MODERATE|HIGH",
  "followUpRecommended": "timeline"
}`
        }
      ]
    });

    const analysis = JSON.parse(completion.choices[0]?.message?.content || "{}");

    // Store analysis
    const analysisId = uuid();
    db.prepare(`INSERT INTO analyses (id, report_id, summary, flags_json, medicines_json, out_of_scope_json, prescription_text, match_score, matches_json, mismatches_json, match_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      analysisId, reportId,
      analysis.summary || "",
      JSON.stringify(analysis.flags || []),
      JSON.stringify(analysis.medicineSuggestions || []),
      JSON.stringify(analysis.outOfScopeItems || []),
      prescriptionText || null,
      analysis.prescriptionMatch?.score ?? null,
      JSON.stringify(analysis.prescriptionMatch?.matches || []),
      JSON.stringify(analysis.prescriptionMatch?.mismatches || []),
      analysis.prescriptionMatch?.notes || null
    );

    return NextResponse.json({ success: true, reportId, analysisId, analysis });
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
