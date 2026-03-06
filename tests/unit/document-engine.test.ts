import { describe, it, expect } from 'vitest';

// Extract and test parseMarkdownSections directly (from server/services/document-engine.ts)
function parseMarkdownSections(
  content: string
): Array<{ index: number; title: string; content: string; charCount: number }> {
  const lines = content.split('\n');
  const sections: Array<{ index: number; title: string; content: string; charCount: number }> = [];
  let currentTitle = '';
  let currentContent = '';
  let inCodeBlock = false;
  let sectionIndex = 0;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentContent += line + '\n';
      continue;
    }
    if (!inCodeBlock && /^#{1,3}\s/.test(line)) {
      if (currentTitle || currentContent.trim()) {
        const text = currentContent.trim();
        if (text.length >= 30) {
          sections.push({
            index: sectionIndex++,
            title: currentTitle,
            content: text,
            charCount: text.length,
          });
        }
      }
      currentTitle = line.replace(/^#{1,3}\s+/, '').trim();
      currentContent = '';
    } else {
      currentContent += line + '\n';
    }
  }

  if (currentTitle && currentContent.trim().length >= 30) {
    sections.push({
      index: sectionIndex,
      title: currentTitle,
      content: currentContent.trim(),
      charCount: currentContent.trim().length,
    });
  }

  return sections;
}

describe('parseMarkdownSections', () => {
  it('should parse sections from markdown with headers', () => {
    const md = `# Title\n\n${'a'.repeat(50)}\n\n## Section 2\n\n${'b'.repeat(50)}`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(2);
    expect(sections[0].title).toBe('Title');
    expect(sections[1].title).toBe('Section 2');
  });

  it('should skip short sections (< 30 chars)', () => {
    const md = `# Short\n\nHi\n\n## Long\n\n${'x'.repeat(50)}`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe('Long');
  });

  it('should handle code blocks without splitting on headers inside them', () => {
    const md = `# Section\n\n${'a'.repeat(40)}\n\n\`\`\`\n# Not a header\nsome code\n\`\`\`\n\nMore text here ${'b'.repeat(20)}`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe('Section');
  });

  it('should handle h1, h2, h3 headers', () => {
    const md = `# H1\n\n${'a'.repeat(50)}\n\n## H2\n\n${'b'.repeat(50)}\n\n### H3\n\n${'c'.repeat(50)}`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(3);
    expect(sections[0].title).toBe('H1');
    expect(sections[1].title).toBe('H2');
    expect(sections[2].title).toBe('H3');
  });

  it('should return empty array for empty content', () => {
    expect(parseMarkdownSections('')).toEqual([]);
  });

  it('should track charCount correctly', () => {
    const content = 'a'.repeat(100);
    const md = `# Test\n\n${content}`;
    const sections = parseMarkdownSections(md);
    expect(sections[0].charCount).toBe(100);
  });

  it('should assign sequential index values', () => {
    const md = `# A\n\n${'a'.repeat(50)}\n\n## B\n\n${'b'.repeat(50)}\n\n### C\n\n${'c'.repeat(50)}`;
    const sections = parseMarkdownSections(md);
    expect(sections[0].index).toBe(0);
    expect(sections[1].index).toBe(1);
    expect(sections[2].index).toBe(2);
  });

  it('should not treat h4+ headers as section separators', () => {
    const md = `# Main\n\n${'a'.repeat(40)}\n\n#### Not a split\n\n${'b'.repeat(40)}`;
    const sections = parseMarkdownSections(md);
    // h4 is not matched by /^#{1,3}\s/, so content stays in one section
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe('Main');
  });

  it('should handle content before the first header', () => {
    const md = `${'a'.repeat(50)}\n\n# First Header\n\n${'b'.repeat(50)}`;
    const sections = parseMarkdownSections(md);
    // Content before first header has empty title, but has content >= 30 chars
    expect(sections.length).toBe(2);
    expect(sections[0].title).toBe('');
    expect(sections[1].title).toBe('First Header');
  });

  it('should handle multiple code blocks', () => {
    const md = `# Section\n\n${'a'.repeat(30)}\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n\`\`\`python\n# Comment\nprint("hello")\n\`\`\`\n\nMore text.`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe('Section');
  });

  it('should preserve content within sections', () => {
    const content = 'This is important content that should be preserved exactly as written.';
    const md = `# Test\n\n${content}`;
    const sections = parseMarkdownSections(md);
    expect(sections[0].content).toBe(content);
  });

  it('should handle markdown with only short sections', () => {
    const md = `# A\n\nShort\n\n## B\n\nAlso short`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(0);
  });

  it('should handle section with exactly 30 characters', () => {
    const content = 'a'.repeat(30);
    const md = `# Boundary\n\n${content}`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(1);
    expect(sections[0].charCount).toBe(30);
  });

  it('should handle section with 29 characters (just under threshold)', () => {
    const content = 'a'.repeat(29);
    const md = `# TooShort\n\n${content}`;
    const sections = parseMarkdownSections(md);
    expect(sections.length).toBe(0);
  });
});
