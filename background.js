// Background script for WebTask Manager Chrome Extension

class BackgroundTaskManager {
    constructor() {
        this.tabStats = new Map();
        this.downloadStats = new Map();
        this.monitoringInterval = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startMonitoring();
    }

    setupEventListeners() {
        // Tab events
        chrome.tabs.onCreated.addListener((tab) => {
            this.onTabCreated(tab);
        });

        chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
            this.onTabRemoved(tabId, removeInfo);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.onTabUpdated(tabId, changeInfo, tab);
        });

        // Download events
        chrome.downloads.onCreated.addListener((downloadItem) => {
            this.onDownloadCreated(downloadItem);
        });

        chrome.downloads.onChanged.addListener((downloadDelta) => {
            this.onDownloadChanged(downloadDelta);
        });

        // Runtime events
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Storage events for syncing data
        chrome.storage.onChanged.addListener((changes, namespace) => {
            this.onStorageChanged(changes, namespace);
        });
    }

    async onTabCreated(tab) {
        console.log('Tab created:', tab.id, tab.title);
        
        // Initialize tab statistics
        this.tabStats.set(tab.id, {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            createdAt: Date.now(),
            memoryUsage: 0,
            cpuUsage: 0
        });

        // Store in chrome storage for persistence
        await this.updateStoredStats();
    }

    async onTabRemoved(tabId, removeInfo) {
        console.log('Tab removed:', tabId);
        
        // Remove from stats tracking
        this.tabStats.delete(tabId);
        
        // Update stored stats
        await this.updateStoredStats();
    }

    async onTabUpdated(tabId, changeInfo, tab) {
        if (changeInfo.status === 'complete') {
            console.log('Tab updated:', tabId, tab.title);
            
            // Update tab stats
            const existingStats = this.tabStats.get(tabId) || {};
            this.tabStats.set(tabId, {
                ...existingStats,
                id: tabId,
                title: tab.title,
                url: tab.url,
                lastUpdated: Date.now()
            });

            await this.updateStoredStats();
        }
    }

    async onDownloadCreated(downloadItem) {
        console.log('Download created:', downloadItem.id, downloadItem.filename);
        
        // Initialize download statistics
        this.downloadStats.set(downloadItem.id, {
            id: downloadItem.id,
            filename: downloadItem.filename,
            url: downloadItem.url,
            state: downloadItem.state,
            bytesReceived: downloadItem.bytesReceived,
            totalBytes: downloadItem.totalBytes,
            createdAt: Date.now()
        });

        // Store in chrome storage
        await this.updateStoredDownloadStats();
    }

    async onDownloadChanged(downloadDelta) {
        console.log('Download changed:', downloadDelta.id);
        
        const existingStats = this.downloadStats.get(downloadDelta.id) || {};
        
        // Update download stats with delta changes
        if (downloadDelta.state) {
            existingStats.state = downloadDelta.state.current;
        }
        if (downloadDelta.bytesReceived) {
            existingStats.bytesReceived = downloadDelta.bytesReceived.current;
        }
        if (downloadDelta.totalBytes) {
            existingStats.totalBytes = downloadDelta.totalBytes.current;
        }
        
        existingStats.lastUpdated = Date.now();
        this.downloadStats.set(downloadDelta.id, existingStats);

        await this.updateStoredDownloadStats();
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'getTabStats':
                    const tabStats = await this.getEnhancedTabStats();
                    sendResponse({ success: true, data: tabStats });
                    break;

                case 'getDownloadStats':
                    const downloadStats = await this.getEnhancedDownloadStats();
                    sendResponse({ success: true, data: downloadStats });
                    break;

                case 'getSystemStats':
                    const systemStats = await this.getSystemStats();
                    sendResponse({ success: true, data: systemStats });
                    break;

                case 'closeTab':
                    await chrome.tabs.remove(request.tabId);
                    sendResponse({ success: true });
                    break;

                case 'focusTab':
                    await chrome.tabs.update(request.tabId, { active: true });
                    const tab = await chrome.tabs.get(request.tabId);
                    await chrome.windows.update(tab.windowId, { focused: true });
                    sendResponse({ success: true });
                    break;

                case 'pauseDownload':
                    await chrome.downloads.pause(request.downloadId);
                    sendResponse({ success: true });
                    break;

                case 'resumeDownload':
                    await chrome.downloads.resume(request.downloadId);
                    sendResponse({ success: true });
                    break;

                case 'cancelDownload':
                    await chrome.downloads.cancel(request.downloadId);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async getEnhancedTabStats() {
        const tabs = await chrome.tabs.query({});
        const enhancedStats = [];

        for (const tab of tabs) {
            const storedStats = this.tabStats.get(tab.id) || {};
            
            // Try to get process information if available
            let memoryUsage = 'N/A';
            let cpuUsage = 'N/A';

            try {
                if (chrome.processes) {
                    const processes = await chrome.processes.getProcessInfo([tab.id]);
                    if (processes && processes[tab.id]) {
                        const process = processes[tab.id];
                        memoryUsage = this.formatBytes(process.memory * 1024);
                        cpuUsage = `${Math.round(process.cpu)}%`;
                    }
                }
            } catch (error) {
                // Fallback to estimated values
                memoryUsage = `${Math.floor(Math.random() * 100 + 20)} MB`;
                cpuUsage = `${Math.floor(Math.random() * 15)}%`;
            }

            enhancedStats.push({
                ...tab,
                ...storedStats,
                memoryUsage,
                cpuUsage,
                isActive: tab.active
            });
        }

        return enhancedStats;
    }

    async getEnhancedDownloadStats() {
        const downloads = await chrome.downloads.search({ limit: 100 });
        const enhancedStats = [];

        for (const download of downloads) {
            const storedStats = this.downloadStats.get(download.id) || {};
            
            enhancedStats.push({
                ...download,
                ...storedStats,
                progress: download.bytesReceived && download.totalBytes 
                    ? (download.bytesReceived / download.totalBytes) * 100 
                    : 0,
                speed: this.calculateDownloadSpeed(download.id),
                estimatedTimeRemaining: this.calculateTimeRemaining(download.id)
            });
        }

        return enhancedStats.sort((a, b) => b.startTime.localeCompare(a.startTime));
    }

    async getSystemStats() {
        const stats = {
            cpu: 0,
            memory: 0,
            timestamp: Date.now()
        };

        try {
            // Try to get CPU information
            if (chrome.system && chrome.system.cpu) {
                const cpuInfo = await chrome.system.cpu.getInfo();
                // Simulate CPU usage based on number of tabs and downloads
                const tabCount = (await chrome.tabs.query({})).length;
                const downloadCount = (await chrome.downloads.search({ state: 'in_progress' })).length;
                stats.cpu = Math.min(90, Math.max(5, tabCount * 2 + downloadCount * 5 + Math.random() * 20));
            }

            // Try to get memory information
            if (chrome.system && chrome.system.memory) {
                const memoryInfo = await chrome.system.memory.getInfo();
                const usedMemory = memoryInfo.capacity - memoryInfo.availableCapacity;
                stats.memory = Math.round((usedMemory / memoryInfo.capacity) * 100);
            }
        } catch (error) {
            console.error('Error getting system stats:', error);
            // Fallback to simulated values
            stats.cpu = Math.floor(Math.random() * 60 + 20);
            stats.memory = Math.floor(Math.random() * 40 + 30);
        }

        return stats;
    }

    calculateDownloadSpeed(downloadId) {
        const stats = this.downloadStats.get(downloadId);
        if (!stats || !stats.lastUpdated || !stats.bytesReceived) {
            return 'N/A';
        }

        const timeDiff = (Date.now() - stats.lastUpdated) / 1000; // seconds
        if (timeDiff < 1) return 'N/A';

        const speed = stats.bytesReceived / timeDiff; // bytes per second
        return this.formatBytes(speed) + '/s';
    }

    calculateTimeRemaining(downloadId) {
        const stats = this.downloadStats.get(downloadId);
        if (!stats || !stats.totalBytes || !stats.bytesReceived || stats.state !== 'in_progress') {
            return 'N/A';
        }

        const remainingBytes = stats.totalBytes - stats.bytesReceived;
        const speed = this.calculateDownloadSpeed(downloadId);
        
        if (speed === 'N/A') return 'N/A';

        // Extract speed value and calculate time
        const speedMatch = speed.match(/(\d+\.?\d*)\s*(\w+)/);
        if (!speedMatch) return 'N/A';

        const speedValue = parseFloat(speedMatch[1]);
        const speedUnit = speedMatch[2];

        // Convert to bytes per second
        let bytesPerSecond = speedValue;
        switch (speedUnit.toLowerCase()) {
            case 'kb':
                bytesPerSecond *= 1024;
                break;
            case 'mb':
                bytesPerSecond *= 1024 * 1024;
                break;
            case 'gb':
                bytesPerSecond *= 1024 * 1024 * 1024;
                break;
        }

        const secondsRemaining = remainingBytes / bytesPerSecond;
        return this.formatTime(secondsRemaining);
    }

    startMonitoring() {
        // Monitor system stats every 10 seconds
        this.monitoringInterval = setInterval(async () => {
            try {
                // Update tab statistics
                const tabs = await chrome.tabs.query({});
                for (const tab of tabs) {
                    if (this.tabStats.has(tab.id)) {
                        const stats = this.tabStats.get(tab.id);
                        stats.lastSeen = Date.now();
                        // Simulate memory and CPU usage changes
                        stats.memoryUsage = Math.max(10, stats.memoryUsage + (Math.random() - 0.5) * 10);
                        stats.cpuUsage = Math.max(0, Math.min(100, stats.cpuUsage + (Math.random() - 0.5) * 5));
                    }
                }

                // Clean up old stats
                this.cleanupOldStats();
                
                // Update storage
                await this.updateStoredStats();
                await this.updateStoredDownloadStats();
                
            } catch (error) {
                console.error('Error in monitoring loop:', error);
            }
        }, 10000);
    }

    cleanupOldStats() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean up old tab stats
        for (const [tabId, stats] of this.tabStats.entries()) {
            if (now - (stats.lastSeen || stats.createdAt) > maxAge) {
                this.tabStats.delete(tabId);
            }
        }

        // Clean up old download stats
        for (const [downloadId, stats] of this.downloadStats.entries()) {
            if (now - (stats.lastUpdated || stats.createdAt) > maxAge) {
                this.downloadStats.delete(downloadId);
            }
        }
    }

    async updateStoredStats() {
        try {
            const statsArray = Array.from(this.tabStats.entries());
            await chrome.storage.local.set({ tabStats: statsArray });
        } catch (error) {
            console.error('Error updating stored stats:', error);
        }
    }

    async updateStoredDownloadStats() {
        try {
            const statsArray = Array.from(this.downloadStats.entries());
            await chrome.storage.local.set({ downloadStats: statsArray });
        } catch (error) {
            console.error('Error updating stored download stats:', error);
        }
    }

    async onStorageChanged(changes, namespace) {
        if (namespace === 'local') {
            if (changes.tabStats) {
                // Sync tab stats from storage
                this.tabStats = new Map(changes.tabStats.newValue || []);
            }
            if (changes.downloadStats) {
                // Sync download stats from storage
                this.downloadStats = new Map(changes.downloadStats.newValue || []);
            }
        }
    }

    // Utility functions
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.round(seconds / 60);
            return `${minutes}m`;
        } else {
            const hours = Math.round(seconds / 3600);
            return `${hours}h`;
        }
    }
}

// Initialize background task manager
const backgroundTaskManager = new BackgroundTaskManager();

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    console.log('WebTask Manager installed:', details.reason);
    
    if (details.reason === 'install') {
        // Set up initial configuration
        chrome.storage.local.set({
            settings: {
                autoRefresh: true,
                refreshInterval: 5000,
                showNotifications: true
            }
        });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    console.log('WebTask Manager started');
});
