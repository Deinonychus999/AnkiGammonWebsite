// Smooth scroll navigation functionality

/**
 * Initialize smooth scrolling for all anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

                // Close mobile menu after clicking a link
                const navLinks = document.querySelector('.nav-links');
                const menuToggle = document.querySelector('.mobile-menu-toggle');
                if (navLinks && menuToggle) {
                    navLinks.classList.remove('active');
                    menuToggle.classList.remove('active');
                }
            }
        });
    });
}

/**
 * Initialize mobile menu toggle
 */
function initMobileMenu() {
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (!menuToggle || !navLinks) return;

    // Toggle menu on button click
    menuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        this.classList.toggle('active');
        navLinks.classList.toggle('active');
    });

    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
            navLinks.classList.remove('active');
            menuToggle.classList.remove('active');
        }
    });

    // Prevent menu from closing when clicking inside it
    navLinks.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
            menuToggle.classList.remove('active');
        }
    });

    // Close menu when resizing to desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            navLinks.classList.remove('active');
            menuToggle.classList.remove('active');
        }
    });
}

// Make functions globally available
window.initSmoothScroll = initSmoothScroll;
window.initMobileMenu = initMobileMenu;

// Auto-initialize when DOM is ready (since script is deferred)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initSmoothScroll();
        initMobileMenu();
    });
} else {
    // DOM already loaded
    initSmoothScroll();
    initMobileMenu();
}
