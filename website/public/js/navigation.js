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
            }
        });
    });
}

/**
 * Initialize scroll-hide navigation
 * Hides nav on scroll down, shows on scroll up (mobile only)
 */
function initScrollHideNav() {
    const nav = document.querySelector('.nav');
    if (!nav) return;

    let lastScrollTop = 0;
    let ticking = false;

    function updateNavVisibility() {
        // Only hide nav on mobile screens
        if (window.innerWidth > 768) {
            nav.classList.remove('nav-hidden');
            return;
        }

        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        // Show nav at top of page
        if (scrollTop < 100) {
            nav.classList.remove('nav-hidden');
        }
        // Hide when scrolling down, show when scrolling up
        else if (scrollTop > lastScrollTop) {
            nav.classList.add('nav-hidden');
        } else {
            nav.classList.remove('nav-hidden');
        }

        lastScrollTop = scrollTop;
        ticking = false;
    }

    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(updateNavVisibility);
            ticking = true;
        }
    });

    // Also check on resize
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            nav.classList.remove('nav-hidden');
        }
    });
}

// Make functions globally available
window.initSmoothScroll = initSmoothScroll;
window.initScrollHideNav = initScrollHideNav;

// Auto-initialize when DOM is ready (since script is deferred)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initSmoothScroll();
        initScrollHideNav();
    });
} else {
    // DOM already loaded
    initSmoothScroll();
    initScrollHideNav();
}
