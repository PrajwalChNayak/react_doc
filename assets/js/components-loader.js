/**
 * Common Components Loader
 * This script loads and injects common components (header, footer) into each page.
 * It uses the Fetch API to get the HTML content of the components and injects them into
 * placeholder elements.
 */

document.addEventListener('DOMContentLoaded', function () {
    // Function to load an HTML component and inject it into a target element
    async function loadComponent(componentPath, targetSelector) {
        try {
            // Get the component content
            const response = await fetch(componentPath);

            if (!response.ok) {
                throw new Error(`Failed to fetch ${componentPath}: ${response.status} ${response.statusText}`);
            }

            const htmlContent = await response.text();

            // Find the target element where we'll inject our component
            const targetElement = document.querySelector(targetSelector);

            if (targetElement) {
                targetElement.innerHTML = htmlContent;

                // Fix relative paths in the injected content based on the current page depth
                fixRelativePaths(targetElement);

                // Add active class to the current page in the navigation
                if (targetSelector === '#header-placeholder') {
                    highlightCurrentPage();
                }
            } else {
                console.error(`Target element not found: ${targetSelector}`);
            }
        } catch (error) {
            console.error('Error loading component:', error);
        }
    }

    // Function to fix relative paths in the injected content
    function fixRelativePaths(element) {
        // Use the same root path logic for consistency
        const relativePath = getRootPath();

        // Fix href attributes in anchors
        const anchors = element.querySelectorAll('a');
        anchors.forEach(anchor => {
            const href = anchor.getAttribute('href');
            if (href && href.startsWith('/')) {
                anchor.setAttribute('href', relativePath + href.substring(1));
            }
        });

        // Fix src attributes in images and other elements
        const elementsWithSrc = element.querySelectorAll('[src]');
        elementsWithSrc.forEach(el => {
            const src = el.getAttribute('src');
            if (src && src.startsWith('/')) {
                el.setAttribute('src', relativePath + src.substring(1));
            }
        });
    }

    // Function to highlight the current page link in the navigation
    function highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('#header-placeholder nav a');

        navLinks.forEach(link => {
            const href = link.getAttribute('href');

            // Skip if href is not available
            if (!href) return;

            // Get the filename from the current path
            const currentFile = currentPath.split('/').pop();

            // Handle index page specially
            if (currentFile === '' || currentFile === 'index.html') {
                if (href.includes('index.html') || href === './' || href === '/') {
                    link.classList.add('font-medium');
                    link.parentElement.setAttribute('aria-current', 'page');
                }
                return;
            }

            // Get the filename from the link href
            const linkFile = href.split('/').pop();

            if (currentFile === linkFile) {
                link.classList.add('font-medium');
                link.parentElement.setAttribute('aria-current', 'page');
            }
        });
    }

    // Load the header and footer
    const rootPath = getRootPath();
    loadComponent(`${rootPath}assets/templates/header.html`, '#header-placeholder');
    loadComponent(`${rootPath}assets/templates/footer.html`, '#footer-placeholder');

    // Helper function to determine the path to the root directory
    function getRootPath() {
        const path = window.location.pathname;

        // Check if we're in the src directory structure
        if (path.includes('/src/sections/')) {
            return '../../';
        } else if (path.includes('/src/')) {
            return '../';
        }

        // If we're in the sections directory without src in path
        if (path.includes('/sections/')) {
            return '../';
        }

        // If we're at the root or index.html
        return './';
    }
});
