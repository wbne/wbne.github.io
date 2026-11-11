/**
 * Google Docs HTML ZIP -> clean semantic HTML (browser-side).
 * Requires JSZip (https://stuk.github.io/jszip/) for ZIP input.
 * No Node APIs, DOM libraries, or Google CSS are required in the output.
 */
(function (root) {
  'use strict';

  const DROP_TAGS = new Set(['script', 'noscript', 'iframe', 'object', 'embed', 'applet', 'base', 'meta', 'link']);
  const VOID_TAGS = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'wbr']);
  const SAFE_URL_ATTRS = new Set(['href', 'src']);
  const DOM_SELECTIONS = 'span,p,h1,h2,h3,h4,h5,h6,tr,td,th,img';

  function decodePath(path) {
    return path.replace(/\\/g, '/').split('/').reduce((parts, part) => {
      if (!part || part === '.') return parts;
      if (part === '..') parts.pop(); else parts.push(part);
      return parts;
    }, []).join('/');
  }

  function dirname(path) {
    const clean = decodePath(path);
    const i = clean.lastIndexOf('/');
    return i < 0 ? '' : clean.slice(0, i);
  }

  function joinZipPath(base, path) {
    if (/^(?:[a-z]+:|\/|#|data:)/i.test(path)) return path;
    return decodePath((base ? base + '/' : '') + path);
  }

  function unwrapGoogleRedirect(href) {
  if (!href || href.startsWith('#')) return href;

  try {
    const url = new URL(href, document.baseURI);
    const host = url.hostname.toLowerCase();

    if (!/(^|\.)google\.[a-z.]+$/.test(host) ||
        !/^\/url\/?$/.test(url.pathname)) {
      return href;
    }

    return url.searchParams.get('q') ||
           url.searchParams.get('url') ||
           url.searchParams.get('u') ||
           href;
  } catch (_) {
    return href;
  }
}

  function bytesToDataUrl(bytes, mime) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${mime || 'application/octet-stream'};base64,${btoa(binary)}`;
  }

  function mimeFromName(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' })[ext] || 'application/octet-stream';
  }

  const LAYOUT_STYLE_PROPERTIES = [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'width', 'height', 'max-width', 'max-height',
    'display', 'overflow', 'vertical-align', 'text-align',
    'box-sizing', 'object-fit', 'border-radius'
  ];

  const BOX_STYLE_PROPERTIES = [
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left'
  ];

  function hasPreservedLayoutStyle(el) {
    return LAYOUT_STYLE_PROPERTIES.some(
      prop => el.style.getPropertyValue(prop)
    );
  }

  function preserveComputedLayout(el, cs) {
    const tag = el.tagName.toLowerCase();

    // Preserve nonzero padding and margins from Google Docs classes.
    for (const prop of BOX_STYLE_PROPERTIES) {
      const value = cs.getPropertyValue(prop);
      const amount = Number.parseFloat(value);

      if (Number.isFinite(amount) && amount !== 0) {
        el.style.setProperty(prop, value);
      }
    }

    // Computed block widths are often just the available page width.
    // Preserve dimensions only where they represent meaningful object sizing.
    if (tag === 'img' || (tag === 'span' && cs.display !== 'inline')) {
      for (const prop of ['width', 'height', 'max-width', 'max-height']) {
        const value = cs.getPropertyValue(prop);
        const amount = Number.parseFloat(value);

        if (Number.isFinite(amount) && amount > 0 && value !== 'auto') {
          el.style.setProperty(prop, value);
        }
      }
    }

    if (tag === 'span' && cs.display !== 'inline') {
      el.style.setProperty('display', cs.display);
    }

    if (cs.overflow && cs.overflow !== 'visible') {
      el.style.setProperty('overflow', cs.overflow);
    }

    if (cs.textAlign && !['left', 'start'].includes(cs.textAlign)) {
      el.style.setProperty('text-align', cs.textAlign);
    }

    if (cs.verticalAlign && cs.verticalAlign !== 'baseline') {
      el.style.setProperty('vertical-align', cs.verticalAlign);
    }

    if (tag === 'img') {
      if (cs.boxSizing && cs.boxSizing !== 'content-box') {
        el.style.setProperty('box-sizing', cs.boxSizing);
      }
      if (cs.objectFit && cs.objectFit !== 'fill') {
        el.style.setProperty('object-fit', cs.objectFit);
      }
      if (cs.borderRadius && cs.borderRadius !== '0px') {
        el.style.setProperty('border-radius', cs.borderRadius);
      }
    }
  }

  function cleanPreservedStyles(el) {
    const preserved = new Map();

    if (el.style.backgroundColor) {
      preserved.set('background-color', el.style.backgroundColor);
    }

    for (const prop of LAYOUT_STYLE_PROPERTIES) {
      const value = el.style.getPropertyValue(prop);
      if (value) preserved.set(prop, value);
    }

    // Read all values before removing the original style attribute.
    el.removeAttribute('style');

    for (const [prop, value] of preserved) {
      el.style.setProperty(prop, value);
    }
  }

  function transferItalicLayout(source, wrapper, computedStyle) {
    const transferProperties = [
      ...BOX_STYLE_PROPERTIES,
      'width', 'height', 'max-width', 'max-height',
      'display', 'overflow', 'vertical-align', 'text-align',
      'box-sizing', 'object-fit', 'border-radius'
    ];

    let hasVerticalMargin = false;

    for (const property of transferProperties) {
      const value = source.style.getPropertyValue(property);
      if (!value) continue;

      wrapper.style.setProperty(property, value);
      source.style.removeProperty(property);

      if (
        (property === 'margin-top' || property === 'margin-bottom') &&
        Number.parseFloat(value) !== 0
      ) {
        hasVerticalMargin = true;
      }
    }

    // Vertical margins on an inline element have no layout effect.
    // Make the semantic <em> wrapper an inline-block when necessary.
    if (computedStyle.display !== 'inline') {
      wrapper.style.display = computedStyle.display;
      source.style.removeProperty('display');
    } else if (hasVerticalMargin) {
      wrapper.style.display = 'inline-block';
    }
  }

  function wrapContents(el, tag) {
    if (!el.childNodes.length) return null;

    const wrapper = el.ownerDocument.createElement(tag);

    while (el.firstChild) {
      wrapper.appendChild(el.firstChild);
    }

    el.appendChild(wrapper);
    return wrapper;
  }

  
  function addSemanticFormatting(sourceDoc, styleDoc) {
    const sourceEls = [...sourceDoc.body.querySelectorAll(DOM_SELECTIONS)];

    for (let i = 0; i < sourceEls.length; i++) {
      const el = sourceEls[i];
      const styled = styleDoc.querySelector(`[data-gdc-index="${i}"]`);

      if (!styled || !el.parentNode) continue;

      const cs = styleDoc.defaultView.getComputedStyle(styled);

      // Capture layout before removing Google Docs CSS.
      preserveComputedLayout(el, cs);

      // Preserve table backgrounds.
      if (el.matches('tr, td, th')) {
        const bg = cs.backgroundColor;

        if (bg && !/^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i.test(bg)) {
          el.style.backgroundColor = bg;
        }

        continue;
      }

      // Headings and images only need layout preservation.
      if (!el.matches('span, p')) continue;

      const parent = styled.parentElement;
      const ps = parent
        ? styleDoc.defaultView.getComputedStyle(parent)
        : null;

      const weight = Number.parseInt(cs.fontWeight, 10) ||
        (cs.fontWeight === 'bold' ? 700 : 400);

      const parentWeight = ps
        ? Number.parseInt(ps.fontWeight, 10) ||
          (ps.fontWeight === 'bold' ? 700 : 400)
        : 400;

      const italic = cs.fontStyle === 'italic' &&
        (!ps || ps.fontStyle !== 'italic');

      const bold = weight >= 600 && parentWeight < 600;

      const deco = cs.textDecorationLine || cs.textDecoration || '';
      const pdeco = ps
        ? ps.textDecorationLine || ps.textDecoration || ''
        : '';

      const underline = /underline/.test(deco) &&
        !/underline/.test(pdeco);

      const strike = /line-through/.test(deco) &&
        !/line-through/.test(pdeco);

      const tags = [];

      if (bold) tags.push('strong');
      if (italic) tags.push('em');
      if (underline) tags.push('u');
      if (strike) tags.push('s');

      for (const tag of tags.reverse()) {
        const wrapper = wrapContents(el, tag);

        if (tag === 'em' && wrapper && el.matches('span')) {
          transferItalicLayout(el, wrapper, cs);
        }
      }
    }
  }


  function cleanDocument(doc, options = {}) {
    const { imageMode = 'path', imageBasePath = '', keepLinks = true } = options;
    doc.querySelectorAll('style, script, noscript, iframe, object, embed, applet, base, meta, link').forEach(n => n.remove());

    // Only promote an actual Google Docs title paragraph.
    // Never promote a nested formatting span: doing so can restructure later content.
    const titleP = doc.body.querySelector('p.title');

    if (titleP && !doc.body.querySelector('h1')) {
      const h1 = doc.createElement('h1');

      // Carry over the paragraph's captured layout and anchor attributes.
      for (const attr of ['style', 'id', 'name']) {
        if (titleP.hasAttribute(attr)) {
          h1.setAttribute(attr, titleP.getAttribute(attr));
        }
      }

      while (titleP.firstChild) {
        h1.appendChild(titleP.firstChild);
      }

      titleP.replaceWith(h1);
    }

    // Preserve image references, resolving paths against the HTML file's directory.
    for (const img of [...doc.body.querySelectorAll('img')]) {
      const src = img.getAttribute('src') || '';
      const cleanSrc = joinZipPath(imageBasePath, src);
      img.setAttribute('src', cleanSrc);
      if (!img.getAttribute('alt')) img.setAttribute('alt', '');
    }

    // Remove Google-only wrappers while retaining their children and text.
    for (const el of [...doc.body.querySelectorAll('*')].reverse()) {
      if (!el.parentNode) continue;
      const tag = el.tagName.toLowerCase();
      if (DROP_TAGS.has(tag)) { el.remove(); continue; }
      if (
        tag === 'font' ||
        (tag === 'span' && !hasPreservedLayoutStyle(el))
      ) {
        el.replaceWith(...el.childNodes);
        continue;
      }
      const allowed = new Set([
        'class', 'id', 'name', 'style',
        'width', 'height', 'colspan', 'rowspan',
        'scope', 'start', 'reversed', 'value',
        'href', 'src', 'alt', 'title',
        'target', 'rel', 'loading'
      ]);
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name.startsWith('on') || name === 'srcdoc' || (!allowed.has(name))) el.removeAttribute(attr.name);
        else if (SAFE_URL_ATTRS.has(name) && /^\s*javascript:/i.test(value)) el.removeAttribute(attr.name);
      }
      // Strip Google classes but retain IDs/names for internal links.
      el.removeAttribute('class');

      // Preserve only the layout/background properties captured earlier.
      cleanPreservedStyles(el);

      if (!keepLinks && tag === 'a') {
        el.replaceWith(...el.childNodes);
        continue;
      }

      if (tag === 'a' && el.hasAttribute('href')) {
        el.setAttribute('href', unwrapGoogleRedirect(el.getAttribute('href')));
      }

      if (tag === 'a' && el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }

    // Strip presentation attributes from the body as well (it is not in body.querySelectorAll('*')).
    for (const attr of [...doc.body.attributes]) {
      if (attr.name.toLowerCase() !== 'lang' && attr.name.toLowerCase() !== 'dir') doc.body.removeAttribute(attr.name);
    }

    // Google export may contain empty trailing layout paragraphs; preserve nonempty paragraphs.
    const main = doc.createElement('main');
    const section = doc.createElement('section');
    section.setAttribute('data-tab', '0');
    while (doc.body.firstChild) section.appendChild(doc.body.firstChild);
    main.appendChild(section);
    doc.body.replaceChildren(main);
    return doc;
  }

  async function convertGoogleDocsHtml(html, assets = {}, options = {}) {
    if (typeof html !== 'string') throw new TypeError('html must be a string');
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const base = options.htmlDirectory || '';

    // Capture computed styles in an isolated, script-disabled iframe before stripping CSS.
    const styleDoc = await createStyleDocument(doc);
    try {
      addSemanticFormatting(doc, styleDoc);
    } finally {
      styleDoc.frame.remove();
    }
    // Preserve IDs and named anchors that Google Docs places on formatting spans.
    doc.body.querySelectorAll('span').forEach(span => {
      if (span.hasAttribute('id') || span.hasAttribute('name')) {
        const anchor = doc.createElement('a');

        for (const attr of ['id', 'name']) {
          if (span.hasAttribute(attr)) {
            anchor.setAttribute(attr, span.getAttribute(attr));
          }
        }

        while (span.firstChild) {
          anchor.appendChild(span.firstChild);
        }

        span.replaceWith(anchor);
      }
    });


    // Resolve ZIP image assets. Keep an unresolved path rather than silently dropping an image.
    const imageMode = options.imageMode || 'path';
    const referencedAssets = {};
    for (const img of [...doc.body.querySelectorAll('img')]) {
      const original = img.getAttribute('src') || '';
      if (/^(?:https?:|data:|blob:)/i.test(original)) continue;
      const zipPath = joinZipPath(base, original);
      const asset = assets[zipPath] ?? assets[original] ?? assets[zipPath.replace(/^\//, '')];
      if (!asset) { img.setAttribute('src', zipPath); continue; }
      referencedAssets[zipPath] = asset instanceof Uint8Array ? asset : new Uint8Array(asset);
      if (imageMode === 'data-uri') {
        const bytes = asset instanceof Uint8Array ? asset : new Uint8Array(asset);
        img.setAttribute('src', bytesToDataUrl(bytes, mimeFromName(zipPath)));
      } else {
        img.setAttribute('src', zipPath);
      }
    }

    cleanDocument(doc, { ...options, imageBasePath: '' });

    // Add the blog stylesheet only to the final output, not the style-capture iframe.
    const customStyle = doc.createElement('link');
    customStyle.rel = 'stylesheet';
    customStyle.href = 'https://wbne.github.io/blog.css';

    doc.head.appendChild(customStyle);

    const output = '<!doctype html>\n' + doc.documentElement.outerHTML;
    return {
      html: output,
      document: doc,
      assets: imageMode === 'path' ? referencedAssets : {},
      stats: {
        headings: doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
        paragraphs: doc.querySelectorAll('p').length,
        lists: doc.querySelectorAll('ul,ol').length,
        listItems: doc.querySelectorAll('li').length,
        tables: doc.querySelectorAll('table').length,
        rows: doc.querySelectorAll('tr').length,
        cells: doc.querySelectorAll('td,th').length,
        images: doc.querySelectorAll('img').length,
        semanticFormatting: doc.querySelectorAll('strong,em,u,s').length
      }
    };
  }

  async function createStyleDocument(sourceDoc) {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText =
      'position:absolute;width:0;height:0;border:0;visibility:hidden';

    document.body.appendChild(frame);

    const target = frame.contentDocument;

    target.open();
    target.write('<!doctype html><html><head></head><body></body></html>');
    target.close();

    // Copy the original Google Docs styles first.
    for (const style of sourceDoc.querySelectorAll('style')) {
      const copy = target.createElement('style');
      copy.textContent = style.textContent.replace(
        /@import\s+[^;]+;?/gi, ''
      );
      target.head.appendChild(copy);
    }

    try {
      // Clone the Google Docs content after the stylesheet has loaded.
      const clone = sourceDoc.body.cloneNode(true);

      clone.querySelectorAll(
        'script,iframe,object,embed,link,style'
      ).forEach(n => n.remove());

      const indexed = [
        ...clone.querySelectorAll(DOM_SELECTIONS)
      ];

      indexed.forEach((el, i) => {
        el.setAttribute('data-gdc-index', String(i));
      });

      target.body.appendChild(clone);

      // Allow the browser to calculate the styles.
      await new Promise(resolve => requestAnimationFrame(resolve));

      return {
        frame,
        document: target,
        defaultView: target.defaultView,
        querySelector: target.querySelector.bind(target)
      };
    } catch (error) {
      frame.remove();
      throw error;
    }
  }

  async function convertGoogleDocsZip(file, options = {}) {
    const JSZip = options.JSZip || root.JSZip;
    if (!JSZip) throw new Error('JSZip is required. Pass { JSZip } or load JSZip globally.');
    const zip = await JSZip.loadAsync(file);
    const htmlName = Object.keys(zip.files).find(name => !zip.files[name].dir && /\.html?$/i.test(name));
    if (!htmlName) throw new Error('No HTML file was found in the ZIP archive.');
    const html = await zip.file(htmlName).async('string');
    const htmlDirectory = dirname(htmlName);
    const assets = {};
    const entries = Object.values(zip.files).filter(entry => !entry.dir && !/\.html?$/i.test(entry.name));
    await Promise.all(entries.map(async entry => { assets[decodePath(entry.name)] = await entry.async('uint8array'); }));
    return convertGoogleDocsHtml(html, assets, { ...options, htmlDirectory });
  }

  root.GoogleDocsCleaner = { convertGoogleDocsZip, convertGoogleDocsHtml };
})(window);
