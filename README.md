# 🧬 HemoSight AI — Blood Report Analysis & HRT Medicine Recommendation

A full-stack MVP AI system for an HRT clinic that analyzes blood reports, suggests medicines from an internal formulary, checks prescription alignment, and tracks patient progress — powered by **Groq llama-3.3-70b-versatile** and **Next.js 14**.

Built to match the Upwork job requirements:  
✅ PDF blood report upload & auto-extraction  
✅ AI-powered marker analysis with HIGH/LOW/NORMAL flagging  
✅ Out-of-scope detection with specialist referral  
✅ Medicine suggestions restricted to internal formulary  
✅ Doctor prescription match scoring  
✅ Patient progress tracking with charts  
✅ SQLite database (HIPAA-ready structure with de-identified patients)

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| AI | Groq API — llama-3.3-70b-versatile |
| Database | SQLite via better-sqlite3 |
| Charts | Recharts |
| PDF parsing | Claude Vision (no external library needed) |

---

## 🚀 Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd hrt-blood-report-ai
npm install
```

### 2. Configure Environment

Copy `.env.local` and add your API key:

```bash
cp .env.local .env.local
```

Edit `.env.local`:
```
GROQ_API_KEY=gsk_your_groq_key_here
DATABASE_PATH=./data/hrt_clinic.db
```

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

The database initializes automatically on first run and seeds 15 medicines into the formulary.

---

## 📁 Project Structure

```
hrt-blood-report-ai/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Main dashboard UI
│   │   ├── layout.tsx             # Root layout
│   │   ├── globals.css            # Global styles
│   │   └── api/
│   │       ├── analyze/route.ts   # AI analysis endpoint
│   │       ├── upload/route.ts    # PDF upload & extraction
│   │       ├── medicines/route.ts # Formulary CRUD
│   │       └── history/route.ts   # Patient history & trends
│   └── lib/
│       ├── db.ts                  # SQLite setup + auto-schema + seeding
│       └── bloodMarkers.ts        # 21 blood markers with reference ranges
├── data/                          # Auto-created SQLite database
├── scripts/
│   └── init-db.js                 # Manual DB init (optional)
├── .env.local                     # API keys (don't commit!)
├── next.config.js
└── package.json
```

---

## 🔬 Features Walkthrough

### Tab 1 — Input
- Select patient gender (adjusts reference ranges automatically)
- Upload a real blood report PDF → Claude Vision extracts all values automatically
- Or manually enter values for 21 blood markers across 4 categories
- Input field borders turn red/yellow/green live as you type
- Enter current doctor's prescription for Rx Check

### Tab 2 — Analysis
After clicking **Run AI Analysis**, Claude analyzes all markers and returns:
- Plain-English clinical summary
- Each marker flagged as HIGH / LOW / NORMAL
- Out-of-scope markers (TSH, glucose, HbA1c, PSA) flagged for specialist referral
- Overall risk level (LOW / MODERATE / HIGH)
- Follow-up timeline recommendation

### Tab 3 — Medicines
- AI suggests medicines from internal formulary ONLY
- Prioritized as HIGH / MEDIUM / LOW
- Shows suggested dosage notes
- Clearly states no suggestions for out-of-scope findings

### Tab 4 — Rx Check
- Compares doctor's prescription against AI findings
- 0–100 match score with visual progress bar
- Lists aligned items (green) and mismatches/concerns (red)
- Disclaimer: doctor remains final authority

### Tab 5 — Progress
- Line charts showing marker trends across multiple analyses
- Report history with summaries and Rx match scores
- Identifies improvement or decline over treatment period

### Tab 6 — Formulary
- View all 15 seeded internal medicines
- Category, dosage, route, indication, side effects
- API supports adding/removing medicines

---

## 🔒 Data & HIPAA Notes

- Patients are stored by reference ID only (no real names in DB by default)
- All data stays local in SQLite — nothing sent to external services except Anthropic API calls
- Blood values and PDF text sent to Anthropic API are de-identified
- For production: add authentication, encrypt the DB, and implement proper audit logging

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Run AI analysis on blood values |
| POST | `/api/upload` | Upload PDF, extract blood values |
| GET | `/api/medicines` | List all formulary medicines |
| POST | `/api/medicines` | Add new medicine to formulary |
| DELETE | `/api/medicines` | Remove medicine from formulary |
| GET | `/api/history?patientId=X` | Patient report history + trends |

---

## 🏗 Extending for Production

- **Auth**: Add NextAuth.js for clinic staff login
- **Multi-tenant**: Add clinic_id to all tables for SaaS
- **Export**: Add PDF report export for patient summaries
- **Webhooks**: Notify doctor when analysis flags critical values
- **Admin panel**: Manage formulary, view all patients, analytics

---

## 📝 Proposal Notes (Upwork)

Built as a portfolio demonstration matching the job requirements:
- AI/LLMs: Groq llama-3.3-70b-versatile via Anthropic SDK
- PDF extraction: Claude Vision API (no brittle regex)
- Healthcare data: De-identified, local SQLite, HIPAA-ready structure
- Dashboard: Next.js + Recharts for visualization
- Internal formulary: SQLite-backed, admin-manageable
