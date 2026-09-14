import type { JSX } from 'react';
import { Link } from 'react-router';

export function NotFoundPage(): JSX.Element {
  return (
    <main className="relative min-h-0 flex-1">
      <div className="flex h-full flex-col items-center justify-center gap-3 text-primary">
        <p className="text-[13px] text-secondary">Page not found</p>
        <Link
          to="/graph"
          className="inline-flex h-8 items-center rounded-md border border-hairline-strong bg-raised px-3 text-[13px] font-medium text-primary transition-colors duration-100 hover:bg-raised-hover"
        >
          Back to Graph
        </Link>
      </div>
    </main>
  );
}
