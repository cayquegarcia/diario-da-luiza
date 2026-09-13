import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diário da Luiza",
  description: "Diário pessoal de glicose, alimentação e possíveis padrões observados.",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
