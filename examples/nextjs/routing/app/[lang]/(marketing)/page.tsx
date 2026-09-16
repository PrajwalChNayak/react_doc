import { getDictionary } from '@/lib/dictionaries'

// URL: /en. The (marketing) group adds nothing to the path.
export default async function HomePage() {
  const dict = await getDictionary()
  return (
    <>
      <h1>{dict.home.title}</h1>
      <p>{dict.home.intro}</p>
    </>
  )
}
