import type { ReactNode } from 'react';

/** Every signed-in screen: dark header band (title + headline figure), then the white sheet with the content. */
export function Screen({ title, hero, children }: { title?: ReactNode; hero?: ReactNode; children: ReactNode }) {
  return (
    <main className="screen">
      <header className="hero">
        {typeof title === 'string' ? <h1>{title}</h1> : title}
        {hero}
      </header>
      <div className="body">{children}</div>
    </main>
  );
}
