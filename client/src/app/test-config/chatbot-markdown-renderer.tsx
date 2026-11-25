import * as React from "react";

/**
 * What the stand-in rendered, in order (each message's Markdown source), so
 * tests can tell which messages rendered again.
 */
export const markdownRenders: (string | undefined)[] = [];

/**
 * Stand-in for PatternFly Chatbot's Markdown renderer (see setupTests.ts):
 * a message shows its Markdown source as text.
 */
const MarkdownRenderer: React.FC<{ content?: string }> = ({ content }) => {
  markdownRenders.push(content);
  return <div data-testid="markdown">{content}</div>;
};

export default MarkdownRenderer;
