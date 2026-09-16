import { getDictionary } from '@/lib/dictionaries'

// URL: /en/about
export default async function AboutPage() {
  const dict = await getDictionary()
  return (
    <>
      <h1>{dict.about.title}</h1>
      <p>{dict.about.body}</p>
    </>
  )
}
