// plugin/bibtex-cite/bibtex-cite.js
const RevealBibtexCite = (() => {
  // --- Minimal BibTeX parser (robust genug für typische .bib Dateien)
  function parseBibTeX(bibText) {
    // Entferne Kommentare
    const text = bibText
      .replace(/^\s*%.*$/gm, "")
      .replace(/@comment\s*{[^}]*}/gim, "");

    const entries = new Map();

    // Grob: @type{key, fields...}
    const entryRegex = /@(\w+)\s*{\s*([^,\s]+)\s*,([\s\S]*?)\n}\s*/g;
    let m;
    while ((m = entryRegex.exec(text)) !== null) {
      const type = m[1].toLowerCase();
      const key = m[2].trim();
      const body = m[3];

      const fields = {};
      // field = {value} | "value" | value
      // Wir parsen zeilenweise, tolerieren Kommas im Value via Klammerzählung
      let i = 0;
      while (i < body.length) {
        // Skip whitespace/commas
        while (i < body.length && /[\s,]/.test(body[i])) i++;
        if (i >= body.length) break;

        // field name
        const nameMatch = /^[a-zA-Z_][a-zA-Z0-9_\-]*/.exec(body.slice(i));
        if (!nameMatch) break;
        const fieldName = nameMatch[0].toLowerCase();
        i += fieldName.length;

        // Skip spaces and '='
        while (i < body.length && /[\s=]/.test(body[i])) i++;
        if (i >= body.length) break;

        // Parse value
        let value = "";
        if (body[i] === "{") {
          let depth = 0;
          let start = i + 1;
          i++; // consume '{'
          depth = 1;
          while (i < body.length && depth > 0) {
            if (body[i] === "{") depth++;
            else if (body[i] === "}") depth--;
            i++;
          }
          value = body.slice(start, i - 1);
        } else if (body[i] === '"') {
          i++; // consume '"'
          const start = i;
          while (i < body.length && body[i] !== '"') {
            // einfache Escape-Toleranz
            if (body[i] === "\\" && i + 1 < body.length) i += 2;
            else i++;
          }
          value = body.slice(start, i);
          i++; // consume closing '"'
        } else {
          // bare value bis Komma/Zeilenende
          const start = i;
          while (i < body.length && body[i] !== "," && body[i] !== "\n") i++;
          value = body.slice(start, i);
        }

        value = value.trim();
        // einfache LaTeX-Schminke entfernen (optional)
        value = value.replace(/[{}]/g, "");
        fields[fieldName] = value;

        // move to next comma if any
        while (i < body.length && body[i] !== "," && body[i] !== "\n") i++;
        if (i < body.length && body[i] === ",") i++;
      }

      entries.set(key, { key, type, fields });
    }

    return entries;
  }

  function splitKeys(raw) {
    return raw
      .split(/[;,]/g)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function makeLink(href, label) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  function normalizeDoi(doiRaw) {
    const d = (doiRaw || "").trim();
    if (!d) return "";
    if (d.startsWith("http://") || d.startsWith("https://")) return d;
    return `https://doi.org/${d}`;
  }

  function isStack(sectionEl) {
    // Parent-Stack: hat direkte section-Kinder
    return !!sectionEl.querySelector(":scope > section");
  }

  function formatAuthors(authorField) {
    if (!authorField) return "";
    const parts = authorField.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return "";
    const first = parts[0];
    // "Last, First" oder "First Last"
    const last = first.includes(",") ? first.split(",")[0].trim() : first.split(/\s+/).slice(-1)[0];
    if (parts.length === 1) return last;
    if (parts.length === 2) {
      const second = parts[1];
      const last2 = second.includes(",") ? second.split(",")[0].trim() : second.split(/\s+/).slice(-1)[0];
      return `${last} & ${last2}`;
    }
    return `${last} et al.`;
  }

  function formatShort(entry) {
    if (!entry) return "Unknown, n.d.";
    const f = entry.fields || {};
    const a = formatAuthors(f.author) || "Unknown";
    const y = f.year || "n.d.";
    return `${a} (${y})`;
  }

  function formatEntryNodes(entry, lang) {
    const frag = document.createDocumentFragment();
    if (!entry) {
      frag.append(document.createTextNode("Unknown source"));
      return frag;
    }

    const f = entry.fields || {};
    const authors = formatAuthors(f.author);
    const year = f.year || "";
    const title = f.title || "";
    const container = f.journal || f.booktitle || f.publisher || "";

    const doiRaw = (f.doi || "").trim();
    const urlRaw = (f.url || "").trim();
    const urlDate = (f.urldate || "").trim();

    // Kopf + Mid
    const head = [authors, year].filter(Boolean).join(", ");
    const mid = [title, container].filter(Boolean).join(". ");
    const base = [head, mid].filter(Boolean).join(" — ");

    frag.append(document.createTextNode(base));

    // DOI schlägt URL
    if (doiRaw) {
      frag.append(document.createTextNode(". DOI: "));
      const doiHref = normalizeDoi(doiRaw);
      frag.append(makeLink(doiHref, doiHref));
      return frag;
    }

    // URL nur mit urldate
    if (urlRaw) {
      frag.append(document.createTextNode(". "));
      frag.append(makeLink(urlRaw, urlRaw));

      if (urlDate) {
        frag.append(document.createTextNode(`, ${t(lang, "lastAccessed")} ${urlDate}`));
      } else {
        frag.append(document.createTextNode(` (${t(lang, "missingUrlDate")})`));
      }
      return frag;
    }

    return frag;
  }

  function ensureSourcesContainer(Reveal, options) {
    let sourcesEl = document.querySelector(options.sourcesSelector);

    if (!sourcesEl && options.createSourcesSlide) {
      // Erzeuge am Ende eine neue Sources-Slide
      const deck = Reveal.getRevealElement().querySelector(".slides");
      const sec = document.createElement("section");
      sec.className = options.sourcesSelector.replace(/^\./, "").trim() || "sources";
      sec.innerHTML = `<h2>${options.sourcesTitle}</h2><ol class="sources-list"></ol>`;
      deck.appendChild(sec);
      sourcesEl = sec;
    }

    if (sourcesEl) {
      // Wenn es ein container ist, sicherstellen dass eine Liste existiert
      let ol = sourcesEl.querySelector("ol.sources-list");
      if (!ol) {
        ol = document.createElement("ol");
        ol.className = "sources-list";
        sourcesEl.appendChild(ol);
      }
    }

    return sourcesEl;
  }

  function fillCitationBarInSlide(slide, usedKeysInSlide, keyToNumber, keyToEntry, options) {
    const bar = slide.querySelector(`:scope > ${options.citationBarSelector}, :scope ${options.citationBarSelector}`);
    if (!bar) return;

    if (usedKeysInSlide.length === 0) return;

    // Baue "1. Autor, Jahr; 2. Autor, Jahr; ..."
    const parts = usedKeysInSlide.map((key) => {
      const num = keyToNumber.get(key);
      const entry = keyToEntry.get(key);
      const txt = formatShort(entry); // "{AutorenKurz}, {Jahr}"
      return `${num}. ${txt}`;
    });

    const text = parts.join("; ");

    // Falls schon ein von uns generiertes <p> existiert, aktualisieren statt doppelt anzuhängen
    let p = bar.querySelector("p[data-generated='true']");
    if (!p) {
      p = document.createElement("p");
      p.dataset.generated = "true";
      bar.appendChild(p); // ANS ENDE des existierenden Inhalts
    }
    p.textContent = text;
  }

  function replaceCiteNode(node, keys, keyToNumber, options) {
    // node kann leer sein oder Text enthalten – wir ersetzen ihn durch Superscripts
    const sup = document.createElement("sup");
    sup.className = options.supClass;

    // z.B. 1,2,3
    const nums = keys.map(k => keyToNumber.get(k)).filter(n => Number.isFinite(n));

    // Darstellung: ¹² oder [1,2] – hier: hochgestellt mit Komma
    // Für "¹²" wäre es Unicode-Superscript mapping; ich bleibe bei <sup>1,2</sup>
    sup.textContent = options.supWrapWithBrackets ? `[${nums.join(",")}]` : `${nums.join(",")}`;

    // Tooltip mit Keys (oder formatiertem Kurztext)
    if (options.addTitleToSup) {
      sup.title = keys.join(", ");
    }

    // Ersetze node-Inhalt: standard: node wird komplett ersetzt
    if (options.replaceNode) {
      node.replaceWith(sup);
    } else {
      // oder anhängen/ersetzen innerhalb
      node.textContent = "";
      node.appendChild(sup);
    }
  }

  function isHiddenSlide(slideEl) {
    return (
      slideEl.dataset.visibility === "hidden" ||
      !!slideEl.closest("section[data-visibility='hidden']")
    );
  }

  function collectSlidesInDomOrder(Reveal) {
    const slidesEl = Reveal.getSlidesElement();
    return Array.from(
      slidesEl.querySelectorAll(":scope > section, :scope > section > section")
    );
  }

  async function loadBibFile(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load .bib file: ${url} (${res.status})`);
    return await res.text();
  }

  function getDocLang() {
    const raw = (document.documentElement.getAttribute("lang") || "").toLowerCase();
    if (raw.startsWith("de")) return "de";
    return "en";
  }

  const I18N = {
    de: {
      sourcesTitle: "Literaturverzeichnis",
      lastAccessed: "Letzter Zugriff am",
      missingUrlDate: "FEHLT: urldate"
    },
    en: {
      sourcesTitle: "Sources",
      lastAccessed: "Last accessed",
      missingUrlDate: "MISSING: urldate"
    }
  };

  function t(lang, key) {
    return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  }

  function plugin() {
    let RevealInstance;

    const defaultOptions = {
      bibFile: "bib/references.bib",

      // Inline marker wie <span data-cite="key"></span>
      citeSelector: "[data-cite]",

      // Wo die per-Slide Kurzquellen landen (DU setzt den Container ins Slide-Markup!)
      citationBarSelector: ".citation-bar",

      // Superscripts
      supClass: "cite-sup",
      supWrapWithBrackets: false,
      addTitleToSup: true,
      replaceNode: true,

      // Sources-Verzeichnis
      sourcesSelector: ".sources",
      sourcesTitle: null,
      createSourcesSlide: true,
      sourceIdPrefix: "src-"
    };

    return {
      id: "bibtexCite",
      init: async function (reveal) {
        RevealInstance = reveal;
        const options = Object.assign({}, defaultOptions, reveal.getConfig().bibtexCite || {});

        const lang = getDocLang();

        // wenn sourcesTitle nicht explizit gesetzt ist, automatisch aus i18n
        if (!options.sourcesTitle) {
          options.sourcesTitle = t(lang, "sourcesTitle");
        }

        const bibText = await loadBibFile(options.bibFile);
        const bibMap = parseBibTeX(bibText);

        // 1) Globales Nummern-Mapping in erster Auftretensreihenfolge
        const keyToNumber = new Map();
        const keyToEntry = bibMap;
        let counter = 1;

        const slidesAll = collectSlidesInDomOrder(RevealInstance);
        const slides = slidesAll.filter(s => !isStack(s) && !isHiddenSlide(s));

        // DOM-order traversal pro Slide, damit Nummerierung "gefühlt natürlich" ist
        for (const slide of slides) {
          const citeNodes = Array.from(slide.querySelectorAll(options.citeSelector));
          for (const node of citeNodes) {
            const keys = splitKeys(node.dataset.cite || "");
            for (const k of keys) {
              if (!keyToNumber.has(k)) {
                keyToNumber.set(k, counter++);
              }
            }
          }
        }

        // 2) Inline Marker ersetzen + pro Slide deduplizierte Citation-Bar
        for (const slide of slides) {
          const citeNodes = Array.from(slide.querySelectorAll(options.citeSelector));
          const used = [];
          const usedSet = new Set();

          for (const node of citeNodes) {
            const keys = splitKeys(node.dataset.cite || "");

            // Nummern sicherstellen, auch wenn Key in bib fehlt
            for (const k of keys) {
              if (!keyToNumber.has(k)) keyToNumber.set(k, counter++);
              if (!usedSet.has(k)) {
                usedSet.add(k);
                used.push(k);
              }
            }

            replaceCiteNode(node, keys, keyToNumber, options);
          }

          fillCitationBarInSlide(slide, used, keyToNumber, keyToEntry, options);
        }

        // 3) Sources container befüllen (dedupliziert global)
        const sourcesEl = ensureSourcesContainer(RevealInstance, options);
        if (sourcesEl) {
          const ol = sourcesEl.querySelector("ol.sources-list");
          ol.innerHTML = "";

          // Sortiere nach Nummer
          const items = Array.from(keyToNumber.entries()).sort((a, b) => a[1] - b[1]);
          for (const [key, num] of items) {
            const li = document.createElement("li");
            li.id = `${options.sourceIdPrefix}${key}`;
            li.dataset.citeKey = key;

            const entry = keyToEntry.get(key);
            li.innerHTML = "";
            li.append(document.createTextNode(`${num}. `));
            li.append(formatEntryNodes(entry, lang));

            if (!entry) {
              li.append(document.createTextNode(` (Missing in .bib: ${key})`));
            }

            ol.appendChild(li);
          }
        }
      }
    };
  }

  return plugin();
})();
