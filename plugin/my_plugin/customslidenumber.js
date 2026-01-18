// plugin/custom-slide-number/custom-slide-number.js
const RevealCustomSlideNumber = (() => {
  const TARGET = "[data-slide-number]";

  function isLeafSlide(sectionEl) {
    return !!sectionEl && sectionEl.tagName === "SECTION" && !sectionEl.querySelector(":scope > section");
  }

  function hideDefaultSlideNumberUi() {
    const style = document.createElement("style");
    style.dataset.customSlideNumber = "true";
    style.textContent = `.reveal .slide-number { display: none !important; }`;
    document.head.appendChild(style);
  }

  function plugin() {
    let Reveal;

    function getLeafSlidesInDomOrder() {
      const slidesEl = Reveal.getSlidesElement();
      return Array.from(
        slidesEl.querySelectorAll(":scope > section, :scope > section > section")
      ).filter(isLeafSlide);
    }

    // Normal (nicht-PDF): pro Slide Reveal-HTML verwenden
    function fillAllLive() {
      const sn = Reveal.slideNumber;
      if (!sn || typeof sn.getSlideNumber !== "function") return;

      for (const slide of getLeafSlidesInDomOrder()) {
        const targets = slide.querySelectorAll(TARGET);
        if (!targets.length) continue;

        const html = sn.getSlideNumber(slide); // <a><span...></a>
        for (const el of targets) el.innerHTML = html;
      }
    }

    // PDF/Print: pro pdf-page die korrekte Nummer aus .slide-number-pdf übernehmen
    function fillAllPdf() {
      const pages = Array.from(document.querySelectorAll(".pdf-page"));
      if (!pages.length) return;

      for (const page of pages) {
        const pdfNumberEl = page.querySelector(".slide-number-pdf");
        if (!pdfNumberEl) continue;

        // Das ist die "echte" Print-Nummer (inkl. Fragment-Suffix wie 5.2)
        const txt = (pdfNumberEl.textContent || "").trim();
        if (!txt) continue;

        // In der pdf-page steckt (mindestens) ein Slide-<section>
        const slide = page.querySelector("section");
        if (!slide) continue;

        const targets = slide.querySelectorAll(TARGET);
        for (const el of targets) {
          // Im PDF sind Links egal → Text reicht und ist stabil
          el.textContent = txt;
        }
      }
    }

    return {
      id: "customSlideNumber",
      init: function (reveal) {
        Reveal = reveal;

        // SlideNumber-Controller muss aktiv bleiben, sonst gibt's kein Reveal.slideNumber
        hideDefaultSlideNumberUi();

        Reveal.on("ready", () => {
          fillAllLive();

          // Falls man direkt im Print-View startet:
          if (document.documentElement.classList.contains("print-pdf")) {
            fillAllPdf();
          }
        });

        // DAS ist der entscheidende Hook für den PDF-Export
        Reveal.on("pdf-ready", fillAllPdf);
      }
    };
  }

  return plugin();
})();
