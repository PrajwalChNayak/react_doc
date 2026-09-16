import { notFound } from 'next/navigation'
import { docs, getDoc } from '@/lib/catalog'

export function generateStaticParams() {
  return docs.map((doc) => ({ slug: doc.path }))
}

// URL: /en/docs/guides/routing -> slug is ['guides', 'routing']
export default async function DocPage({ params }: PageProps<'/[lang]/docs/[...slug]'>) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  return (
    <article>
      <p>Matched segments: {slug.join(' / ')}</p>
      <h1>{doc.title}</h1>
      <p>{doc.body}</p>
    </article>
  )
}
