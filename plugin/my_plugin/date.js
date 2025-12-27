/**
 * Reveal.js Date Injection Plugin
 * Searches for elements with data-date attribute and injects the current date
 */
const DatePlugin = {
  id: 'datePlugin',
  
  init: (deck) => {
    // Function to format the date
    const formatDate = (format) => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      
      // Support different formats
      switch(format) {
        case 'de':
          return `${day}.${month}.${year}`;
        case 'us':
          return `${month}/${day}/${year}`;
        case 'iso':
          return `${year}-${month}-${day}`;
        case 'long-de':
          const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                         'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
          return `${day}. ${months[now.getMonth()]} ${year}`;
        default:
          return `${day}.${month}.${year}`;
      }
    };
    
    // Find all elements with data-date attribute
    const elements = deck.getRevealElement().querySelectorAll('[data-date]');
    
    // Inject date into each element
    elements.forEach(element => {
      const format = element.getAttribute('data-date') || 'de';
      element.textContent = formatDate(format);
    });
    
    console.log(`Date Injection Plugin: ${elements.length} date(s) injected`);
  }
};

// Make plugin available globally
window.DatePlugin = DatePlugin;
