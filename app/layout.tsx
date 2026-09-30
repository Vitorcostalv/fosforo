import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({ variable: "--font-display-face", subsets: ["latin"], weight: ["800"], display: "swap" });
const body = Hanken_Grotesk({ variable: "--font-body-face", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"], display: "swap" });

const TITLE = "Fósforo: laboratório de neuroevolução (NEAT + Flappy Bird)";
const DESCRIPTION =
  "Veja uma IA aprender a jogar Flappy Bird por evolução (NEAT), no navegador. Mexa nos parâmetros, jogue contra o melhor pássaro, crie fases e compartilhe o cérebro treinado num link.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "pt_BR" },
};

export const viewport: Viewport = { themeColor: "#141416", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
