import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  // Inclui peso necessário para títulos e cronômetro.
  weight: ["400", "500", "600", "700"],
});

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
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
