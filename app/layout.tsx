import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://kuytranscribe.vercel.app'),
  title: 'KüyTranscribe — күйді нотаға айналдыру',
  description: 'Расшифровка сольной записи домбры в ноты, двухструнную табулатуру, MIDI и MusicXML.',
  keywords: ['домбыра', 'күй', 'ноты', 'табулатура', 'MIDI', 'Казахстан'],
  openGraph: {
    title: 'KüyTranscribe',
    description: 'Күйден — нотаға. Ноты и табулатура из записи домбры.',
    type: 'website',
    url: 'https://kuytranscribe.vercel.app',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'KüyTranscribe — Күйден нотаға' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KüyTranscribe',
    description: 'Күйден — нотаға. Ноты и табулатура из записи домбры.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
