import Link from 'next/link'
import { products } from '@/lib/catalog'
import { getDictionary, getLocale } from '@/lib/dictionaries'

// URL: /en/products
export default async function ProductsPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()])
  return (
    <>
      <h1>{dict.products.title}</h1>
      <ul>
        {products.map((product) => (
          <li key={product.slug}>
            <Link href={`/${locale}/products/${product.slug}`}>{product.name}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
