import yaml from "js-yaml";

/**
 * Parse simple front matter from markdown content
 * @param {string} content - Markdown content with optional front matter
 * @returns {{data: object, content: string}} Parsed front matter and remaining content
 */
export function parseFrontMatter(content) {
  const data = {};

  // Check if content starts with ---
  if (!content.trimStart().startsWith("---")) {
    return { data, content };
  }

  // Find the closing ---
  const match = content.match(/^\s*---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data, content };
  }

  const [, frontMatter, remainingContent] = match;
  const parsedData = yaml.load(frontMatter);

  return {
    data: parsedData || {},
    content: remainingContent,
  };
}
