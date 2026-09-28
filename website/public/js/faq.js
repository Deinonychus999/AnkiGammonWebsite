// FAQ accordion functionality

/**
 * Toggle FAQ item open/closed
 * @param {HTMLElement} element - The FAQ question element that was clicked
 */
function toggleFaq(element) {
    const faqItem = element.parentElement;
    const answer = faqItem.querySelector('.faq-answer');
    const opening = !faqItem.classList.contains('active');
    // Animate to the content's own height; a fixed max-height clips long answers on phones.
    answer.style.maxHeight = answer.scrollHeight + 'px';
    if (opening) {
        answer.addEventListener('transitionend', function done() {
            if (faqItem.classList.contains('active')) answer.style.maxHeight = 'none';
            answer.removeEventListener('transitionend', done);
        });
    } else {
        void answer.offsetHeight;
        answer.style.maxHeight = '';
    }
    faqItem.classList.toggle('active', opening);
}

// Make function globally available for inline onclick handlers
window.toggleFaq = toggleFaq;
