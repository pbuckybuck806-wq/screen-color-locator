"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FloorDiveOverlay } from "@/components/FloorDiveOverlay";
import { showToast } from "@/lib/toast";

export default function HubPage() {
  const router = useRouter();
  const [diving, setDiving] = useState(false);

  function openLocator() {
    if (diving) return;
    setDiving(true);
    setTimeout(() => router.push("/locator"), 1580);
  }

  function openPackage() {
    const url = process.env.NEXT_PUBLIC_PACKAGE_HELP_DESK_URL;
    if (url) {
      window.location.href = url;
      return;
    }
    showToast("🚚 Package Help Desk isn't connected in this build yet.");
  }

  return (
    <section id="hub" className="view">
      <div className="hub-stage">
        <div className="hub-inner">
          <div className="hub-lead">
            <p className="eyebrow">Production and Inbound</p>
            <h1 className="title">
              Pick your <em>workstation</em>
            </h1>
            <p>Track a package through the Distribution Center, or find any screen — and any bucket of ink — on the floor in seconds.</p>
          </div>
          <div className="app-grid">
            <button className="app-tile locator" onClick={openLocator}>
              <div className="plate" />
              <div className="idx">01 / SCREENS &amp; COLORS</div>
              <div className="swatches">
                <i style={{ background: "var(--cyan)" }} />
                <i style={{ background: "var(--magenta)" }} />
                <i style={{ background: "var(--yellow)" }} />
                <i style={{ background: "var(--orange)" }} />
              </div>
              <h3>
                Screen &amp; Color <span className="accent">Locator</span>
              </h3>
              <p>Find a screen by Separation Reference, or a paint bucket by PMS code — with live location and status.</p>
              <span className="go">
                Open locator <span className="arr">→</span>
              </span>
            </button>
            <button className="app-tile pkg" onClick={openPackage}>
              <div className="plate" />
              <div className="idx">02 / PACKAGES</div>
              <h3>
                Package <span className="accent">Help Desk</span>
              </h3>
              <p>Track inbound and outbound packages, redirects, and hand-offs across the shop.</p>
              <span className="go">
                Open help desk <span className="arr">→</span>
              </span>
            </button>
          </div>
        </div>
      </div>
      <FloorDiveOverlay active={diving} />
    </section>
  );
}
