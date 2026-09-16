import type { ReactNode } from 'react'

// Wraps only the routes inside (shop). The marketing pages never render this.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <section>
      <p role="note">Free shipping on orders over $50.</p>
      {children}
    </section>
  )
}
