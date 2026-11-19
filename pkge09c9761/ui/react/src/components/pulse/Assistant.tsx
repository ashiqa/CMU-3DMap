import React, { FormEvent, useState } from 'react';
import { Bot, Loader2, Search, Sparkles, X } from 'lucide-react';
import { AssistantReply, CampusPin, LlmStatus } from '@/Interfaces';
import { PIN_SWATCH } from '@/shared/campusTheme';

export const SUGGESTED_QUERIES = [
  'anything interesting related to robotics today?',
  'closest bathroom to Hunt Library 2nd floor',
  'where can I print in colour near Wean?',
  'avoid crowds getting to Gates 5th floor',
  "it's raining, where should I study?",
];

interface CommandBarProps {
  value: string;
  loading: boolean;
  llm: LlmStatus | null;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
}

export function CommandBar({ value, loading, llm, onChange, onSubmit }: CommandBarProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };
  return (
    <form onSubmit={submit} className="cp-glass flex items-center gap-2 px-3 py-1.5" role="search" aria-label="Ask the campus assistant">
      <Sparkles className="size-4 shrink-0 text-[var(--cp-terracotta)]" aria-hidden />
      <label htmlFor="cp-ask" className="sr-only">
        Ask anything about campus
      </label>
      <input
        id="cp-ask"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--cp-ink)] placeholder:text-[var(--cp-muted)] focus:outline-none"
        placeholder="Where to? Try “closest bathroom to Hunt 2nd floor”"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <span className="hidden items-center gap-1 text-[10px] font-semibold text-[var(--cp-muted)] sm:flex" title={llm?.configured ? `LLM: ${llm.model}` : 'Deterministic parser (no LLM key configured)'}>
        <Bot className="size-3.5" /> {llm?.configured ? llm.model : 'local parser'}
      </span>
      <button type="submit" className="cp-btn-primary flex !min-h-8 items-center gap-1 !px-3 text-[12px]" disabled={loading || !value.trim()} aria-label="Ask">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        Ask
      </button>
    </form>
  );
}

export function QuickChips({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
      {SUGGESTED_QUERIES.map((q) => (
        <button key={q} type="button" className="cp-chip !min-h-7 !text-[11px] !font-medium" onClick={() => onPick(q)}>
          {q}
        </button>
      ))}
    </div>
  );
}

interface AssistantSheetProps {
  reply: AssistantReply | null;
  question: string;
  error: string | null;
  loading: boolean;
  onPin: (pin: CampusPin) => void;
  onClose: () => void;
  onPick: (q: string) => void;
}

export function AssistantSheet({ reply, question, error, loading, onPin, onClose, onPick }: AssistantSheetProps) {
  const [showHow, setShowHow] = useState(false);
  return (
    <section className="cp-glass cp-card-in flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-2.5 p-3" aria-live="polite" aria-label="Assistant">
      <header className="flex items-start gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--cp-terracotta)] text-[var(--cp-paper)]">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--cp-muted)]">Campus assistant</p>
          {question ? <p className="truncate text-[12px] italic text-[var(--cp-muted)]">“{question}”</p> : null}
        </div>
        <button type="button" className="cp-btn-secondary !min-h-7 !px-1.5" aria-label="Close assistant" onClick={onClose}>
          <X className="size-4" />
        </button>
      </header>

      {loading ? (
        <p className="flex items-center gap-2 text-[13px] text-[var(--cp-muted)]">
          <Loader2 className="size-4 animate-spin" /> Looking across pins, crowd zones, and the nav graph…
        </p>
      ) : error ? (
        <p className="rounded-md border border-[var(--cp-rust)]/40 bg-[var(--cp-sand)]/30 p-2 text-[12px] text-[var(--cp-rust)]">{error}</p>
      ) : reply ? (
        <>
          <p className="text-[13px] leading-snug text-[var(--cp-ink)]">{reply.text}</p>
          {reply.pins && reply.pins.length ? (
            <ul className="flex flex-col gap-1" aria-label="Matching pins">
              {reply.pins.slice(0, 3).map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md border border-[var(--cp-border)]/40 bg-[var(--cp-paper)] px-2 py-1.5 text-left hover:bg-[var(--cp-sand)]/60" onClick={() => onPin(p)}>
                    <span className={`size-2.5 rounded-full ${PIN_SWATCH[p.kind]}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--cp-ink)]">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-[var(--cp-muted)]">
                      {p.building?.name ?? 'outdoors'}
                      {p.floor ? ` · ${p.floor}F` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="self-start text-[11px] font-semibold text-[var(--cp-sienna)] underline" onClick={() => setShowHow(!showHow)}>
            How this works
          </button>
          {showHow ? (
            <p className="rounded-md bg-[var(--cp-sand)]/35 p-2 text-[11px] leading-snug text-[var(--cp-ink)]">
              <strong>{reply.usedLlm ? 'LLM tool calling' : 'Structured intent parsing'}:</strong> {reply.technique}. Intent <code className="cp-kbd">{reply.intent}</code>. Every answer returns typed map
              actions (fly, open pin, draw route, show forecast, set scenario) that the map executes.
            </p>
          ) : null}
        </>
      ) : (
        <QuickChips onPick={onPick} />
      )}
    </section>
  );
}
