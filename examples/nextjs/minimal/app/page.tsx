import Link from 'next/link';
import { getPosts } from '@/lib/posts';

// A Server Component by default: it can be async and read data directly.
export default async function HomePage() {
  const posts = await getPosts();

  return (
    <main>
      <h1>Minimal Next.js app</h1>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
