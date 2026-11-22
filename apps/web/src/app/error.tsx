"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-[13px] text-fg-secondary">
        The page could not be loaded. Trying again usually works. If it keeps happening, include
        this reference when you contact us.
      </p>
      {error.digest ? (
        <code className="rounded-xs border border-line bg-raised px-2 py-1 font-mono text-xs text-fg-secondary">
          {error.digest}
        </code>
      ) : null}
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
