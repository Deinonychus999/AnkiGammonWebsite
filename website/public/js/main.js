// Main initialization script

// Initialize on page load
window.addEventListener('load', () => {
    if (window.detectAndShowPlatform) {
        window.detectAndShowPlatform();
    }
    if (window.initSmoothScroll) {
        window.initSmoothScroll();
    }
});
