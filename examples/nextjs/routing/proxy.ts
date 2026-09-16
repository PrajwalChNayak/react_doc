import { NextResponse, type NextRequest } from 'next/server'
import { defaultLocale, locales, type Locale } from '@/lib/locales'

// Pick the best supported locale from Accept-Language, e.g. "fr-CH, fr;q=0.9, en;q=0.8".
function preferredLocale(request: NextRequest): Locale {
  const header = request.headers.get('accept-language') ?? ''
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', quality] = part.trim().split(';q=')
      return { language: tag.toLowerCase().split('-')[0], q: quality ? Number(quality) : 1 }
    })
    .sort((a, b) => b.q - a.q)

  for (const { language } of ranked) {
    const match = locales.find((locale) => locale === language)
    if (match) return match
  }
  return defaultLocale
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasLocalePrefix = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  )
  if (hasLocalePrefix) return NextResponse.next()

  // /photos -> /fr/photos (307, so the browser does not cache the choice)
  const url = request.nextUrl.clone()
  url.pathname = `/${preferredLocale(request)}${pathname === '/' ? '' : pathname}`
  return NextResponse.redirect(url)
}

export const config = {
  // Skip Next.js internals and anything that looks like a file (favicon.ico, images).
  matcher: ['/((?!_next|.*\..*).*)'],
}
