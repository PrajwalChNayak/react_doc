import Link from 'next/link'
import { photos } from '@/lib/catalog'
import { getDictionary, getLocale } from '@/lib/dictionaries'

// URL: /en/photos
export default async function PhotosPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()])
  return (
    <>
      <h1>{dict.photos.title}</h1>
      <p>{dict.photos.hint}</p>
      <div className="grid">
        {photos.map((photo) => (
          <Link key={photo.id} href={`/${locale}/photos/${photo.id}`} aria-label={photo.title}>
            <div className="swatch" style={{ background: photo.color }} />
          </Link>
        ))}
      </div>
    </>
  )
}
