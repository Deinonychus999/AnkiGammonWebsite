// Resolves links marked with [data-resolve-versioned] to the matching
// versioned asset on the latest GitHub release. The legacy unversioned
// asset is still uploaded with each release for backwards compatibility,
// so the static href in HTML remains a working fallback.

const GITHUB_REPO = 'Deinonychus999/AnkiGammon';

async function resolveVersionedDownloads() {
    const links = document.querySelectorAll('a[data-resolve-versioned]');
    if (links.length === 0) return;

    let assets;
    try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!res.ok) return;
        const data = await res.json();
        assets = data.assets || [];
    } catch (e) {
        return;
    }

    links.forEach(link => {
        const url = new URL(link.href);
        const filename = url.pathname.split('/').pop();
        const dotIdx = filename.lastIndexOf('.');
        if (dotIdx <= 0) return;
        const base = filename.substring(0, dotIdx);
        const ext = filename.substring(dotIdx);
        const escapedExt = ext.replace(/\./g, '\\.');
        const pattern = new RegExp(`^${base}-\\d.*${escapedExt}$`);

        const match = assets.find(a => pattern.test(a.name));
        if (match && match.browser_download_url) {
            link.href = match.browser_download_url;
        }
    });
}

window.resolveVersionedDownloads = resolveVersionedDownloads;
