import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId");
    const marker = searchParams.get("marker");

    if (!patientId) return NextResponse.json({ success: false, error: "patientId required" }, { status: 400 });

    const db = getDb();

    // Get all reports for patient
    const reports = db.prepare(`
      SELECT r.*, a.summary, a.flags_json, a.medicines_json, a.match_score, a.out_of_scope_json
      FROM reports r
      LEFT JOIN analyses a ON a.report_id = r.id
      WHERE r.patient_id = ?
      ORDER BY r.report_date ASC
    `).all(patientId) as Array<{ id: string; report_date: string; summary: string; flags_json: string; medicines_json: string; match_score: number; out_of_scope_json: string }>;

    // Get blood values trend
    let trendQuery = `
      SELECT bv.marker_key, bv.marker_label, bv.value, bv.unit, bv.status, r.report_date
      FROM blood_values bv
      JOIN reports r ON r.id = bv.report_id
      WHERE r.patient_id = ?
    `;
    const params: string[] = [patientId];

    if (marker) {
      trendQuery += " AND bv.marker_key = ?";
      params.push(marker);
    }
    trendQuery += " ORDER BY r.report_date ASC";

    const trends = db.prepare(trendQuery).all(...params) as Array<{
      marker_key: string;
      marker_label: string;
      value: number;
      unit: string;
      status: string;
      report_date: string;
    }>;

    // Group trends by marker
    const trendByMarker: Record<string, Array<{ date: string; value: number; status: string }>> = {};
    for (const t of trends) {
      if (!trendByMarker[t.marker_key]) trendByMarker[t.marker_key] = [];
      trendByMarker[t.marker_key].push({ date: t.report_date, value: t.value, status: t.status });
    }

    return NextResponse.json({
      success: true,
      reports: reports.map((r) => ({
        ...r,
        flags: r.flags_json ? JSON.parse(r.flags_json) : [],
        medicines: r.medicines_json ? JSON.parse(r.medicines_json) : [],
        outOfScope: r.out_of_scope_json ? JSON.parse(r.out_of_scope_json) : [],
      })),
      trends: trendByMarker,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
