import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProduct, products } from '@/lib/catalog'
import { getDictionary } from '@/lib/dictionaries'

// Prerender every known product. The root layout already returns the `lang`
// values, so this function only returns `slug`.
export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }))
}

// URL: /en/products/trail-runner
export default async function ProductPage({ params }: PageProps<'/[lang]/products/[slug]'>) {
  const { lang, slug } = await params
  const product = getProduct(slug)
  if (!product) notFound()

  const dict = await getDictionary()
  const price = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD' }).format(
    product.priceCents / 100,
  )

  return (
    <article>
      <h1>{product.name}</h1>
      <p>{price}</p>
      <Link href={`/${lang}/products`}>{dict.products.back}</Link>
    </article>
  )
}
