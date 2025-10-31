// Lightbox functionality for carousel images

(function() {
    function initLightbox() {
        // Create lightbox element
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <div class="lightbox__overlay"></div>
            <div class="lightbox__content">
                <button class="lightbox__close" aria-label="Close lightbox">
                    <svg class="icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
                <img class="lightbox__image" src="" alt="">
                <p class="lightbox__caption"></p>
            </div>
        `;
        document.body.appendChild(lightbox);

        const overlay = lightbox.querySelector('.lightbox__overlay');
        const content = lightbox.querySelector('.lightbox__content');
        const closeBtn = lightbox.querySelector('.lightbox__close');
        const img = lightbox.querySelector('.lightbox__image');
        const caption = lightbox.querySelector('.lightbox__caption');

        // Open lightbox
        function openLightbox(imageSrc, imageAlt, captionText) {
            img.src = imageSrc;
            img.alt = imageAlt;
            caption.textContent = captionText || '';
            lightbox.classList.add('lightbox--active');
            document.body.style.overflow = 'hidden';
        }

        // Close lightbox
        function closeLightbox() {
            lightbox.classList.remove('lightbox--active');
            document.body.style.overflow = '';
            // Clear image after animation
            setTimeout(() => {
                img.src = '';
                img.alt = '';
                caption.textContent = '';
            }, 300);
        }

        // Event listeners
        closeBtn.addEventListener('click', closeLightbox);
        overlay.addEventListener('click', closeLightbox);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('lightbox--active')) {
                closeLightbox();
            }
        });

        // Close when clicking on the image (zoom-out behavior)
        img.addEventListener('click', closeLightbox);

        // Make all carousel images clickable
        const carouselImages = document.querySelectorAll('.embla__slide img');
        carouselImages.forEach(image => {
            const slide = image.closest('.embla__slide');
            const captionElement = slide.querySelector('.slide-caption');
            const captionText = captionElement ? captionElement.textContent : '';

            // Add cursor zoom-in style
            image.style.cursor = 'zoom-in';
            image.setAttribute('title', 'Click to view full size');

            // Add click handler
            image.addEventListener('click', () => {
                openLightbox(image.src, image.alt, captionText);
            });
        });

        console.log('Lightbox initialized successfully');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLightbox);
    } else {
        initLightbox();
    }
})();
