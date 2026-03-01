import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { getDb, uuid } from "@/lib/db";
import { BLOOD_MARKERS } from "@/lib/bloodMarkers";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const patientId = formData.get("patientId") as string;
    const gender = (formData.get("gender") as string) || "male";
    const reportDate = formData.get("reportDate") as string;

    if (!file) return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });

    // Extract text from PDF using pdf-parse
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Dynamically import pdf-parse (avoids SSR issues)
    const pdfParse = (await import("pdf-parse")).default;
    const pdfData = await pdfParse(buffer);
    const pdfText = pdfData.text;

    if (!pdfText || pdfText.trim().length < 20) {
      return NextResponse.json({ success: false, error: "Could not extract text from PDF. Please enter values manually." }, { status: 400 });
    }

    // Build marker key list for prompt
    const markerList = BLOOD_MARKERS.map((m) => `"${m.key}" = ${m.label} (${m.unit})`).join("\n");

    // Ask Groq to extract values from the text
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a medical data extraction assistant. Extract blood test values from lab report text. Return ONLY valid JSON, no markdown."
        },
        {
          role: "user",
          content: `Extract blood test values from this lab report text. Return numeric values only (no units in value field).

LAB REPORT TEXT:
${pdfText.slice(0, 4000)}

MARKERS TO EXTRACT (key = label):
${markerList}

Return JSON:
{
  "extractedValues": {
    "testosterone_total": 245.5,
    "estradiol": 45.2,
    ... (only markers found, omit not found ones)
  },
  "patientInfo": {
    "name": "if found or null",
    "age": null,
    "date": "YYYY-MM-DD or null",
    "labName": "lab name or null"
  }
}`
        }
      ]
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || "{}");

    // Filter: only numeric values
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(result.extractedValues || {})) {
      const num = parseFloat(String(v));
      if (!isNaN(num)) values[k] = num;
    }

    // Store report in DB
    const db = getDb();
    const reportId = uuid();

    let patientRow = db.prepare("SELECT * FROM patients WHERE id = ?").get(patientId) as { id: string } | undefined;
    if (!patientRow) {
      const pid = patientId || uuid();
      db.prepare("INSERT OR IGNORE INTO patients (id, patient_ref, gender) VALUES (?, ?, ?)").run(pid, `PT-${Date.now()}`, gender);
      patientRow = { id: pid };
    }

    db.prepare("INSERT INTO reports (id, patient_id, report_date, raw_text, file_name) VALUES (?, ?, ?, ?, ?)").run(
      reportId, patientRow.id,
      reportDate || result.patientInfo?.date || new Date().toISOString().split("T")[0],
      pdfText.slice(0, 2000),
      file.name
    );

    return NextResponse.json({
      success: true,
      reportId,
      patientId: patientRow.id,
      extractedValues: values,
      patientInfo: result.patientInfo || {},
      markerCount: Object.keys(values).length,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
