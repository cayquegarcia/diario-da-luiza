import type { Metadata } from "next";
import "./globals.css";

const publicPath = process.env.NEXT_PUBLIC_ASSET_PREFIX || "";

export const metadata: Metadata = {
  title: "Diário da Luiza",
  description: "Diário pessoal de glicose, alimentação e possíveis padrões observados.",
  other: { "codex-preview": "development" },
  icons: {
    icon: `${publicPath}/favicon.svg`,
    shortcut: `${publicPath}/favicon.svg`,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
