import {
  GLUCOSE_CONTEXTS,
  MEAL_TYPES,
  type MealRecord,
  type ReadingRecord,
  type RecordsResponse,
} from "@/lib/records";

const STORAGE_KEY = "diario-da-luiza:records:v1";
const BACKUP_VERSION = 1;

export type LuizaBackup = {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  records: RecordsResponse;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validDate(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}

function asMeal(value: unknown): MealRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    !isString(item.id) ||
    !validDate(item.occurredAt) ||
    !isString(item.mealType) ||
    !(item.mealType in MEAL_TYPES) ||
    !Array.isArray(item.foods) ||
    !item.foods.every(isString) ||
    !isString(item.notes)
  ) {
    return null;
  }
  return {
    id: item.id,
    occurredAt: item.occurredAt,
    mealType: item.mealType as MealRecord["mealType"],
    foods: item.foods.map((food) => food.trim()).filter(Boolean).slice(0, 30),
    notes: item.notes.slice(0, 1000),
  };
}

function asReading(value: unknown): ReadingRecord | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    !isString(item.id) ||
    !validDate(item.occurredAt) ||
    typeof item.value !== "number" ||
    !Number.isInteger(item.value) ||
    item.value < 1 ||
    item.value > 9999 ||
    !isString(item.context) ||
    !(item.context in GLUCOSE_CONTEXTS) ||
    !(item.customContext === null || isString(item.customContext)) ||
    !(item.mealId === null || isString(item.mealId)) ||
    !isString(item.notes)
  ) {
    return null;
  }
  return {
    id: item.id,
    occurredAt: item.occurredAt,
    value: item.value,
    context: item.context as ReadingRecord["context"],
    customContext: item.customContext ? item.customContext.slice(0, 120) : null,
    mealId: item.mealId || null,
    notes: item.notes.slice(0, 1000),
  };
}

export function sanitizeRecords(value: unknown): RecordsResponse | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.meals) || !Array.isArray(raw.readings)) return null;

  const meals = raw.meals.map(asMeal);
  const readings = raw.readings.map(asReading);
  if (meals.some((item) => item === null) || readings.some((item) => item === null)) return null;
  return { meals: meals as MealRecord[], readings: readings as ReadingRecord[] };
}

export function loadDeviceRecords(): RecordsResponse {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { meals: [], readings: [] };
  try {
    return sanitizeRecords(JSON.parse(raw)) ?? { meals: [], readings: [] };
  } catch {
    return { meals: [], readings: [] };
  }
}

export function saveDeviceRecords(records: RecordsResponse) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function makeBackup(records: RecordsResponse): LuizaBackup {
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), records };
}

export function readBackup(value: unknown): RecordsResponse | null {
  if (!value || typeof value !== "object") return null;
  const backup = value as Record<string, unknown>;
  if (backup.version !== BACKUP_VERSION) return null;
  return sanitizeRecords(backup.records);
}

export function createDeviceId() {
  return crypto.randomUUID();
}
