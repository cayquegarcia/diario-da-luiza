"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  FileDown,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  contextLabel,
  findFoodPatterns,
  GLUCOSE_CONTEXTS,
  MEAL_TYPES,
  type GlucoseContext,
  type MealRecord,
  type RecordsResponse,
} from "@/lib/records";

type EntryDialog = "glucose" | "meal" | null;
type Period = "7d" | "30d" | "month" | "all";
type DeleteTarget = { id: string; type: "meal" | "reading"; label: string } | null;

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function monthValue(date = new Date()) {
  return localDateTimeValue(date).slice(0, 7);
}

function rangeFor(period: Period, month: string) {
  if (period === "all") return {};
  const end = new Date();
  if (period === "month") {
    const [year, monthIndex] = month.split("-").map(Number);
    if (!year || !monthIndex) return {};
    return {
      start: new Date(year, monthIndex - 1, 1).toISOString(),
      end: new Date(year, monthIndex, 1).toISOString(),
    };
  }
  const days = period === "7d" ? 7 : 30;
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function periodLabel(period: Period, month: string) {
  if (period === "7d") return "Últimos 7 dias";
  if (period === "30d") return "Últimos 30 dias";
  if (period === "all") return "Todo o histórico";
  const [year, monthIndex] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthIndex - 1, 1),
  );
}

async function responseError(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || "Não foi possível concluir a operação.";
  } catch {
    return "Não foi possível concluir a operação.";
  }
}

