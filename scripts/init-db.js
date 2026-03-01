const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, "hrt_clinic.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS medicines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    indication TEXT NOT NULL,
    dosage TEXT NOT NULL,
    route TEXT NOT NULL,
    side_effects TEXT,
    contraindications TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    patient_ref TEXT NOT NULL,
    gender TEXT NOT NULL,
    age INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    raw_text TEXT,
    file_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id)
  );

  CREATE TABLE IF NOT EXISTS blood_values (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    marker_key TEXT NOT NULL,
    marker_label TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    status TEXT NOT NULL,
    in_scope INTEGER DEFAULT 1,
    FOREIGN KEY (report_id) REFERENCES reports(id)
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    flags_json TEXT NOT NULL,
    medicines_json TEXT NOT NULL,
    out_of_scope_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id)
  );

  CREATE TABLE IF NOT EXISTS prescriptions (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    analysis_id TEXT NOT NULL,
    prescription_text TEXT NOT NULL,
    match_score INTEGER,
    matches_json TEXT,
    mismatches_json TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id)
  );
`);

// Seed internal medicine database
const medicines = [
  { id: "M001", name: "Testosterone Cypionate", category: "HRT", indication: "Low testosterone / Hypogonadism", dosage: "100–200mg/mL", route: "Intramuscular injection", side_effects: "Acne, mood swings, elevated hematocrit, testicular atrophy", contraindications: "Prostate cancer, breast cancer" },
  { id: "M002", name: "Testosterone Enanthate", category: "HRT", indication: "Low testosterone / Hypogonadism", dosage: "100–200mg/mL", route: "Intramuscular injection", side_effects: "Similar to Cypionate, slightly different half-life", contraindications: "Prostate cancer" },
  { id: "M003", name: "Testosterone Propionate", category: "HRT", indication: "Low testosterone, short-acting option", dosage: "50–100mg/mL", route: "Intramuscular injection", side_effects: "More frequent injection site reactions", contraindications: "Prostate cancer" },
  { id: "M004", name: "Estradiol Valerate", category: "HRT", indication: "Low estrogen / Menopause / MTF HRT", dosage: "2–4mg oral or 10mg/mL injection", route: "Oral or Intramuscular", side_effects: "Nausea, bloating, breast tenderness, mood changes", contraindications: "Estrogen-sensitive cancers, blood clots" },
  { id: "M005", name: "Estradiol Cypionate", category: "HRT", indication: "Low estrogen, injectable form", dosage: "5mg/mL", route: "Intramuscular injection", side_effects: "Nausea, breast tenderness, headaches", contraindications: "Estrogen-sensitive cancers" },
  { id: "M006", name: "Progesterone (Micronized)", category: "HRT", indication: "Low progesterone / Luteal phase defect", dosage: "100–200mg oral capsule", route: "Oral or Vaginal", side_effects: "Drowsiness, dizziness, breast pain", contraindications: "Peanut allergy (some brands), undiagnosed vaginal bleeding" },
  { id: "M007", name: "DHEA", category: "HRT", indication: "Low DHEA-S levels, adrenal insufficiency", dosage: "25–50mg tablet", route: "Oral", side_effects: "Oily skin, hair thinning, acne", contraindications: "Hormone-sensitive conditions" },
  { id: "M008", name: "Anastrozole (Arimidex)", category: "Aromatase Inhibitor", indication: "High estrogen in males on TRT", dosage: "0.25–1mg tablet", route: "Oral", side_effects: "Joint pain, bone density loss, hot flashes", contraindications: "Osteoporosis, pre-menopausal women (off-label caution)" },
  { id: "M009", name: "Enclomiphene Citrate", category: "SERM", indication: "Low LH/FSH with secondary hypogonadism", dosage: "12.5–25mg tablet", route: "Oral", side_effects: "Visual disturbances, hot flashes, mood changes", contraindications: "Liver disease, abnormal uterine bleeding" },
  { id: "M010", name: "Vitamin D3 (Cholecalciferol)", category: "Supplement", indication: "Vitamin D deficiency (< 30 ng/mL)", dosage: "2000–5000 IU softgel", route: "Oral", side_effects: "Rare at standard doses; hypercalcemia at toxic levels", contraindications: "Hypercalcemia, sarcoidosis" },
  { id: "M011", name: "Vitamin K2 (MK-7)", category: "Supplement", indication: "Companion to D3 for calcium metabolism", dosage: "100–200mcg capsule", route: "Oral", side_effects: "None at standard doses", contraindications: "Warfarin therapy" },
  { id: "M012", name: "Methylcobalamin B12", category: "Supplement", indication: "B12 deficiency (< 200 pg/mL)", dosage: "1000mcg sublingual tablet", route: "Sublingual or IM injection", side_effects: "None significant", contraindications: "None known" },
  { id: "M013", name: "Iron Bisglycinate", category: "Supplement", indication: "Iron deficiency / Low ferritin", dosage: "25–36mg elemental iron capsule", route: "Oral", side_effects: "Constipation, dark stools, stomach cramps", contraindications: "Hemochromatosis, iron overload" },
  { id: "M014", name: "Magnesium Glycinate", category: "Supplement", indication: "Low magnesium, muscle cramps, sleep issues", dosage: "200–400mg capsule", route: "Oral", side_effects: "Loose stools at high doses", contraindications: "Severe kidney disease" },
  { id: "M015", name: "Zinc Picolinate", category: "Supplement", indication: "Low zinc, supports testosterone production", dosage: "15–30mg capsule", route: "Oral", side_effects: "Nausea if taken on empty stomach", contraindications: "Copper deficiency" },
];

const insertMed = db.prepare(`
  INSERT OR IGNORE INTO medicines (id, name, category, indication, dosage, route, side_effects, contraindications)
  VALUES (@id, @name, @category, @indication, @dosage, @route, @side_effects, @contraindications)
`);

const insertAll = db.transaction((meds) => {
  for (const med of meds) insertMed.run(med);
});

insertAll(medicines);

console.log("✅ Database initialized successfully");
console.log(`✅ Seeded ${medicines.length} medicines into internal formulary`);
db.close();
