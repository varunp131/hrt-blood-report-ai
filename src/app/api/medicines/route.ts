import { NextRequest, NextResponse } from "next/server";
import { getDb, uuid } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const medicines = db.prepare("SELECT * FROM medicines WHERE active = 1 ORDER BY category, name").all();
    return NextResponse.json({ success: true, medicines });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, category, indication, dosage, route, side_effects, contraindications } = body;

    if (!name || !category || !indication || !dosage || !route) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const db = getDb();
    const id = `M${String(Date.now()).slice(-6)}`;
    db.prepare("INSERT INTO medicines (id, name, category, indication, dosage, route, side_effects, contraindications) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id, name, category, indication, dosage, route, side_effects || null, contraindications || null
    );

    return NextResponse.json({ success: true, id });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const db = getDb();
    db.prepare("UPDATE medicines SET active = 0 WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
