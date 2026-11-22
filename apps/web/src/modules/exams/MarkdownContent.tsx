import { lazy, Suspense } from 'react';

const ReactMarkdown = lazy(() => import('react-markdown'));

export function MarkdownContent({ source }: { source: string }) {
  if (!source) return null;

  return (
    <div className="space-y-3 break-words [&_a]:text-blue-700 [&_a]:underline [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-medium [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5">
      <Suspense fallback={<p className="whitespace-pre-wrap">{source}</p>}>
        <ReactMarkdown>{source}</ReactMarkdown>
      </Suspense>
    </div>
  );
}
