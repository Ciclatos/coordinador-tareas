import { AuthForm } from "@/components/AuthForm";
export default function RegisterPage() {
  return (
    <div className="auth-card">
      <small>EMPECEMOS</small>
      <h1>Crea tu cuenta</h1>
      <p>Tu información y archivos permanecerán privados.</p>
      <AuthForm mode="register" />
    </div>
  );
}