export function LuizaDashboard() {
  const [dialog, setDialog] = useState<EntryDialog>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [month, setMonth] = useState(monthValue());
  const [records, setRecords] = useState<RecordsResponse>({ meals: [], readings: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams(rangeFor(period, month));
      const response = await fetch(`/api/records?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      setRecords((await response.json()) as RecordsResponse);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os registros.");
    } finally {
      setLoading(false);
    }
  }, [month, period]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchRecords(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchRecords]);

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    };

    register({
      name: "registrar_glicose",
      title: "Registrar glicose",
      description: "Registra uma medição de glicose da Luiza e atualiza o histórico visível.",
      inputSchema: {
        type: "object",
        properties: {
          value: { type: "integer", minimum: 1, description: "Valor em mg/dL" },
          occurredAt: { type: "string", description: "Data e hora em formato ISO" },
          context: { type: "string", enum: Object.keys(GLUCOSE_CONTEXTS) },
          customContext: { type: "string" },
          mealId: { type: "string" },
          notes: { type: "string" },
        },
        required: ["value", "occurredAt", "context"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const response = await fetch("/api/records", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "reading", ...(input as object) }),
        });
        if (!response.ok) throw new Error(await responseError(response));
        await fetchRecords();
        return { status: "registrado" };
      },
    });
    register({
      name: "registrar_refeicao",
      title: "Registrar refeição",
      description: "Registra uma refeição da Luiza e atualiza o histórico visível.",
      inputSchema: {
        type: "object",
        properties: {
          occurredAt: { type: "string", description: "Data e hora em formato ISO" },
          mealType: { type: "string", enum: Object.keys(MEAL_TYPES) },
          foods: { type: "array", items: { type: "string" }, minItems: 1 },
          notes: { type: "string" },
        },
        required: ["occurredAt", "mealType", "foods"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const response = await fetch("/api/records", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "meal", ...(input as object) }),
        });
        if (!response.ok) throw new Error(await responseError(response));
        await fetchRecords();
        return { status: "registrada" };
      },
    });
    return () => lifecycle.abort();
  }, [fetchRecords]);

  const patterns = useMemo(
    () => findFoodPatterns(records.meals, records.readings),
    [records.meals, records.readings],
  );

  const timeline = useMemo(() => {
    const mealItems = records.meals.map((item) => ({ ...item, kind: "meal" as const }));
    const readingItems = records.readings.map((item) => ({ ...item, kind: "reading" as const }));
    return [...mealItems, ...readingItems].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [records]);

  async function removeRecord() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const params = new URLSearchParams({ id: deleteTarget.id, type: deleteTarget.type });
      const response = await fetch(`/api/records?${params}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setDeleteTarget(null);
      setNotice("Registro excluído.");
      await fetchRecords();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setDeleting(false);
    }
  }

  async function generatePdf() {
    if (timeline.length === 0) {
      setNotice("Não há registros neste período para incluir no PDF.");
      return;
    }
    setNotice("Preparando o PDF…");
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const left = 16;
      const width = 178;
      let y = 18;

      const addText = (text: string, size = 10, bold = false, gap = 5) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, width) as string[];
        const lineHeight = size * 0.42;
        if (y + lines.length * lineHeight > 281) {
          doc.addPage();
          y = 18;
        }
        doc.text(lines, left, y);
        y += lines.length * lineHeight + gap;
      };

      doc.setTextColor(31, 73, 104);
      addText("Diário da Luiza", 20, true, 2);
      doc.setTextColor(70, 89, 103);
      addText(`Glicose e alimentação • ${periodLabel(period, month)}`, 11, false, 8);
      doc.setTextColor(20, 34, 51);
      addText(`${records.readings.length} medições • ${records.meals.length} refeições registradas`, 11, true, 8);

      addText("Possíveis padrões observados", 14, true, 4);
      if (patterns.length === 0) {
        addText("Ainda não há três ou mais comparações suficientes do mesmo alimento e horário para sugerir um padrão.");
      } else {
        for (const pattern of patterns) {
          const timing = pattern.context === "post_1h" ? "após 1 hora" : "após 2 horas";
          addText(
            `• ${pattern.food}: o valor foi maior em ${pattern.increases} de ${pattern.comparisons} comparações ${timing}; variação média observada de ${pattern.averageDelta > 0 ? "+" : ""}${pattern.averageDelta} mg/dL.`,
          );
        }
      }
      doc.setTextColor(92, 103, 112);
      addText(
        "Estes padrões são associações automáticas dos registros. Não comprovam causa, não representam diagnóstico ou recomendação e não substituem a avaliação médica. Outros alimentos, quantidades, medicamentos, atividade física e horários também podem influenciar.",
        8,
        false,
        8,
      );
      doc.setTextColor(20, 34, 51);
      addText("Registros", 14, true, 4);

      for (const item of timeline) {
        if (item.kind === "reading") {
          addText(
            `${dateTimeFormatter.format(new Date(item.occurredAt))} • Glicose: ${item.value} mg/dL • ${contextLabel(item)}${item.notes ? ` • ${item.notes}` : ""}`,
            9,
          );
        } else {
          addText(
            `${dateTimeFormatter.format(new Date(item.occurredAt))} • ${MEAL_TYPES[item.mealType] ?? "Refeição"}: ${item.foods.join(", ")}${item.notes ? ` • ${item.notes}` : ""}`,
            9,
          );
        }
      }

      const filename = `diario-luiza-${new Date().toISOString().slice(0, 10)}.pdf`;
      const blob = doc.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ title: "Diário da Luiza", text: "Relatório de glicose e alimentação", files: [file] });
        setNotice("PDF pronto para compartilhar.");
      } else {
        doc.save(filename);
        setNotice("PDF baixado. Agora você pode anexá-lo no WhatsApp.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setNotice("Compartilhamento cancelado. Nenhum dado foi alterado.");
      } else {
        setNotice("Não foi possível gerar o PDF agora.");
      }
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Activity className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">Diário da Luiza</p>
              <p className="font-semibold tracking-tight">Glicose & alimentação</p>
            </div>
          </div>
          <Button variant="outline" className="rounded-xl border-primary/20" onClick={() => void generatePdf()}>
            <FileText aria-hidden="true" />
            <span className="hidden sm:inline">Gerar PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-10">
        <section className="min-w-0">
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
                <CalendarDays className="size-4" aria-hidden="true" />
                {periodLabel(period, month)}
              </p>
              <h1 className="text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Como foi o seu dia?</h1>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="group flex min-h-28 items-center gap-4 rounded-3xl bg-primary p-5 text-left text-primary-foreground shadow-[0_12px_32px_rgba(36,72,113,0.18)] transition hover:-translate-y-0.5"
              onClick={() => setDialog("glucose")}
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-white/14"><Plus className="size-6" aria-hidden="true" /></span>
              <span><span className="block text-lg font-bold">Registrar glicose</span><span className="mt-1 block text-sm text-primary-foreground/75">Valor, horário e contexto</span></span>
            </button>
            <button
              className="group flex min-h-28 items-center gap-4 rounded-3xl border border-secondary bg-secondary p-5 text-left text-secondary-foreground transition hover:-translate-y-0.5"
              onClick={() => setDialog("meal")}
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-white/80 text-primary"><Utensils className="size-5" aria-hidden="true" /></span>
              <span><span className="block text-lg font-bold">Registrar refeição</span><span className="mt-1 block text-sm text-muted-foreground">Escreva ou dite os alimentos</span></span>
            </button>
          </div>

          <section className="mt-8 rounded-2xl border border-border bg-white p-3 shadow-sm" aria-label="Filtrar registros">
            <div className="flex flex-wrap items-center gap-2">
              {(["7d", "30d", "all"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={period === value ? "default" : "ghost"}
                  className="rounded-xl"
                  onClick={() => setPeriod(value)}
                >
                  {value === "7d" ? "7 dias" : value === "30d" ? "30 dias" : "Tudo"}
                </Button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="month-filter" className="sr-only">Escolher mês</Label>
                <Input
                  id="month-filter"
                  type="month"
                  value={month}
                  onChange={(event) => { setMonth(event.target.value); setPeriod("month"); }}
                  className={`h-9 w-[10.5rem] rounded-xl ${period === "month" ? "border-primary ring-2 ring-primary/10" : ""}`}
                />
              </div>
            </div>
          </section>

          {notice && (
            <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground" role="status">
              <span>{notice}</span>
              <button className="font-bold" aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button>
            </div>
          )}

          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Seus registros</h2>
                {!loading && !loadError && <p className="mt-1 text-sm text-muted-foreground">{records.readings.length} medições e {records.meals.length} refeições</p>}
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Atualizar registros" onClick={() => void fetchRecords()}>
                <RefreshCw className={loading ? "animate-spin" : ""} />
              </Button>
            </div>

            {loading ? (
              <div className="grid min-h-48 place-items-center rounded-3xl border border-border bg-white"><LoaderCircle className="size-6 animate-spin text-primary" aria-label="Carregando" /></div>
            ) : loadError ? (
              <div className="rounded-3xl border border-destructive/25 bg-white px-6 py-10 text-center">
                <p className="font-bold text-destructive">Não foi possível abrir o histórico</p>
                <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
                <Button className="mt-5 rounded-xl" onClick={() => void fetchRecords()}>Tentar novamente</Button>
              </div>
            ) : timeline.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-white px-6 py-14 text-center">
                <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><Activity className="size-5" aria-hidden="true" /></div>
                <h3 className="font-bold">Nenhum registro neste período</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Registre uma refeição ou uma medição de glicose para começar a montar sua linha do tempo.</p>
              </div>
            ) : (
              <div className="space-y-5">
                {timeline.map((item, index) => {
                  const day = dayFormatter.format(new Date(item.occurredAt));
                  const previousDay = index > 0 ? dayFormatter.format(new Date(timeline[index - 1].occurredAt)) : "";
                  return (
                    <div key={`${item.kind}-${item.id}`}>
                      {day !== previousDay && <h3 className="mb-2 capitalize text-sm font-bold text-muted-foreground">{day}</h3>}
                      <article className="group flex items-start gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
                        <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.kind === "reading" ? "bg-primary text-white" : "bg-secondary text-secondary-foreground"}`}>
                          {item.kind === "reading" ? <Activity className="size-4" /> : <Utensils className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h4 className="font-bold">
                              {item.kind === "reading" ? `${item.value} mg/dL` : MEAL_TYPES[item.mealType] ?? "Refeição"}
                            </h4>
                            <time className="text-xs font-semibold text-muted-foreground">{dateTimeFormatter.format(new Date(item.occurredAt)).slice(11)}</time>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {item.kind === "reading" ? contextLabel(item) : item.foods.join(", ")}
                          </p>
                          {item.notes && <p className="mt-2 text-sm leading-6">{item.notes}</p>}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="Excluir registro"
                          onClick={() => setDeleteTarget({ id: item.id, type: item.kind, label: item.kind === "reading" ? `${item.value} mg/dL` : item.foods.join(", ") })}
                        >
                          <Trash2 />
                        </Button>
                      </article>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <section className="overflow-hidden rounded-3xl border border-border bg-white shadow-sm">
            <div className="border-b border-border bg-[linear-gradient(135deg,#edf6f5,#f7fbfb)] p-5">
              <div className="mb-3 flex items-center gap-2 text-primary"><Sparkles className="size-4" aria-hidden="true" /><h2 className="text-sm font-bold uppercase tracking-[0.12em]">Possíveis padrões</h2></div>
              {patterns.length === 0 ? (
                <p className="text-sm leading-6 text-muted-foreground">São necessárias pelo menos 3 comparações do mesmo alimento, com uma medição antes e outra 1 ou 2 horas depois da refeição.</p>
              ) : (
                <div className="space-y-3">
                  {patterns.slice(0, 4).map((pattern) => (
                    <div key={`${pattern.food}-${pattern.context}`} className="rounded-2xl bg-white/80 p-3">
                      <p className="font-bold">{pattern.food}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        Valor maior em {pattern.increases} de {pattern.comparisons} comparações {pattern.context === "post_1h" ? "após 1 hora" : "após 2 horas"}. Média observada: {pattern.averageDelta > 0 ? "+" : ""}{pattern.averageDelta} mg/dL.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 text-sm leading-6 text-muted-foreground">São associações dos registros, não prova de causa, diagnóstico ou recomendação médica. Outros fatores também podem influenciar.</div>
          </section>

          <section className="rounded-3xl bg-ink p-5 text-white shadow-[0_16px_38px_rgba(21,42,65,0.16)]">
            <FileDown className="mb-7 size-5 text-aqua" aria-hidden="true" />
            <h2 className="text-lg font-bold">Relatório para a médica</h2>
            <p className="mt-2 text-sm leading-6 text-white/68">O PDF usa apenas o período selecionado e inclui os registros e as possíveis associações observadas.</p>
            <Button className="mt-5 w-full rounded-xl bg-white text-ink hover:bg-white/90" onClick={() => void generatePdf()}>Gerar e compartilhar PDF</Button>
          </section>
        </aside>
      </div>

      <EntryFormDialog
        kind={dialog}
        meals={records.meals}
        onClose={() => setDialog(null)}
        onSaved={async (message) => { setDialog(null); setNotice(message); await fetchRecords(); }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.label}. Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void removeRecord()}>
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function EntryFormDialog({
  kind,
  meals,
  onClose,
  onSaved,
}: {
  kind: EntryDialog;
  meals: MealRecord[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [glucoseContext, setGlucoseContext] = useState<GlucoseContext>("fasting");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const occurredAtValue = String(form.get("occurredAt") || "");
      const occurredAt = new Date(occurredAtValue).toISOString();
      const payload = kind === "glucose"
        ? {
            type: "reading",
            value: Number(form.get("value")),
            occurredAt,
            context: form.get("context"),
            customContext: form.get("customContext"),
            mealId: form.get("mealId"),
            notes: form.get("notes"),
          }
        : {
            type: "meal",
            occurredAt,
            mealType: form.get("mealType"),
            foods: String(form.get("foods") || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
            notes: form.get("notes"),
          };
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await onSaved(kind === "glucose" ? "Medição registrada." : "Refeição registrada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind === "glucose" ? "Registrar glicose" : "Registrar refeição"}</DialogTitle>
          <DialogDescription>
            {kind === "glucose"
              ? "Informe o valor em mg/dL e o contexto. Associe uma refeição quando for uma medição antes ou depois de comer."
              : "Separe os alimentos por vírgulas. Você também pode usar o microfone do teclado do celular para ditar."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          {kind === "glucose" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="glucose-value">Glicose em mg/dL</Label>
                <Input id="glucose-value" name="value" type="number" inputMode="numeric" min="1" max="9999" required placeholder="Ex.: 118" className="h-12 rounded-xl text-lg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="glucose-context">Contexto</Label>
                <NativeSelect id="glucose-context" name="context" value={glucoseContext} onChange={(event) => setGlucoseContext(event.target.value as GlucoseContext)} className="h-12 w-full rounded-xl">
                  {Object.entries(GLUCOSE_CONTEXTS).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              {glucoseContext === "other" && (
                <div className="space-y-2">
                  <Label htmlFor="custom-context">Descreva o contexto</Label>
                  <Input id="custom-context" name="customContext" required maxLength={120} className="h-12 rounded-xl" placeholder="Ex.: depois da caminhada" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="meal-link">Refeição relacionada <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <NativeSelect id="meal-link" name="mealId" className="h-12 w-full rounded-xl">
                  <NativeSelectOption value="">Nenhuma</NativeSelectOption>
                  {meals.slice(0, 12).map((meal) => (
                    <NativeSelectOption key={meal.id} value={meal.id}>{dateTimeFormatter.format(new Date(meal.occurredAt))} — {meal.foods.slice(0, 2).join(", ")}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <p className="text-xs leading-5 text-muted-foreground">A associação permite comparar medições antes e depois da mesma refeição.</p>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="meal-type">Tipo de refeição</Label>
                <NativeSelect id="meal-type" name="mealType" defaultValue="breakfast" className="h-12 w-full rounded-xl">
                  {Object.entries(MEAL_TYPES).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="foods">O que comeu?</Label>
                <Textarea id="foods" name="foods" required rows={3} className="rounded-xl text-base" placeholder="Ex.: pão francês, ovo, café com leite" />
                <p className="text-xs leading-5 text-muted-foreground">Use o mesmo nome nas próximas vezes para facilitar as comparações automáticas.</p>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor={`${kind}-occurred-at`}>Data e hora</Label>
            <Input id={`${kind}-occurred-at`} name="occurredAt" type="datetime-local" required defaultValue={localDateTimeValue()} className="h-12 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${kind}-notes`}>Observações <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id={`${kind}-notes`} name="notes" rows={2} maxLength={1000} className="rounded-xl" placeholder="Medicamentos, atividade física, quantidade ou algo importante" />
          </div>
          {error && <p className="rounded-xl bg-destructive/8 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar registro"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
