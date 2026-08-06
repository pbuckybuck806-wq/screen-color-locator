export function FloorDiveOverlay({ active }: { active: boolean }) {
  return (
    <div className={`floor-dive${active ? " on" : ""}`} aria-hidden={!active}>
      <div className="fd-img" style={{ backgroundImage: "url(/floor-dive.jpg)" }} />
      <div className="fd-vignette" />
      <div className="fd-cap">Entering the floor…</div>
    </div>
  );
}
