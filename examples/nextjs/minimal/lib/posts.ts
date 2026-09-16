// In-memory data so the app runs with no database or network access.
export type Post = {
  slug: string;
  title: string;
  body: string;
};

const posts: Post[] = [
  {
    slug: 'hello-next',
    title: 'Hello, Next.js 16.3',
    body: 'This page was rendered by a Server Component. None of its code ships to the browser.',
  },
  {
    slug: 'async-params',
    title: 'params is a Promise',
    body: 'In Next.js 16, synchronous access was removed. A page awaits its params before reading them.',
  },
];

export async function getPosts(): Promise<Post[]> {
  return posts;
}

export async function getPost(slug: string): Promise<Post | undefined> {
  return posts.find((post) => post.slug === slug);
}
