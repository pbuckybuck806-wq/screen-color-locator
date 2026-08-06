"use client";

import { useState } from "react";
import { RegMark, BucketIcon } from "@/components/IconSymbols";
import { ScreenResultCard } from "@/components/ScreenResultCard";
import { ColorResultCard } from "@/components/ColorResultCard";
import { searchScreenByRef, returnScreenByBarcode, checkoutSr, washSr, requestWash } from "@/lib/actions/screens";
import { searchColorByPms, markBucketStatus, addInk, weighBucket } from "@/lib/actions/paint";
import { showToast } from "@/lib/toast";
import type { ScreenSearchResult, ColorSearchResult, BucketStatus } from "@/lib/types";

type Mode = "screens" | "colors";
type Stage =
  | { kind: "placeholder" }
  | { kind: "not-found"; key: string }
  | { kind: "screen"; data: ScreenSearchResult }
  | { kind: "color"; data: ColorSearchResult };

const LEGEND: Record<Mode, [string, string][]> = {
  screens: [
    ["var(--orange)", "On shelf"],
    ["var(--magenta)", "In production"],
    ["var(--yellow)", "Due for wash"],
  ],
  colors: [
    ["var(--good)", "Available"],
    ["var(--cyan)", "In use"],
    ["var(--orange)", "Empty"],
  ],
};

