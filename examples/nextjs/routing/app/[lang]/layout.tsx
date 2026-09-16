import type { Metadata } from 'next'
import Link from 'next/link'
import { getDictionary, getLocale } from '@/lib/dictionaries'
import { locales } from '@/lib/locales'
import './globals.css'

export const metadata: Metadata = {
  title: 'Next.js routing example',
}

// app/[lang]/layout.tsx is the root layout, so `lang` is a root param.
export function generateStaticParams() {
  return locales.map((locale) => ({ lang: locale }))
}

export default async function RootLayout({ children, modal }: LayoutProps<'/[lang]'>) {
  // next/root-params: no need to await props.params here or pass it down.
  const locale = await getLocale()
  const dict = await getDictionary()

  return (
    <html lang={locale} data-scroll-behavior="smooth">
      <body>
        <header>
          <nav aria-label="Main">
            <Link href={`/${locale}`}>{dict.nav.home}</Link>
            <Link href={`/${locale}/about`}>{dict.nav.about}</Link>
            <Link href={`/${locale}/products`}>{dict.nav.products}</Link>
            <Link href={`/${locale}/docs/getting-started`}>{dict.nav.docs}</Link>
            <Link href={`/${locale}/photos`}>{dict.nav.photos}</Link>
          </nav>
          <nav aria-label="Language">
            {locales.map((other) => (
              <Link key={other} href={`/${other}`} hrefLang={other}>
                {other.toUpperCase()}
              </Link>
            ))}
          </nav>
        </header>
        <main>{children}</main>
        {/* The @modal slot: null by default, a photo when a link is intercepted. */}
        {modal}
      </body>
    </html>
  )
}
