// FAQ accordion functionality

/**
 * Toggle FAQ item open/closed
 * @param {HTMLElement} element - The FAQ question element that was clicked
 */
function toggleFaq(element) {
    const faqItem = element.parentElement;
    faqItem.classList.toggle('active');
}

// Make function globally available for inline onclick handlers
window.toggleFaq = toggleFaq;
