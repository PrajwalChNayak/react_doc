import { notFound } from 'next/navigation'
import { lang } from 'next/root-params'
import { hasLocale, type Locale } from './locales'

const dictionaries = {
  en: () => import('@/dictionaries/en.json').then((module) => module.default),
  fr: () => import('@/dictionaries/fr.json').then((module) => module.default),
}

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)['en']>>

// Reads the `[lang]` root param directly, so no caller has to pass it down.
export async function getLocale(): Promise<Locale> {
  const value = await lang()
  if (!hasLocale(value)) notFound()
  return value
}

export async function getDictionary(): Promise<Dictionary> {
  const locale = await getLocale()
  return dictionaries[locale]()
}
