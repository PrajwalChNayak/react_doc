import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPost, getPosts } from '@/lib/posts';

// Prerender every known post at build time. Unknown slugs still render on
// demand and hit notFound() below.
export async function generateStaticParams() {
  const posts = await getPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

// `params` is a Promise in Next.js 16. Await it before reading `slug`.
export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <main>
      <p>
        <Link href="/">Back to all posts</Link>
      </p>
      <article>
        <h1>{post.title}</h1>
        <p>{post.body}</p>
      </article>
    </main>
  );
}
