import { unified } from "unified";
import remarkParse from "remark-parse";
import GithubSlugger from "github-slugger";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
export function markdownHeadings(source: string) {
  const slugger = new GithubSlugger();
  const headings: { label: string; id: string; level: number }[] = [];
  const tree = unified().use(remarkParse).parse(source);
  visit(tree, "heading", (node) => {
    const label = toString(node);
    headings.push({
      label,
      id: `heading-${slugger.slug(label)}`,
      level: node.depth,
    });
  });
  return headings;
}
