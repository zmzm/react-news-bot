#!/usr/bin/env python3
import json
import re
import sys

try:
    import requests
    from readability import Document
    from bs4 import BeautifulSoup
    from markdownify import markdownify as md
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"Missing Python deps: {exc}"}))
    sys.exit(1)


DROP_PATTERNS = [
    r"related posts?",
    r"share this post",
    r"join the discussion",
    r"subscribe",
    r"copy link",
    r"hacker news",
    r"lobste\.rs",
    r"reddit",
    r"dev\.to",
    r"medium",
    r"read more\s*→?",
    r"satisfaction guaranteed",
]


def post_clean(markdown: str) -> str:
    lines = markdown.split("\n")
    first_heading = next((ln.strip() for ln in lines if ln.strip().startswith("# ")), "")
    seen_heading = False
    out = []
    for line in lines:
        trimmed = line.strip()
        if trimmed and any(re.search(p, trimmed, re.I) for p in DROP_PATTERNS):
            continue
        if first_heading and trimmed == first_heading:
            if seen_heading:
                continue
            seen_heading = True
        out.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def main():
    if len(sys.argv) < 2:
        raise RuntimeError("URL argument is required")

    url = sys.argv[1]
    headers = {"User-Agent": "Mozilla/5.0 (compatible; ThisWeekInReactBot/1.0)"}
    resp = requests.get(url, headers=headers, timeout=45)
    resp.raise_for_status()

    final_url = resp.url
    html = resp.text

    doc = Document(html)
    title = (doc.short_title() or "").strip()
    content_html = doc.summary(html_partial=True) or ""

    soup = BeautifulSoup(content_html, "lxml")
    for selector in ["script", "style", "noscript", "iframe", "nav", "header", "footer", "aside", "form"]:
        for node in soup.select(selector):
            node.decompose()

    markdown = md(
        str(soup),
        heading_style="ATX",
        bullets="-",
        strip=["script", "style", "noscript", "iframe"],
    ).strip()

    if title and not markdown.startswith(f"# {title}"):
        markdown = f"# {title}\n\n{markdown}"

    markdown = post_clean(markdown)
    if len(markdown) > 30000:
        markdown = markdown[:30000] + "\n\n... (content truncated)"

    if len(markdown) < 200:
        raise RuntimeError("Python clipper extracted too little content")

    print(json.dumps({"ok": True, "markdown": markdown, "finalUrl": final_url}))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)

