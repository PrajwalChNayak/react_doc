import { notFound } from 'next/navigation'
import { getPhoto, photos } from '@/lib/catalog'

export function generateStaticParams() {
  return photos.map((photo) => ({ id: photo.id }))
}

// The full page, rendered on a hard navigation (refresh or a shared link).
export default async function PhotoPage({ params }: PageProps<'/[lang]/photos/[id]'>) {
  const { id } = await params
  const photo = getPhoto(id)
  if (!photo) notFound()

  return (
    <article>
      <h1>{photo.title}</h1>
      <div className="swatch" style={{ background: photo.color }} />
    </article>
  )
}
