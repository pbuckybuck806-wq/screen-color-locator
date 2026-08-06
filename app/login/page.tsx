import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <section className="view">
      <div className="auth-shell">
        <p className="eyebrow">Tech / Admin</p>
        <h1 className="title" style={{ fontSize: 32, marginBottom: 24 }}>
          Sign in
        </h1>
        <LoginForm />
      </div>
    </section>
  );
}
