import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import "./globals.css";
import { CustomCursor } from "@/components/app/CustomCursor";
import { cn } from "@/lib/utils";

// Outfit — body sans. Geometric, friendly, holds at small sizes.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Fraunces — display serif. Optical sizing 9..144 lets the same family
// span tiny labels and 42pt hero titles without losing character.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Distil",
  description: "Your CV, stripped to its sharpest form. ATS ready, recruiter approved.",
};

// Explicit viewport so mobile renders at device width with no zoom-out.
// Without this Next.js falls back to its default (`width=device-width`,
// no initial-scale), which iOS Safari has historically rendered
// inconsistently — the more deterministic shape includes initial-scale.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Inline script that runs before paint to apply the saved theme
// preference. Without this, the html element ships with .dark and the
// first paint is the dark theme even if the user previously chose
// light — flicker. Reads localStorage; falls back to the current
// .dark class so users who never toggled keep their default.
const themeBootstrap = `(() => {
  try {
    const saved = localStorage.getItem('theme');
    const root = document.documentElement;
    if (saved === 'light') root.classList.remove('dark');
    else if (saved === 'dark') root.classList.add('dark');
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("dark h-full", outfit.variable, fraunces.variable)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <CustomCursor />
      </body>
    </html>
  );
}
