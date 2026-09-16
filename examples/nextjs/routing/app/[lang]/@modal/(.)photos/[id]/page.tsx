import { notFound } from 'next/navigation'
import { Modal } from '@/components/modal'
import { getPhoto } from '@/lib/catalog'
import { getDictionary } from '@/lib/dictionaries'

// (.)photos intercepts /[lang]/photos/[id] on a soft navigation. @modal is a
// slot, not a segment, so `photos` counts as the same level.
export default async function PhotoModal({ params }: PageProps<'/[lang]/photos/[id]'>) {
  const { id } = await params
  const photo = getPhoto(id)
  if (!photo) notFound()
  const dict = await getDictionary()

  return (
    <Modal title={photo.title} closeLabel={dict.photos.close}>
      <div className="swatch" style={{ background: photo.color }} />
    </Modal>
  )
}
