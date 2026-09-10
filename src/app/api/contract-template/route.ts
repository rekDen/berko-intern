import { NextResponse } from "next/server";
import { withAuth, unauthorized } from "@/lib/supabase/api";

const TEMPLATE_URL = "https://berko.ai/berko-vertrag.html";
const BASE = "https://berko.ai";

function toAbsolute(href: string, base = BASE): string {
  if (!href || href.startsWith("data:")) return href;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return base + href;
  return base + "/" + href;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? r.text() : null;
  } catch { return null; }
}

async function fetchBase64(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "application/octet-stream";
    const buf = await r.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch { return null; }
}

// Replace url(...) in CSS with absolute or base64-inlined versions
async function inlineCssUrls(css: string, cssBase: string): Promise<string> {
  const urlRe = /url\((['"]?)([^'")]+)\1\)/g;
  const matches = [...css.matchAll(urlRe)];
  for (const m of matches) {
    const raw = m[2];
    if (raw.startsWith("data:")) continue;
    const abs = toAbsolute(raw, cssBase);
    // Inline images and fonts as base64 to avoid canvas taint
    const dataUri = await fetchBase64(abs);
    if (dataUri) {
      css = css.replace(m[0], `url("${dataUri}")`);
    } else {
      css = css.replace(m[0], `url("${abs}")`);
    }
  }
  return css;
}

export async function GET() {
  const { user } = await withAuth();
  if (!user) return unauthorized();

  try {
    const res = await fetch(TEMPLATE_URL, { cache: "no-store" });
    if (!res.ok) return new NextResponse("Template nicht verfügbar", { status: 502 });

    let html = await res.text();

    // 1. Inline external stylesheets
    const linkRe = /<link([^>]+)\/?>/gi;
    for (const match of [...html.matchAll(linkRe)]) {
      const attrs = match[1];
      if (!/rel=["']stylesheet["']/i.test(attrs)) continue;
      const hrefMatch = /href=["']([^"']+)["']/i.exec(attrs);
      if (!hrefMatch) continue;
      const url = toAbsolute(hrefMatch[1]);
      let css = await fetchText(url);
      if (css) {
        const cssBase = url.substring(0, url.lastIndexOf("/") + 1);
        css = await inlineCssUrls(css, cssBase);
        html = html.replace(match[0], `<style>\n${css}\n</style>`);
      } else {
        // Can't fetch — remove the tag so the browser doesn't request it from Next.js
        html = html.replace(match[0], "");
      }
    }

    // 2. Inline <img> src as base64
    const imgRe = /<img([^>]+)>/gi;
    for (const match of [...html.matchAll(imgRe)]) {
      const srcMatch = /src=["']([^"']+)["']/i.exec(match[1]);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      if (src.startsWith("data:")) continue;
      const abs = toAbsolute(src);
      const dataUri = await fetchBase64(abs);
      if (dataUri) {
        html = html.replace(src, dataUri);
      }
    }

    // 3. Replace/remove existing <base> tags and inject one pointing to the template origin
    // so any remaining relative URLs (scripts, fonts, etc.) resolve correctly
    html = html.replace(/<base[^>]*>/gi, "");
    html = html.replace(/<head>/i, `<head><base href="${BASE}/">`);

    // 4. Hide export button visually (still clickable programmatically)
    html = html.replace(/<\/head>/i, '<style>#exportieren{display:none!important}</style></head>');

    // 5. Inject data-capture API (runs after template scripts)
    const captureScript = `<script>
(function () {
  'use strict';
  var _captured = null;

  // Intercept URL.createObjectURL (Blob-based JSON download)
  var _origCreate = URL.createObjectURL;
  URL.createObjectURL = function (blob) {
    if (blob && blob.size < 500000) {
      var reader = new FileReader();
      reader.onload = function () {
        try { _captured = JSON.parse(reader.result); } catch (_) {}
      };
      reader.readAsText(blob);
    }
    return _origCreate.call(URL, blob);
  };

  // Intercept <a download href="data:..."> clicks
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A' && el.hasAttribute('download')) {
        var href = el.getAttribute('href') || '';
        if (href.startsWith('data:')) {
          try { _captured = JSON.parse(decodeURIComponent(href.split(',')[1])); } catch (_) {
            try { _captured = JSON.parse(decodeURIComponent(escape(atob(href.split(',')[1])))); } catch (_) {}
          }
        }
        break;
      }
      el = el.parentElement;
    }
  }, true);

  // Fallback: read every visible form field with its label
  function readAllFields() {
    var result = {};
    function labelFor(el) {
      if (el.id) { var l = document.querySelector('label[for="' + el.id + '"]'); if (l) return l.textContent.trim(); }
      var p = el.parentElement;
      while (p && p !== document.body) {
        if (p.tagName === 'LABEL') return p.textContent.replace(el.value || '', '').trim().replace(/\\s+/g, ' ');
        p = p.parentElement;
      }
      var sib = el.previousElementSibling;
      if (sib) { var t = sib.textContent.trim(); if (t && t.length < 80) return t; }
      return el.placeholder || el.name || el.id || null;
    }
    document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]),select,textarea').forEach(function (el) {
      var key = labelFor(el);
      if (!key) return;
      if (el.type === 'checkbox') {
        if (el.checked) { if (!Array.isArray(result[key])) result[key] = []; result[key].push(el.value || key); }
      } else if (el.type === 'radio') {
        if (el.checked) result[key] = el.value || (el.nextElementSibling ? el.nextElementSibling.textContent.trim() : el.value);
      } else if (el.value && el.value.trim()) {
        result[key] = el.value.trim();
      }
    });
    return result;
  }

  window.triggerJsonExport = function () {
    _captured = null;
    var btn = document.getElementById('exportieren');
    if (btn) btn.click();
    return new Promise(function (resolve) {
      var n = 0;
      var id = setInterval(function () {
        n++;
        if (_captured !== null || n >= 20) { clearInterval(id); resolve(_captured !== null ? _captured : readAllFields()); }
      }, 100);
    });
  };
  window.readContractFields = readAllFields;
})();
<\/script>`;
    html = html.replace(/<\/body>/i, captureScript + '</body>');

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("Fehler beim Laden der Vorlage", { status: 502 });
  }
}
