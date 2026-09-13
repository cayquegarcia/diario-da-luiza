export const GLUCOSE_CONTEXTS = {
  fasting: "Em jejum",
  pre_meal: "Antes da refeição",
  post_1h: "1 hora após a refeição",
  post_2h: "2 horas após a refeição",
  bedtime: "Antes de dormir",
  other: "Outro",
} as const;

export const MEAL_TYPES = {
  breakfast: "Café da manhã",
  snack: "Lanche",
  lunch: "Almoço",
  dinner: "Jantar",
  other: "Outra refeição",
} as const;

export type GlucoseContext = keyof typeof GLUCOSE_CONTEXTS;
export type MealType = keyof typeof MEAL_TYPES;

export type MealRecord = {
  id: string;
  occurredAt: string;
  mealType: MealType;
  foods: string[];
  notes: string;
};

export type ReadingRecord = {
  id: string;
  occurredAt: string;
  value: number;
  context: GlucoseContext;
  customContext: string | null;
  mealId: string | null;
  notes: string;
};

export type RecordsResponse = {
  meals: MealRecord[];
  readings: ReadingRecord[];
};

export type FoodPattern = {
  food: string;
  context: "post_1h" | "post_2h";
  comparisons: number;
  increases: number;
  averageDelta: number;
};

export function contextLabel(reading: Pick<ReadingRecord, "context" | "customContext">) {
  return reading.context === "other"
    ? reading.customContext || GLUCOSE_CONTEXTS.other
    : GLUCOSE_CONTEXTS[reading.context];
}

export function normalizeFood(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

export function findFoodPatterns(meals: MealRecord[], readings: ReadingRecord[]): FoodPattern[] {
  const byMeal = new Map<string, ReadingRecord[]>();
  for (const reading of readings) {
    if (!reading.mealId) continue;
    const current = byMeal.get(reading.mealId) ?? [];
    current.push(reading);
    byMeal.set(reading.mealId, current);
  }

  const groups = new Map<string, { food: string; context: "post_1h" | "post_2h"; deltas: number[] }>();
  for (const meal of meals) {
    const linked = byMeal.get(meal.id) ?? [];
    const before = linked
      .filter((item) => item.context === "pre_meal")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
    if (!before) continue;

    for (const context of ["post_1h", "post_2h"] as const) {
      const after = linked
        .filter((item) => item.context === context)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))[0];
      if (!after) continue;
      const delta = after.value - before.value;
      for (const food of meal.foods) {
        const normalized = normalizeFood(food);
        if (!normalized) continue;
        const key = `${normalized}|${context}`;
        const group = groups.get(key) ?? { food, context, deltas: [] };
        group.deltas.push(delta);
        groups.set(key, group);
      }
    }
  }

  return [...groups.values()]
    .filter((group) => group.deltas.length >= 3)
    .map((group) => ({
      food: group.food,
      context: group.context,
      comparisons: group.deltas.length,
      increases: group.deltas.filter((delta) => delta > 0).length,
      averageDelta: Math.round(group.deltas.reduce((sum, delta) => sum + delta, 0) / group.deltas.length),
    }))
    .filter((pattern) => pattern.increases > pattern.comparisons / 2)
    .sort((a, b) => b.comparisons - a.comparisons || b.averageDelta - a.averageDelta);
}