export function LocatorApp({
  isTech,
  screenSamples,
  colorSamples,
}: {
  isTech: boolean;
  screenSamples: string[];
  colorSamples: { code: string; hex: string }[];
}) {
  const [mode, setModeState] = useState<Mode>("screens");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "placeholder" });
  const [stageKey, setStageKey] = useState(0);
  const [busy, setBusy] = useState(false);

  function setMode(m: Mode) {
    setModeState(m);
    setQuery("");
    setStage({ kind: "placeholder" });
    setStageKey((k) => k + 1);
  }

  async function runSearch(raw?: string) {
    const value = (raw ?? query).trim();
    if (!value) return;
    setBusy(true);
    try {
      if (mode === "screens") {
        const data = await searchScreenByRef(value);
        setStage(data ? { kind: "screen", data } : { kind: "not-found", key: value.toUpperCase() });
      } else {
        const data = await searchColorByPms(value);
        setStage(data ? { kind: "color", data } : { kind: "not-found", key: value.toUpperCase() });
      }
      setStageKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  function fillSearch(v: string) {
    setQuery(v);
    runSearch(v);
  }

  async function handleCheckout(srId: number) {
    if (stage.kind !== "screen") return;
    setBusy(true);
    const res = await checkoutSr(srId);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else setStage({ kind: "screen", data: res.data });
  }

  async function handleReturn(barcode: string) {
    if (stage.kind !== "screen") return;
    setBusy(true);
    const res = await returnScreenByBarcode(stage.data.screenId, barcode);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else {
      setStage({ kind: "screen", data: res.data });
      showToast("Screen returned to shelf.");
    }
  }

  async function handleWashSr(srId: number, tag: "washed" | "decommissioned", reason?: string) {
    setBusy(true);
    const res = await washSr(srId, tag, reason);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else if (res.data) {
      setStage({ kind: "screen", data: res.data });
      showToast(`Reference tagged ${tag}.`);
    } else {
      setStage({ kind: "placeholder" });
      setStageKey((k) => k + 1);
      showToast(`Reference tagged ${tag}.`);
    }
  }

  async function handleRequestWash(srId: number) {
    if (stage.kind !== "screen") return;
    setBusy(true);
    const res = await requestWash(srId);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else {
      if (res.data) setStage({ kind: "screen", data: res.data });
      showToast("Queued for wash.");
    }
  }

  async function handleMark(bucketId: number, status: BucketStatus) {
    if (stage.kind !== "color") return;
    setBusy(true);
    const res = await markBucketStatus(bucketId, status);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else setStage({ kind: "color", data: res.data });
  }

  async function handleAddInk(bucketId: number, grams: number) {
    if (stage.kind !== "color") return;
    setBusy(true);
    const res = await addInk(bucketId, grams);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else {
      setStage({ kind: "color", data: res.data });
      showToast(`Added ${grams}g.`);
    }
  }

  async function handleWeigh(bucketId: number, measuredWeight: number) {
    if (stage.kind !== "color") return;
    setBusy(true);
    const res = await weighBucket(bucketId, measuredWeight);
    setBusy(false);
    if (!res.ok) showToast(res.error);
    else {
      setStage({ kind: "color", data: res.data });
      showToast(`Weight logged — level updated.`);
    }
  }

  const stageClassName =
    stage.kind === "screen" ? "result-stage sa-squeegee" : stage.kind === "color" ? "result-stage splashing" : "result-stage";

  return (
    <section id="locator" className="view">
      <div className="wrap">
        <div className="loc-head">
          <div>
            <p className="eyebrow">Operator · No Login Needed</p>
            <h1 className="title">{mode === "screens" ? "Find a screen" : "Find a paint color"}</h1>
          </div>
          <div className="status-legend">
            {LEGEND[mode].map(([c, t]) => (
              <span key={t}>
                <i className="dot" style={{ background: c }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="seg">
          <button className={mode === "screens" ? "on" : ""} onClick={() => setMode("screens")}>
            <RegMark className="ic" />
            Screens
          </button>
          <button className={mode === "colors" ? "on" : ""} onClick={() => setMode("colors")}>
            <BucketIcon className="ic" />
            Paint &amp; Colors
          </button>
        </div>

        <div className="search-shell">
          <span>{mode === "screens" ? <RegMark style={{ width: 22, height: 22, color: "var(--mist)" }} /> : <BucketIcon style={{ width: 22, height: 22, color: "var(--mist)" }} />}</span>
          <input
            autoComplete="off"
            value={query}
            placeholder={mode === "screens" ? "Enter Separation Reference…  e.g. SR-4521" : "Enter PMS code…  e.g. PMS-021"}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <button className="btn-find" onClick={() => runSearch()} disabled={busy}>
            Locate
          </button>
        </div>

        {mode === "screens" && screenSamples.length > 0 && (
          <div className="samples">
            <b>Try:</b>
            {screenSamples.map((code) => (
              <button className="chip" key={code} onClick={() => fillSearch(code)}>
                {code}
              </button>
            ))}
          </div>
        )}
        {mode === "colors" && colorSamples.length > 0 && (
          <div className="samples">
            <b>Try:</b>
            {colorSamples.map((c) => (
              <button className="chip" key={c.code} onClick={() => fillSearch(c.code)}>
                <span className="sw" style={{ background: c.hex }} />
                {c.code}
              </button>
            ))}
          </div>
        )}

        <div className={stageClassName} key={stageKey}>
          {stage.kind === "placeholder" && (
            <div className="placeholder">
              <RegMark style={{ color: "var(--cyan)" }} />
              <p>{mode === "screens" ? "Enter a reference above to locate its screen." : "Enter a PMS code above to locate its bucket."}</p>
            </div>
          )}
          {stage.kind === "not-found" && (
            <div className="placeholder">
              {mode === "screens" ? <RegMark style={{ color: "var(--orange)" }} /> : <BucketIcon style={{ color: "var(--orange)" }} />}
              <p>
                {mode === "screens" ? (
                  <>
                    No active reference <b className="code" style={{ color: "var(--paper)" }}>{stage.key}</b>{" "}
                    found. Check the reference, or ask the tech who shot it.
                  </>
                ) : (
                  <>
                    No color logged under <b className="code" style={{ color: "var(--paper)" }}>{stage.key}</b>{" "}
                    yet. If you&apos;re holding it, ask a tech to log it.
                  </>
                )}
              </p>
            </div>
          )}
          {stage.kind === "screen" && (
            <>
              <div className="squeegee" />
              <ScreenResultCard
                result={stage.data}
                isTech={isTech}
                onCheckout={handleCheckout}
                onReturn={handleReturn}
                onWashSr={handleWashSr}
                onRequestWash={handleRequestWash}
                busy={busy}
              />
            </>
          )}
          {stage.kind === "color" && <ColorResultCard result={stage.data} onMark={handleMark} onAddInk={handleAddInk} onWeigh={handleWeigh} busy={busy} />}
        </div>
      </div>
    </section>
  );
}
