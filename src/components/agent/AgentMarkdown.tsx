import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      components={{
        p: ({ children: content }) => <p className="mb-2 last:mb-0">{content}</p>,
        strong: ({ children: content }) => <strong className="font-semibold text-foreground">{content}</strong>,
        ul: ({ children: content }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{content}</ul>,
        ol: ({ children: content }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{content}</ol>,
        li: ({ children: content }) => <li className="break-words">{content}</li>,
        a: ({ children: content, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2">
            {content}
          </a>
        ),
        code: ({ children: content }) => <code className="break-all rounded bg-background/70 px-1 py-0.5 font-mono text-[0.9em]">{content}</code>,
        pre: ({ children: content }) => <pre className="mb-2 max-w-full overflow-x-auto rounded-md bg-background/70 p-2 last:mb-0">{content}</pre>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}