import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'ORBITAL — Map the signals. Understand the threat.',
  description:
    'ORBITAL is a threat-intelligence visualization dashboard. Reported indicators are plotted only where coordinates exist; sources, timestamps, verification, and data origin stay visible.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="bg-void text-primary font-sans min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
