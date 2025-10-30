// Carousel functionality using Embla Carousel

(function() {
    function initCarousel() {
        // Check if Embla is loaded
        if (typeof EmblaCarousel === 'undefined') {
            console.error('EmblaCarousel is not loaded. Please check CDN connection.');
            return;
        }

        const emblaNode = document.querySelector('.embla__viewport');
        if (!emblaNode) {
            console.error('Carousel viewport not found');
            return;
        }

        const prevBtn = document.querySelector('.embla__button--prev');
        const nextBtn = document.querySelector('.embla__button--next');
        const dotsNode = document.querySelector('.embla__dots');

        // Embla options
        const options = {
            loop: true,
            align: 'start',
            skipSnaps: false,
        };

        // Initialize Embla (no autoplay)
        const emblaApi = EmblaCarousel(emblaNode, options);

        // Previous button
        const scrollPrev = () => {
            emblaApi.scrollPrev();
        };

        // Next button
        const scrollNext = () => {
            emblaApi.scrollNext();
        };

        // Setup dots
        const setupDots = () => {
            if (!dotsNode) return;

            const scrollSnaps = emblaApi.scrollSnapList();
            dotsNode.innerHTML = '';

            scrollSnaps.forEach((_, index) => {
                const dot = document.createElement('button');
                dot.className = 'embla__dot';
                dot.type = 'button';
                dot.setAttribute('aria-label', `Go to slide ${index + 1}`);

                dot.addEventListener('click', () => emblaApi.scrollTo(index));
                dotsNode.appendChild(dot);
            });
        };

        // Update dots
        const updateDots = () => {
            if (!dotsNode) return;

            const dots = dotsNode.querySelectorAll('.embla__dot');
            const selectedIndex = emblaApi.selectedScrollSnap();

            dots.forEach((dot, index) => {
                if (index === selectedIndex) {
                    dot.classList.add('embla__dot--selected');
                } else {
                    dot.classList.remove('embla__dot--selected');
                }
            });
        };

        // Update button states
        const updateButtons = () => {
            if (prevBtn) {
                prevBtn.disabled = !emblaApi.canScrollPrev();
            }
            if (nextBtn) {
                nextBtn.disabled = !emblaApi.canScrollNext();
            }
        };

        // Attach button listeners
        if (prevBtn) {
            prevBtn.addEventListener('click', scrollPrev, false);
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', scrollNext, false);
        }

        // Setup keyboard navigation
        document.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
                scrollPrev();
            } else if (event.key === 'ArrowRight') {
                scrollNext();
            }
        });

        // Initialize
        setupDots();
        updateDots();
        updateButtons();

        // Listen to events
        emblaApi.on('select', () => {
            updateDots();
            updateButtons();
        });

        emblaApi.on('reInit', () => {
            setupDots();
            updateDots();
            updateButtons();
        });

        console.log('Embla Carousel initialized successfully');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCarousel);
    } else {
        // DOM is already ready
        initCarousel();
    }

    // Also expose to window
    window.initCarousel = initCarousel;
})();
