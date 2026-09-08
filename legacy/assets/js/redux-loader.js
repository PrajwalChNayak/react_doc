/**
 * Redux Component Loader
 * Dynamically loads Redux-related sections as tabs and manages tab interactions
 */

class ReduxComponentLoader {
    constructor() {
        this.basePath = 'redux/';
        this.sections = [
            { id: 'redux-fundamentals', file: 'redux-fundamentals.html', title: 'Redux Core' },
            { id: 'redux-toolkit', file: 'redux-toolkit.html', title: 'Redux Toolkit' },
            { id: 'redux-persist', file: 'redux-persist.html', title: 'Redux Persist' },
            { id: 'rtk-query', file: 'rtk-query.html', title: 'RTK Query' },
            { id: 'best-practices', file: 'best-practices.html', title: 'Best Practices' }
        ];
        this.loadedSections = new Map(); // Cache loaded content
        this.currentTab = 'redux-fundamentals'; // Default active tab
    }

    /**
     * Load a single section component
     * @param {string} filePath - Path to the HTML component file
     * @returns {Promise<string>} - HTML content
     */
    async loadComponent(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load component: ${response.status}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error loading component from ${filePath}:`, error);
            return `<div class="error-message">Failed to load ${filePath}</div>`;
        }
    }

    /**
     * Load a specific section for a tab
     * @param {string} sectionId - ID of the section to load
     * @returns {Promise<string>} - HTML content
     */
    async loadSection(sectionId) {
        // Check if already loaded
        if (this.loadedSections.has(sectionId)) {
            return this.loadedSections.get(sectionId);
        }

        const section = this.sections.find(s => s.id === sectionId);
        if (!section) {
            throw new Error(`Section ${sectionId} not found`);
        }

        const content = await this.loadComponent(`${this.basePath}${section.file}`);
        this.loadedSections.set(sectionId, content);
        return content;
    }

    /**
     * Initialize tab functionality and load the first tab
     */
    async initializeTabs() {
        console.log('🚀 Initializing Redux tabs...');

        try {
            // Set up tab click handlers
            this.setupTabHandlers();

            // Set up navigation button handlers
            this.setupNavigationHandlers();

            // Load the first tab
            await this.switchTab(this.currentTab);

            console.log('✅ Redux tabs initialized successfully');

        } catch (error) {
            console.error('❌ Error initializing Redux tabs:', error);
            this.showError('Failed to initialize Redux content');
        }
    }

    /**
     * Set up event handlers for tab buttons
     */
    setupTabHandlers() {
        const tabButtons = document.querySelectorAll('.tab-button');

        tabButtons.forEach(button => {
            button.addEventListener('click', async (e) => {
                e.preventDefault();
                const tabId = button.getAttribute('data-tab');
                await this.switchTab(tabId);
            });
        });
    }

    /**
     * Set up navigation button handlers
     */
    setupNavigationHandlers() {
        const prevBtn = document.getElementById('prev-section-btn');
        const nextBtn = document.getElementById('next-section-btn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.navigateToPrevious());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.navigateToNext());
        }
    }

    /**
     * Navigate to the previous section
     */
    async navigateToPrevious() {
        const currentIndex = this.sections.findIndex(s => s.id === this.currentTab);
        if (currentIndex > 0) {
            const prevSection = this.sections[currentIndex - 1];
            await this.switchTab(prevSection.id);
            this.scrollToTabs();
        }
    }

    /**
     * Navigate to the next section
     */
    async navigateToNext() {
        const currentIndex = this.sections.findIndex(s => s.id === this.currentTab);
        if (currentIndex < this.sections.length - 1) {
            const nextSection = this.sections[currentIndex + 1];
            await this.switchTab(nextSection.id);
            this.scrollToTabs();
        }
    }

    /**
     * Scroll to the tabs section smoothly
     */
    scrollToTabs() {
        const tabsSection = document.getElementById('redux-tabs-section');
        if (tabsSection) {
            tabsSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    /**
     * Switch to a specific tab
     * @param {string} tabId - ID of the tab to switch to
     */
    async switchTab(tabId) {
        try {
            // Update active tab button
            this.updateActiveTab(tabId);

            // Show loading state
            this.showLoadingState();

            // Load and display content
            const content = await this.loadSection(tabId);
            this.displayTabContent(content);

            // Update current tab
            this.currentTab = tabId;

            // Update navigation buttons
            this.updateNavigationButtons();

            // Initialize syntax highlighting for new content
            this.initializeSyntaxHighlighting();

        } catch (error) {
            console.error(`Error switching to tab ${tabId}:`, error);
            this.showError(`Failed to load ${tabId}`);
        }
    }

    /**
     * Update the active tab button styling
     * @param {string} activeTabId - ID of the active tab
     */
    updateActiveTab(activeTabId) {
        const tabButtons = document.querySelectorAll('.tab-button');

        tabButtons.forEach(button => {
            const tabId = button.getAttribute('data-tab');
            if (tabId === activeTabId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    /**
     * Show loading state in tab content
     */
    showLoadingState() {
        const container = document.getElementById('redux-tab-content');
        if (container) {
            container.classList.add('tab-loading');
            container.innerHTML = `
                <div class="flex items-center justify-center py-16">
                    <div class="text-center">
                        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                        <p class="text-gray-600">Loading content...</p>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Display content in the tab container
     * @param {string} content - HTML content to display
     */
    displayTabContent(content) {
        const container = document.getElementById('redux-tab-content');
        if (container) {
            container.classList.remove('tab-loading');
            container.innerHTML = `<div class="tab-content active">${content}</div>`;
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     */
    showError(message) {
        const container = document.getElementById('redux-tab-content');
        if (container) {
            container.classList.remove('tab-loading');
            container.innerHTML = `
                <div class="flex items-center justify-center py-16">
                    <div class="text-center text-red-600">
                        <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                        <p class="text-lg font-medium">${message}</p>
                        <button onclick="window.reduxLoader.switchTab('${this.currentTab}')" 
                                class="mt-4 px-4 py-2 bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition-colors">
                            Try Again
                        </button>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Update navigation buttons state and titles
     */
    updateNavigationButtons() {
        const currentIndex = this.sections.findIndex(s => s.id === this.currentTab);
        const prevBtn = document.getElementById('prev-section-btn');
        const nextBtn = document.getElementById('next-section-btn');
        const prevTitle = document.getElementById('prev-section-title');
        const nextTitle = document.getElementById('next-section-title');
        const currentIndicator = document.getElementById('current-section-indicator');

        // Update section indicator
        if (currentIndicator) {
            currentIndicator.textContent = `${currentIndex + 1} of ${this.sections.length}`;
        }

        // Update progress dots
        this.sections.forEach((_, index) => {
            const dot = document.getElementById(`progress-dot-${index}`);
            if (dot) {
                if (index === currentIndex) {
                    dot.className = 'w-2 h-2 rounded-full bg-purple-600';
                } else {
                    dot.className = 'w-2 h-2 rounded-full bg-gray-300';
                }
            }
        });

        // Update previous button
        if (prevBtn && prevTitle) {
            if (currentIndex > 0) {
                prevBtn.disabled = false;
                prevTitle.textContent = this.sections[currentIndex - 1].title;
            } else {
                prevBtn.disabled = true;
                prevTitle.textContent = '--';
            }
        }

        // Update next button
        if (nextBtn && nextTitle) {
            if (currentIndex < this.sections.length - 1) {
                nextBtn.disabled = false;
                nextTitle.textContent = this.sections[currentIndex + 1].title;
            } else {
                nextBtn.disabled = true;
                nextTitle.textContent = '--';
            }
        }
    }

    /**
     * Initialize syntax highlighting for newly loaded content
     */
    initializeSyntaxHighlighting() {
        // Check if hljs (highlight.js) is available
        if (typeof hljs !== 'undefined') {
            document.querySelectorAll('#redux-tab-content pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
    }

    /**
     * Initialize scroll-based navigation highlighting
     */
    initializeScrollNavigation() {
        const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
        const sections = document.querySelectorAll('section[id]');

        if (navLinks.length === 0 || sections.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        // Remove active class from all nav links
                        navLinks.forEach(link => link.classList.remove('active'));

                        // Add active class to corresponding nav link
                        const activeLink = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
                        if (activeLink) {
                            activeLink.classList.add('active');
                        }
                    }
                });
            },
            { threshold: 0.3, rootMargin: '-20% 0px -20% 0px' }
        );

        sections.forEach(section => observer.observe(section));
    }

    /**
     * Initialize smooth scrolling for anchor links within tab content
     */
    initializeSmoothScrolling() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#redux-tab-content') && e.target.matches('a[href^="#"]')) {
                e.preventDefault();
                const targetId = e.target.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    }

    /**
     * Initialize the Redux component loader with tab functionality
     */
    async init() {
        console.log('🚀 Initializing Redux Component Loader...');

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeTabs());
        } else {
            await this.initializeTabs();
        }

        // Initialize additional features
        this.initializeScrollNavigation();
        this.initializeSmoothScrolling();
    }
}

// Auto-initialize when script is loaded
if (typeof window !== 'undefined') {
    window.reduxLoader = new ReduxComponentLoader();
    window.reduxLoader.init();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReduxComponentLoader;
}
