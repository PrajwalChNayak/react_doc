import type { NextRequest } from 'next/server';

// Server-Sent Events: GET /api/stream?count=5
// Watch it with: curl -N http://localhost:3000/api/stream

export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get('count') ?? '5');
  const count = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 50) : 5;

  const encoder = new TextEncoder();
  let sent = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    // pull() runs only when the consumer is ready for more, so a slow reader
    // slows the producer instead of filling server memory (backpressure).
    async pull(controller) {
      if (sent === count) {
        controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
        controller.close();
        return;
      }
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 500);
      });
      sent += 1;
      const payload = JSON.stringify({ tick: sent, at: new Date().toISOString() });
      controller.enqueue(encoder.encode(`id: ${sent}\nevent: tick\ndata: ${payload}\n\n`));
    },
    // Runs if the stream is cancelled before it finishes.
    cancel() {
      clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      // Ask nginx-style reverse proxies not to buffer this response.
      'X-Accel-Buffering': 'no',
    },
  });
}
