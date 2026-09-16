// Plain data with no Next.js imports, so proxy.ts can share it.
export const locales = ['en', 'fr'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export function hasLocale(value: string | undefined): value is Locale {
  return locales.some((locale) => locale === value)
}
