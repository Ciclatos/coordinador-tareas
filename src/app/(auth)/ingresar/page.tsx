import { AuthForm } from "@/components/AuthForm";
export default function LoginPage() {
  return (
    <div className="auth-card">
      <small>BIENVENIDO</small>
      <h1>Ingresa a tu cuenta</h1>
      <p>Continúa coordinando las tareas de tu grupo.</p>
      <AuthForm mode="login" />
    </div>
  );
}
