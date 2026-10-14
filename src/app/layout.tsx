import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Commerce Operations",
  description: "Operação demonstrativa de pedidos e estoque.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip" href="#main">
          Ir ao conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
