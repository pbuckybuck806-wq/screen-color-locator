"use client";

import { useEffect, useRef, useState } from "react";
import { TOAST_EVENT } from "@/lib/toast";

export function ToastHost() {
  const [message, setMessage] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setMessage(detail);
      setOn(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setOn(false), 2200);
    }
    window.addEventListener(TOAST_EVENT, handle);
    return () => window.removeEventListener(TOAST_EVENT, handle);
  }, []);

  return (
    <div className={`toast${on ? " on" : ""}`} role="status">
      {message}
    </div>
  );
}
