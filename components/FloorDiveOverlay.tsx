// Holds at full opacity for as long as `active` is true — see globals.css:
// there is deliberately no auto-fade timer. Hub stays mounted underneath
// (fully covered) until Next.js finishes navigating to /locator and swaps
// this whole tree out atomically, so the destination never gets exposed
// before it's actually ready no matter how long that takes.
export function FloorDiveOverlay({ active }: { active: boolean }) {
  return (
    <div className={`floor-dive${active ? " on" : ""}`} aria-hidden={!active}>
      <div className="fd-img" style={{ backgroundImage: "url(/floor-dive.jpg)" }} />
      <div className="fd-vignette" />
      <div className="fd-cap">Entering the floor…</div>
    </div>
  );
}
