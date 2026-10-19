/* ============================================================
   Ace — markdown.js · zero-dependency safe Markdown renderer
   Turns AI text (# headings, **bold**, lists, tables...) into
   styled HTML. Everything is HTML-escaped first (XSS-safe).
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {

  /* Split text into segments: markdown runs and fenced blocks.
     Returns [{kind:'md', text} | {kind:'fence', lang, body, closed}] */
  function split(text) {
    text = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
    const out = [];
    let md = "", i = 0, n = text.length;
    while (i < n) {
      const lineStart = i;
      let line = "";
      while (i < n && text[i] !== "\n") { line += text[i]; i++; }
      i++; // consume \n
      const m = line.match(/^\s*```[ \t]*([A-Za-z0-9_-]*)[ \t]*$/);
      if (m) {
        const lang = (m[1] || "").toLowerCase();
        // capture until closing fence
        let body = "", closed = false;
        while (i < n) {
          let l = "";
          const s2 = i;
          while (i < n && text[i] !== "\n") { l += text[i]; i++; }
          i++;
          if (/^\s*```[ \t]*$/.test(l)) { closed = true; break; }
          body += (body ? "\n" : "") + l;
        }
        if (md.trim()) { out.push({ kind: "md", text: md }); md = ""; }
        out.push({ kind: "fence", lang, body, closed });
      } else {
        md += (md ? "\n" : "") + line;
      }
    }
    if (md.trim() || out.length === 0) out.push({ kind: "md", text: md });
    return out;
  }

  /* ---------- inline rendering ---------- */
  function inline(s) {
    s = Ace.esc(s);
    // inline code (protect by tokenizing first)
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => {
      codes.push(c); return `\u0000CODE${codes.length - 1}\u0000`;
    });
    // images
    s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g,
      '<img src="$2" alt="$1" loading="lazy" class="md-img">');
    // links (http/https/mailto only)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // bare urls
    s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,;:!?])/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    // bold+italic
    s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, "<b><i>$1</i></b>");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>");
    s = s.replace(/__([^_\n]+)__/g, "<b>$1</b>");
    s = s.replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
    // restore code
    s = s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code class="md-code">${codes[+i]}</code>`);
    return s;
  }

  /* ---------- block rendering ---------- */
  function render(md) {
    md = String(md == null ? "" : md).replace(/\r\n?/g, "\n");
    const lines = md.split("\n");
    let html = "", i = 0;

    const flushP = (buf) => {
      if (!buf.length) return;
      html += `<p>${buf.map(inline).join("<br>")}</p>`;
    };

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      // heading
      let m = line.match(/^(#{1,4})\s+(.*)$/);
      if (m) {
        const lvl = m[1].length;
        const cls = ["md-h1", "md-h2", "md-h3", "md-h4"][lvl - 1];
        html += `<div class="${cls}">${inline(m[2].replace(/\s*#+\s*$/, ""))}</div>`;
        i++; continue;
      }
      // hr
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) { html += "<hr class='md-hr'>"; i++; continue; }

      // blockquote
      if (/^\s*>/.test(line)) {
        const q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, "")); i++;
        }
        html += `<blockquote class="md-quote">${q.map(inline).join("<br>")}</blockquote>`;
        continue;
      }

      // table
      if (line.includes("|") && i + 1 < lines.length &&
          /^\s*\|?[\s:-]*-[-\s|:]*\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
        const parse = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(c => c.trim());
        const head = parse(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
          rows.push(parse(lines[i])); i++;
        }
        html += `<div class="md-tablewrap"><table class="md-table"><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_, c) => `<td>${inline(r[c] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
        continue;
      }

      // lists (2 levels, task items)
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const ordered0 = /^\s*\d+\.\s/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          const m2 = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
          const depth = Math.min(1, Math.floor(m2[1].replace(/\t/g, "  ").length / 2));
          items.push({ depth, text: m2[3] }); i++;
        }
        const tag0 = ordered0 ? "ol" : "ul";
        let out = `<${tag0} class="md-list">`, depth = -1;
        const open = (t, d) => { out += d <= depth ? "" : `<${t} class="md-list">`; return d; };
        items.forEach((it, k) => {
          if (it.depth > 0 && depth < 1) { out += `<${ordered0 ? "ol" : "ul"} class="md-list">`; depth = 1; }
          else if (it.depth === 0 && depth === 1) { out += `</${ordered0 ? "ol" : "ul"}>`; depth = 0; }
          else depth = it.depth;
          let tm = it.text.match(/^\[([ xX])\]\s+(.*)$/);
          if (tm) out += `<li class="task"><span class="md-check ${tm[1] === " " ? "" : "on"}">${tm[1] === " " ? "" : Ace.ICON("check", 12)}</span>${inline(tm[2])}</li>`;
          else out += `<li>${inline(it.text)}</li>`;
        });
        if (depth === 1) out += `</${ordered0 ? "ol" : "ul"}>`;
        out += `</${tag0}>`;
        html += out;
        continue;
      }

      // paragraph
      const buf = [];
      while (i < lines.length && lines[i].trim() &&
             !/^\s*(#{1,4}\s|>|```|([-*+]|\d+\.)\s)/.test(lines[i]) &&
             !/^\s*([-*_])\s*(\1\s*){2,}$/.test(lines[i])) {
        buf.push(lines[i]); i++;
      }
      if (buf.length) flushP(buf);
      else i++; // safety
    }
    return html;
  }

  Ace.MD = { split, render, inline };
})();
