export interface BloodMarker {
  key: string;
  label: string;
  unit: string;
  maleRange: [number, number] | null;
  femaleRange: [number, number] | null;
  inScope: boolean;
  scopeNote?: string;
  category: "hormones" | "nutrients" | "metabolic" | "thyroid";
}

export const BLOOD_MARKERS: BloodMarker[] = [
  // ── Hormones ──────────────────────────────────────────────────────────────
  { key: "testosterone_total", label: "Testosterone Total", unit: "ng/dL", maleRange: [300, 1000], femaleRange: [15, 70], inScope: true, category: "hormones" },
  { key: "testosterone_free",  label: "Testosterone Free",  unit: "pg/mL", maleRange: [50, 210],   femaleRange: [1, 8.5],  inScope: true, category: "hormones" },
  { key: "estradiol",          label: "Estradiol (E2)",     unit: "pg/mL", maleRange: [10, 40],    femaleRange: [15, 350], inScope: true, category: "hormones" },
  { key: "progesterone",       label: "Progesterone",       unit: "ng/mL", maleRange: [0.3, 1.2],  femaleRange: [0.1, 25], inScope: true, category: "hormones" },
  { key: "dheas",              label: "DHEA-S",             unit: "µg/dL", maleRange: [100, 400],  femaleRange: [80, 350], inScope: true, category: "hormones" },
  { key: "lh",                 label: "LH",                 unit: "mIU/mL",maleRange: [1.5, 9.3],  femaleRange: [2, 150],  inScope: true, category: "hormones" },
  { key: "fsh",                label: "FSH",                unit: "mIU/mL",maleRange: [1.5, 12.4], femaleRange: [3, 200],  inScope: true, category: "hormones" },
  { key: "shbg",               label: "SHBG",               unit: "nmol/L",maleRange: [10, 57],    femaleRange: [18, 144], inScope: true, category: "hormones" },
  { key: "cortisol",           label: "Cortisol (AM)",      unit: "µg/dL", maleRange: [6, 23],     femaleRange: [6, 23],   inScope: true, category: "hormones" },
  { key: "psa",                label: "PSA",                unit: "ng/mL", maleRange: [0, 4],      femaleRange: null,      inScope: false, scopeNote: "Refer to Urologist if elevated", category: "hormones" },
  // ── Thyroid ───────────────────────────────────────────────────────────────
  { key: "tsh",    label: "TSH",     unit: "mIU/L", maleRange: [0.4, 4.0], femaleRange: [0.4, 4.0], inScope: false, scopeNote: "Refer to Endocrinologist", category: "thyroid" },
  { key: "t3_free",label: "Free T3", unit: "pg/mL", maleRange: [2.3, 4.2], femaleRange: [2.3, 4.2], inScope: false, scopeNote: "Refer to Endocrinologist", category: "thyroid" },
  { key: "t4_free",label: "Free T4", unit: "ng/dL", maleRange: [0.8, 1.8], femaleRange: [0.8, 1.8], inScope: false, scopeNote: "Refer to Endocrinologist", category: "thyroid" },
  // ── Nutrients ─────────────────────────────────────────────────────────────
  { key: "vitamin_d", label: "Vitamin D (25-OH)", unit: "ng/mL", maleRange: [30, 100], femaleRange: [30, 100], inScope: true, category: "nutrients" },
  { key: "b12",       label: "Vitamin B12",       unit: "pg/mL", maleRange: [200, 900],femaleRange: [200, 900],inScope: true, category: "nutrients" },
  { key: "ferritin",  label: "Ferritin",           unit: "ng/mL", maleRange: [30, 300], femaleRange: [13, 150],inScope: true, category: "nutrients" },
  { key: "iron",      label: "Serum Iron",         unit: "µg/dL", maleRange: [60, 170], femaleRange: [60, 170],inScope: true, category: "nutrients" },
  // ── Metabolic ─────────────────────────────────────────────────────────────
  { key: "glucose_fasting", label: "Fasting Glucose", unit: "mg/dL", maleRange: [70, 99],    femaleRange: [70, 99],    inScope: false, scopeNote: "Refer to Endocrinologist/PCP if diabetic range", category: "metabolic" },
  { key: "hba1c",           label: "HbA1c",           unit: "%",     maleRange: [4, 5.7],    femaleRange: [4, 5.7],    inScope: false, scopeNote: "Refer to Endocrinologist if ≥ 6.5%", category: "metabolic" },
  { key: "hematocrit",      label: "Hematocrit",      unit: "%",     maleRange: [38.3, 50.9],femaleRange: [35.5, 44.9],inScope: true, category: "metabolic" },
  { key: "hemoglobin",      label: "Hemoglobin",      unit: "g/dL",  maleRange: [13.5, 17.5],femaleRange: [12, 15.5],  inScope: true, category: "metabolic" },
];

export function getMarkerByKey(key: string) {
  return BLOOD_MARKERS.find((m) => m.key === key);
}

export function getRange(marker: BloodMarker, gender: "male" | "female") {
  return gender === "male" ? marker.maleRange : marker.femaleRange;
}

export function getStatus(marker: BloodMarker, value: number, gender: "male" | "female"): "normal" | "low" | "high" {
  const range = getRange(marker, gender);
  if (!range) return "normal";
  if (value < range[0]) return "low";
  if (value > range[1]) return "high";
  return "normal";
}
