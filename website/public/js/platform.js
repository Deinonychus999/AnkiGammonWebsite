// Platform switcher functionality

/**
 * Show the installation instructions for a specific platform
 * @param {string} platform - The platform to show ('windows', 'macos', or 'linux')
 */
function showPlatform(platform) {
    // Hide all install sections
    document.querySelectorAll('.install-section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected platform
    document.getElementById(platform + '-install').classList.add('active');

    // Add active class to clicked button
    document.querySelector(`[onclick="showPlatform('${platform}')"]`).classList.add('active');
}

/**
 * Auto-detect user's OS and pre-select appropriate install instructions
 */
function detectAndShowPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    let platform = 'windows'; // default

    if (userAgent.indexOf('mac') !== -1) {
        platform = 'macos';
    } else if (userAgent.indexOf('linux') !== -1 || userAgent.indexOf('x11') !== -1) {
        platform = 'linux';
    }

    // Silently pre-select the correct platform (don't trigger animation)
    if (platform !== 'windows') {
        document.querySelectorAll('.platform-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.install-section').forEach(section => {
            section.classList.remove('active');
        });

        document.querySelector(`[onclick="showPlatform('${platform}')"]`).classList.add('active');
        document.getElementById(platform + '-install').classList.add('active');
    }
}

// Make functions globally available for inline onclick handlers
window.showPlatform = showPlatform;
window.detectAndShowPlatform = detectAndShowPlatform;
