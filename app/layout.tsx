import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { AmbientBackground } from "@/components/AmbientBackground";
import { IconSymbols } from "@/components/IconSymbols";
import { TopNav } from "@/components/TopNav";
import { ToastHost } from "@/components/ToastHost";
import { getProfile } from "@/lib/auth";
import "@/styles/globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Screen + Color Locator",
  description: "Find any screen or paint bucket on the floor in seconds.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();

  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable}`}>
      <body>
        <IconSymbols />
        <AmbientBackground />
        <TopNav profile={profile} />
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
