"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);

  return (
    <form action={formAction} className="auth-card">
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required autoComplete="username" />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" required autoComplete="current-password" />
      <button className="btn-find" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state?.error && <p className="auth-error">{state.error}</p>}
    </form>
  );
}
