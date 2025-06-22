// Content script for WebTask Manager Chrome Extension

class ContentScriptManager {
    constructor() {
        this.isActive = false;
        this.performanceData = {
            memoryUsage: 0,
            cpuUsage: 0,
            networkActivity: 0,
            domNodes: 0
        };
        this.monitoringInterval = null;
        
        this.init();
    }

    init() {
        // Only initialize if not already active
        if (this.isActive) return;
        
        this.isActive = true;
        this.setupMessageListener();
        this.startPerformanceMonitoring();
        this.injectPerformanceObserver();
    }

    setupMessageListener() {
        // Listen for messages from popup or background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async response
        });
    }

    handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'getPagePerformance':
                    this.getPagePerformanceData().then(data => {
                        sendResponse({ success: true, data });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    break;

                case 'getPageInfo':
                    const pageInfo = this.getPageInfo();
                    sendResponse({ success: true, data: pageInfo });
                    break;

                case 'getResourceUsage':
                    this.getResourceUsage().then(data => {
                        sendResponse({ success: true, data });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    break;

                case 'cleanup':
                    this.cleanup();
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async getPagePerformanceData() {
        const performance = window.performance;
        const data = {
            timestamp: Date.now(),
            loadTime: 0,
            domContentLoaded: 0,
            firstPaint: 0,
            firstContentfulPaint: 0,
            memoryUsage: this.performanceData.memoryUsage,
            resourceCount: 0,
            networkRequests: []
        };

        // Navigation timing
        if (performance.timing) {
            const timing = performance.timing;
            data.loadTime = timing.loadEventEnd - timing.navigationStart;
            data.domContentLoaded = timing.domContentLoadedEventEnd - timing.navigationStart;
        }

        // Paint timing
        if (performance.getEntriesByType) {
            const paintEntries = performance.getEntriesByType('paint');
            paintEntries.forEach(entry => {
                if (entry.name === 'first-paint') {
                    data.firstPaint = entry.startTime;
                } else if (entry.name === 'first-contentful-paint') {
                    data.firstContentfulPaint = entry.startTime;
                }
            });
        }

        // Resource entries
        if (performance.getEntriesByType) {
            const resourceEntries = performance.getEntriesByType('resource');
            data.resourceCount = resourceEntries.length;
            
            data.networkRequests = resourceEntries.slice(-10).map(entry => ({
                name: entry.name,
                type: entry.initiatorType,
                size: entry.transferSize || 0,
                duration: entry.duration,
                startTime: entry.startTime
            }));
        }

        // Memory usage (if available)
        if (performance.memory) {
            data.memoryUsage = {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }

        return data;
    }

    getPageInfo() {
        return {
            title: document.title,
            url: window.location.href,
            domain: window.location.hostname,
            protocol: window.location.protocol,
            documentReady: document.readyState,
            domNodes: document.querySelectorAll('*').length,
            images: document.images.length,
            links: document.links.length,
            scripts: document.scripts.length,
            stylesheets: document.styleSheets.length,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            scrollPosition: {
                x: window.scrollX,
                y: window.scrollY
            }
        };
    }

    async getResourceUsage() {
        const usage = {
            timestamp: Date.now(),
            cpu: this.performanceData.cpuUsage,
            memory: this.performanceData.memoryUsage,
            network: this.performanceData.networkActivity,
            dom: {
                nodes: document.querySelectorAll('*').length,
                depth: this.getDOMDepth(),
                listeners: this.getEventListenerCount()
            },
            storage: {
                localStorage: this.getStorageSize('localStorage'),
                sessionStorage: this.getStorageSize('sessionStorage')
            }
        };

        // Add performance observer data if available
        if (window.PerformanceObserver) {
            try {
                usage.longTasks = await this.getLongTasksData();
                usage.layoutShifts = await this.getLayoutShiftsData();
            } catch (error) {
                console.warn('Performance observer error:', error);
            }
        }

        return usage;
    }

    startPerformanceMonitoring() {
        // Monitor performance metrics every 5 seconds
        this.monitoringInterval = setInterval(() => {
            this.updatePerformanceData();
        }, 5000);

        // Initial update
        this.updatePerformanceData();
    }

    updatePerformanceData() {
        // Update memory usage
        if (window.performance && window.performance.memory) {
            const memory = window.performance.memory;
            this.performanceData.memoryUsage = {
                used: memory.usedJSHeapSize,
                total: memory.totalJSHeapSize,
                percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)
            };
        }

        // Estimate CPU usage based on task performance
        this.performanceData.cpuUsage = this.estimateCPUUsage();

        // Update DOM node count
        this.performanceData.domNodes = document.querySelectorAll('*').length;

        // Update network activity
        this.performanceData.networkActivity = this.getNetworkActivity();
    }

    estimateCPUUsage() {
        // Simple CPU usage estimation based on various factors
        let cpuEstimate = 0;

        // Factor in DOM complexity
        const domNodes = document.querySelectorAll('*').length;
        cpuEstimate += Math.min(20, domNodes / 100);

        // Factor in active timers and intervals
        cpuEstimate += this.getActiveTimerCount() * 2;

        // Factor in recent performance entries
        if (window.performance && window.performance.getEntriesByType) {
            const recentEntries = window.performance.getEntriesByType('measure').length;
            cpuEstimate += Math.min(10, recentEntries);
        }

        // Add some randomness to simulate actual CPU fluctuation
        cpuEstimate += Math.random() * 10;

        return Math.min(100, Math.max(0, Math.round(cpuEstimate)));
    }

    getNetworkActivity() {
        if (!window.performance || !window.performance.getEntriesByType) {
            return 0;
        }

        const recentTime = Date.now() - 10000; // Last 10 seconds
        const resourceEntries = window.performance.getEntriesByType('resource');
        
        const recentEntries = resourceEntries.filter(entry => 
            entry.startTime > recentTime
        );

        return recentEntries.reduce((total, entry) => 
            total + (entry.transferSize || 0), 0
        );
    }

    injectPerformanceObserver() {
        if (!window.PerformanceObserver) return;

        try {
            // Observe long tasks
            const longTaskObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.duration > 50) { // Tasks longer than 50ms
                        this.performanceData.cpuUsage = Math.min(100, this.performanceData.cpuUsage + 5);
                    }
                }
            });
            longTaskObserver.observe({ entryTypes: ['longtask'] });

            // Observe layout shifts
            const layoutShiftObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.value > 0.1) { // Significant layout shift
                        console.log('Layout shift detected:', entry.value);
                    }
                }
            });
            layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });

        } catch (error) {
            console.warn('Performance observer setup failed:', error);
        }
    }

    async getLongTasksData() {
        return new Promise((resolve) => {
            if (!window.PerformanceObserver) {
                resolve([]);
                return;
            }

            const longTasks = [];
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    longTasks.push({
                        duration: entry.duration,
                        startTime: entry.startTime,
                        name: entry.name
                    });
                }
            });

            try {
                observer.observe({ entryTypes: ['longtask'] });
                setTimeout(() => {
                    observer.disconnect();
                    resolve(longTasks);
                }, 1000);
            } catch (error) {
                resolve([]);
            }
        });
    }

    async getLayoutShiftsData() {
        return new Promise((resolve) => {
            if (!window.PerformanceObserver) {
                resolve([]);
                return;
            }

            const layoutShifts = [];
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    layoutShifts.push({
                        value: entry.value,
                        startTime: entry.startTime,
                        hadRecentInput: entry.hadRecentInput
                    });
                }
            });

            try {
                observer.observe({ entryTypes: ['layout-shift'] });
                setTimeout(() => {
                    observer.disconnect();
                    resolve(layoutShifts);
                }, 1000);
            } catch (error) {
                resolve([]);
            }
        });
    }

    getDOMDepth() {
        let maxDepth = 0;
        
        function getDepth(element, depth = 0) {
            maxDepth = Math.max(maxDepth, depth);
            for (const child of element.children) {
                getDepth(child, depth + 1);
            }
        }
        
        if (document.documentElement) {
            getDepth(document.documentElement);
        }
        
        return maxDepth;
    }

    getEventListenerCount() {
        // This is an approximation as we can't directly count all event listeners
        let count = 0;
        
        // Count elements with common event attributes
        const eventAttributes = ['onclick', 'onload', 'onchange', 'onsubmit', 'onmouseover'];
        eventAttributes.forEach(attr => {
            count += document.querySelectorAll(`[${attr}]`).length;
        });
        
        return count;
    }

    getActiveTimerCount() {
        // This is an estimation as we can't directly access timer counts
        // We'll estimate based on page complexity
        const scripts = document.scripts.length;
        const complexity = document.querySelectorAll('*').length;
        
        return Math.floor((scripts + complexity / 1000) * 0.1);
    }

    getStorageSize(storageType) {
        try {
            const storage = window[storageType];
            let size = 0;
            
            for (let key in storage) {
                if (storage.hasOwnProperty(key)) {
                    size += storage[key].length + key.length;
                }
            }
            
            return size;
        } catch (error) {
            return 0;
        }
    }

    cleanup() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.isActive = false;
    }
}

// Initialize content script manager
let contentScriptManager;

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        contentScriptManager = new ContentScriptManager();
    });
} else {
    contentScriptManager = new ContentScriptManager();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (contentScriptManager) {
        contentScriptManager.cleanup();
    }
});
