export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <section>
        <div className="auth-brand">
          <span>CT</span>
          <div>
            <strong>Coordinador de Tareas</strong>
            <small>Organiza el trabajo. Entrega con confianza.</small>
          </div>
        </div>
        {children}
      </section>
      <aside>
        <div>
          <small>COORDINACIÓN UNIVERSITARIA</small>
          <h2>De la distribución al PDF final, en un solo lugar.</h2>
          <p>
            Asigna con justicia, recibe entregas, evalúa y compila documentos
            listos para presentar.
          </p>
        </div>
      </aside>
    </main>
  );
}
