import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { glucoseReadings, meals } from "@/db/schema";
import { GLUCOSE_CONTEXTS, MEAL_TYPES } from "@/lib/records";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function safeFoods(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function validIsoDate(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Acesso não autorizado.", 401);

  try {
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const dateConditions = [eq(meals.ownerId, user.userId)];
    const readingConditions = [eq(glucoseReadings.ownerId, user.userId)];
    if (start && validIsoDate(start)) {
      dateConditions.push(gte(meals.occurredAt, start));
      readingConditions.push(gte(glucoseReadings.occurredAt, start));
    }
    if (end && validIsoDate(end)) {
      dateConditions.push(lte(meals.occurredAt, end));
      readingConditions.push(lte(glucoseReadings.occurredAt, end));
    }

    const db = getDb();
    const [mealRows, readingRows] = await Promise.all([
      db.select().from(meals).where(and(...dateConditions)).orderBy(desc(meals.occurredAt)),
      db.select().from(glucoseReadings).where(and(...readingConditions)).orderBy(desc(glucoseReadings.occurredAt)),
    ]);

    return Response.json({
      meals: mealRows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt,
        mealType: row.mealType,
        foods: safeFoods(row.foodsJson),
        notes: row.notes,
      })),
      readings: readingRows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt,
        value: row.value,
        context: row.context,
        customContext: row.customContext,
        mealId: row.mealId,
        notes: row.notes,
      })),
    });
  } catch (error) {
    console.error("records.get", error);
    return jsonError("Não foi possível carregar os registros agora.", 500);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Acesso não autorizado.", 401);

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const db = getDb();
    const id = crypto.randomUUID();

    if (payload.type === "meal") {
      const occurredAt = payload.occurredAt;
      const mealType = typeof payload.mealType === "string" ? payload.mealType : "";
      const foods = Array.isArray(payload.foods)
        ? payload.foods.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
        : [];
      const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, 1000) : "";
      if (!validIsoDate(occurredAt) || !(mealType in MEAL_TYPES) || foods.length === 0) {
        return jsonError("Confira a data, o tipo de refeição e os alimentos.", 400);
      }
      await db.insert(meals).values({
        id,
        ownerId: user.userId,
        occurredAt,
        mealType,
        foodsJson: JSON.stringify(foods),
        notes,
      });
      return Response.json({ id }, { status: 201 });
    }

    if (payload.type === "reading") {
      const occurredAt = payload.occurredAt;
      const context = typeof payload.context === "string" ? payload.context : "";
      const value = Number(payload.value);
      const customContext = typeof payload.customContext === "string" ? payload.customContext.trim().slice(0, 120) : "";
      const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, 1000) : "";
      const mealId = typeof payload.mealId === "string" && payload.mealId ? payload.mealId : null;

      if (!validIsoDate(occurredAt) || !(context in GLUCOSE_CONTEXTS) || !Number.isInteger(value) || value <= 0 || value > 9999) {
        return jsonError("Confira o valor, a data e o contexto da medição.", 400);
      }
      if (context === "other" && !customContext) {
        return jsonError("Descreva o contexto personalizado.", 400);
      }
      if (mealId) {
        const [ownedMeal] = await db
          .select({ id: meals.id })
          .from(meals)
          .where(and(eq(meals.id, mealId), eq(meals.ownerId, user.userId)))
          .limit(1);
        if (!ownedMeal) return jsonError("A refeição escolhida não foi encontrada.", 400);
      }

      await db.insert(glucoseReadings).values({
        id,
        ownerId: user.userId,
        occurredAt,
        value,
        context,
        customContext: context === "other" ? customContext : null,
        mealId,
        notes,
      });
      return Response.json({ id }, { status: 201 });
    }

    return jsonError("Tipo de registro inválido.", 400);
  } catch (error) {
    console.error("records.post", error);
    return jsonError("Não foi possível salvar. Seus dados no formulário foram preservados.", 500);
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Acesso não autorizado.", 401);

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type");
    if (!id || (type !== "meal" && type !== "reading")) return jsonError("Registro inválido.", 400);
    const db = getDb();
    if (type === "meal") {
      await db.delete(meals).where(and(eq(meals.id, id), eq(meals.ownerId, user.userId)));
    } else {
      await db.delete(glucoseReadings).where(and(eq(glucoseReadings.id, id), eq(glucoseReadings.ownerId, user.userId)));
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("records.delete", error);
    return jsonError("Não foi possível excluir o registro agora.", 500);
  }
}
