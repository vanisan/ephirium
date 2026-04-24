import type {Metadata} from 'next';
import { Cinzel, Spectral } from 'next/font/google';
import './globals.css';

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
});

const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-spectral',
});

export const metadata: Metadata = {
  title: 'Titan Quest Mobile RPG',
  description: 'A mobile-focused ARPG with joystick controls, auto-battle, inventory system, and character progression.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${cinzel.variable} ${spectral.variable}`}>
      <body suppressHydrationWarning className="font-spectral">{children}</body>
    </html>
  );
}
