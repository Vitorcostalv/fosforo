"use client";

import { useRef, useState } from "react";
import { BrainPayload, decodeBrainJson, decodeBrainLink, encodeBrainJson, encodeBrainLink } from "@/lib/sim/link";
import { fragmentKind, fragmentValue } from "@/lib/ui/runLink";
import { Icon, PanelTitle } from "./ui";

type Message = { tone: "ok" | "error"; text: string } | null;

/** Aceita JSON, o link inteiro ou só o trecho depois de `#b=`. */
export function parseBrainInput(text: string) {
  const t = text.trim();
  if (t.startsWith("{")) return decodeBrainJson(t);
  const hash = t.includes("#") ? t.slice(t.indexOf("#")) : t.startsWith("b=") ? `#${t}` : `#b=${t}`;
  if (fragmentKind(hash) !== "brain") return decodeBrainLink("");
  return decodeBrainLink(fragmentValue(hash, "b"));
}

export function copyText(text: string): Promise<boolean> {
  return (navigator.clipboard?.writeText(text).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false));
}

export function brainLinkUrl(payload: BrainPayload): string {
  return `${window.location.origin}${window.location.pathname}#b=${encodeBrainLink(payload)}`;
}

/** Exportar e importar o cérebro: link compartilhável, JSON e arquivo. */
export function BrainShare({ payload, onImport }: { payload: BrainPayload | null; onImport: (p: BrainPayload) => void }) {
  const [message, setMessage] = useState<Message>(null);
  const [text, setText] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const copyLink = async (): Promise<void> => {
    if (!payload) return;
    const url = brainLinkUrl(payload);
    if (await copyText(url)) {
      setShown(null);
      setMessage({ tone: "ok", text: "Link copiado. Quem abrir joga contra este pássaro." });
    } else {
      setShown(url);
      setMessage({ tone: "error", text: "Não consegui copiar sozinho. Copie o link abaixo." });
    }
  };

  const download = (): void => {
    if (!payload) return;
    const blob = new Blob([encodeBrainJson(payload)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fosforo-cerebro.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setMessage({ tone: "ok", text: "Arquivo baixado." });
  };

  const load = (input: string): void => {
    const result = parseBrainInput(input);
    if (result.ok) {
      setMessage({ tone: "ok", text: "Cérebro carregado. Jogue contra ele no painel do jogo." });
      setText("");
      onImport(result.value);
    } else {
      setMessage({ tone: "error", text: result.message });
    }
  };

  return (
    <section aria-labelledby="share-title" className="panel">
      <PanelTitle>
        <span id="share-title">Cérebro: exportar e importar</span>
      </PanelTitle>
      <div className="grid gap-3 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={!payload} onClick={copyLink}>
            <Icon name="link" /> Copiar link
          </button>
          <button type="button" className="btn" disabled={!payload} onClick={download}>
            <Icon name="download" /> Baixar JSON
          </button>
        </div>
        {!payload ? <p className="text-xs text-muted">Disponível depois da primeira geração.</p> : null}
        {shown ? <input readOnly aria-label="Link do cérebro" className="num min-h-9 w-full border border-line bg-ground px-2 text-xs" value={shown} onFocus={(e) => e.currentTarget.select()} /> : null}

        <div>
          <label htmlFor="brain-import" className="label">
            Importar link ou JSON
          </label>
          <textarea
            id="brain-import"
            className="num mt-1 min-h-16 w-full resize-y border border-line bg-ground p-2 text-xs text-ink"
            value={text}
            spellCheck={false}
            placeholder="Cole aqui o link (#b=...) ou o JSON"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={text.trim() === ""} onClick={() => load(text)}>
              <Icon name="upload" /> Carregar
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Abrir arquivo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Abrir arquivo de cérebro (.json)"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 100_000) {
                  setMessage({ tone: "error", text: "Arquivo grande demais para ser um cérebro." });
                  return;
                }
                load(await file.text());
              }}
            />
          </div>
        </div>
        <p role="status" aria-live="polite" className={`min-h-5 text-sm ${message?.tone === "error" ? "text-bad" : "text-ok"}`}>
          {message?.text}
        </p>
      </div>
    </section>
  );
}
