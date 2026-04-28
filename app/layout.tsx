import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel Oftalmocenter",
  description: "Painel operacional em tempo real da Oftalmocenter.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
