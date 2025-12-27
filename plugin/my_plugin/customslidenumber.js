/**
 * Custom Slide Number Plugin for Reveal.js
 * 
 * Renders the slide number in a custom element instead of the default position.
 * Supports all Reveal.js slide number features including:
 * - data-visibility="uncounted"
 * - Vertical slides
 * - All format options (h.v, h/v, c, c/t)
 */
const CustomSlideNumber = () => {
  let deck;
  let element;
  let config;

  return {
    id: 'customSlideNumber',

    init: (reveal) => {
      deck = reveal;
      config = deck.getConfig();

      // Find or create the custom element
      element = document.querySelector(config.customSlideNumberSelector || '.custom-slide-number');
      
      if (!element) {
        console.warn('CustomSlideNumber: Target element not found. Please add an element with the selector:', config.customSlideNumberSelector || '.custom-slide-number');
        return;
      }

      // Disable the default slide number
      deck.configure({ slideNumber: false });

      // Update on slide changes
      deck.on('slidechanged', update);
      deck.on('ready', update);
    },

    /**
     * Updates the custom slide number element
     */
    update() {
      if (!element || !config.customSlideNumber) return;

      const slideNumber = getSlideNumber();
      element.innerHTML = slideNumber;
    }
  };

  /**
   * Returns the HTML string for the current slide number
   * (mirrors the logic from Reveal's SlideNumber controller)
   */
  function getSlideNumber(slide = deck.getCurrentSlide()) {
    if (!config.customSlideNumber) return '';

    let value;
    let format = config.customSlideNumberFormat || 'h.v';

    // Custom function format
    if (typeof config.customSlideNumber === 'function') {
      value = config.customSlideNumber(slide);
    } else {
      // If there are ONLY vertical slides, use flattened format
      if (!/c/.test(format) && deck.getHorizontalSlides().length === 1) {
        format = 'c';
      }

      // Offset by 1 for 1-indexed numbering (respects uncounted slides)
      let horizontalOffset = slide && slide.dataset.visibility === 'uncounted' ? 0 : 1;
      value = [];

      switch (format) {
        case 'c':
          value.push(deck.getSlidePastCount(slide) + horizontalOffset);
          break;
        case 'c/t':
          value.push(deck.getSlidePastCount(slide) + horizontalOffset, '/', deck.getTotalSlides());
          break;
        default:
          let indices = deck.getIndices(slide);
          value.push(indices.h + horizontalOffset);
          let sep = format === 'h/v' ? '/' : '.';
          if (deck.isVerticalSlide(slide)) {
            value.push(sep, indices.v + 1);
          }
      }
    }

    let url = '#' + deck.location.getHash(slide);
    return formatNumber(value[0], value[1], value[2], url);
  }

  /**
   * Formats the slide number as HTML
   */
  function formatNumber(a, delimiter, b, url = '#' + deck.location.getHash()) {
    if (typeof b === 'number' && !isNaN(b)) {
      return `<div href="${url}">
                <span class="slide-number-a">${a}</span>
                <span class="slide-number-delimiter">${delimiter}</span>
                <span class="slide-number-b">${b}</span>
              </div>`;
    } else {
      return `<div href="${url}">
                <span class="slide-number-a">${a}</span>
              </div>`;
    }
  }

  function update() {
    if (!element || !config.customSlideNumber) return;

    const slideNumber = getSlideNumber();
    element.innerHTML = slideNumber;
  }
};

window.CustomSlideNumber = CustomSlideNumber;
