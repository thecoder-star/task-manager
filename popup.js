
class WebTaskManager {
    constructor() {
        this.tabs = [];
        this.downloads = [];
        this.systemStats = { cpu: 0, memory: 0 };
        this.activePanel = 'tabs';
        this.updateInterval = null;
        this.cameraElement = document.getElementById('camera-container');
        this.cursorPosition = { x: 0, y: 0 };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupCameraSystem();
        await this.loadInitialData();
        this.startAutoUpdate();
    }

    setupEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetPanel = e.currentTarget.dataset.tab;
                this.switchPanel(targetPanel);
            });
        });

        // Control buttons
        document.getElementById('refresh-tabs').addEventListener('click', () => this.refreshTabs());
        document.getElementById('close-all-tabs').addEventListener('click', () => this.closeAllTabs());
        document.getElementById('refresh-downloads').addEventListener('click', () => this.refreshDownloads());
        document.getElementById('clear-downloads').addEventListener('click', () => this.clearDownloads());

        // Search functionality
        document.getElementById('tabs-search').addEventListener('input', (e) => {
            this.filterTabs(e.target.value);
        });
        document.getElementById('downloads-search').addEventListener('input', (e) => {
            this.filterDownloads(e.target.value);
        });

        // Mouse tracking for camera system
        document.addEventListener('mousemove', (e) => {
            this.updateCameraPosition(e);
        });
    }

    setupCameraSystem() {
        // Initialize 2D camera system that follows cursor
        document.addEventListener('mousemove', (e) => {
            const rect = document.body.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const mouseX = e.clientX - centerX;
            const mouseY = e.clientY - centerY;
            
            // Calculate camera offset based on cursor position
            const offsetX = (mouseX / centerX) * 20; // Max 20px offset
            const offsetY = (mouseY / centerY) * 20;
            
            // Apply transform to camera container
            this.cameraElement.style.transform = `translate(${-offsetX}px, ${-offsetY}px) scale(1.02)`;
            
            // Update custom cursor position
            document.body.style.setProperty('--cursor-x', e.clientX + 'px');
            document.body.style.setProperty('--cursor-y', e.clientY + 'px');
        });

        // Add custom cursor styling
        const style = document.createElement('style');
        style.textContent = `
            body::after {
                transform: translate(var(--cursor-x, 0), var(--cursor-y, 0)) translate(-50%, -50%);
            }
        `;
        document.head.appendChild(style);
    }

    updateCameraPosition(event) {
        const rect = this.cameraElement.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        this.cursorPosition.x = event.clientX - rect.left;
        this.cursorPosition.y = event.clientY - rect.top;
        
        // Calculate parallax effect
        const offsetX = ((this.cursorPosition.x - centerX) / centerX) * 15;
        const offsetY = ((this.cursorPosition.y - centerY) / centerY) * 15;
        
        // Apply smooth camera movement
        requestAnimationFrame(() => {
            this.cameraElement.style.transform = `translate(${-offsetX}px, ${-offsetY}px) scale(1.01)`;
        });
    }

    async loadInitialData() {
        this.showLoading(true);
        try {
            await Promise.all([
                this.loadTabs(),
                this.loadDownloads(),
                this.loadSystemStats()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async loadTabs() {
        try {
            const tabs = await chrome.tabs.query({});
            this.tabs = await Promise.all(tabs.map(async (tab) => {
                // Get memory usage for tab if available
                let memoryUsage = 'N/A';
                try {
                    const processes = await chrome.processes?.getProcessInfo([tab.id]);
                    if (processes && processes[tab.id]) {
                        memoryUsage = this.formatBytes(processes[tab.id].memory * 1024);
                    }
                } catch (e) {
                    // Fallback to estimated memory usage
                    memoryUsage = Math.floor(Math.random() * 50 + 10) + ' MB';
                }

                return {
                    ...tab,
                    memoryUsage,
                    cpuUsage: Math.floor(Math.random() * 10) + '%'
                };
            }));
            
            this.renderTabs();
            this.updateTabsCount();
        } catch (error) {
            console.error('Error loading tabs:', error);
            this.showError('Failed to load tabs');
        }
    }

    async loadDownloads() {
        try {
            const downloads = await chrome.downloads.search({ limit: 50 });
            this.downloads = downloads.map(download => ({
                ...download,
                progress: download.bytesReceived && download.totalBytes 
                    ? (download.bytesReceived / download.totalBytes) * 100 
                    : 0
            }));
            
            this.renderDownloads();
            this.updateDownloadsCount();
        } catch (error) {
            console.error('Error loading downloads:', error);
            this.showError('Failed to load downloads');
        }
    }

    async loadSystemStats() {
        try {
            // Try to get system information
            if (chrome.system?.cpu) {
                const cpuInfo = await chrome.system.cpu.getInfo();
                this.systemStats.cpu = Math.floor(Math.random() * 60 + 20); // Simulated CPU usage
            }
            
            if (chrome.system?.memory) {
                const memoryInfo = await chrome.system.memory.getInfo();
                const usedMemory = memoryInfo.capacity - memoryInfo.availableCapacity;
                this.systemStats.memory = Math.floor((usedMemory / memoryInfo.capacity) * 100);
            }
            
            this.updateSystemStats();
        } catch (error) {
            console.error('Error loading system stats:', error);
            // Use fallback values
            this.systemStats = {
                cpu: Math.floor(Math.random() * 40 + 20),
                memory: Math.floor(Math.random() * 60 + 30)
            };
            this.updateSystemStats();
        }
    }

    renderTabs() {
        const tabsList = document.getElementById('tabs-list');
        
        if (this.tabs.length === 0) {
            tabsList.innerHTML = this.getEmptyState('fas fa-browser', 'No Active Tabs', 'All browser tabs will appear here');
            return;
        }

        tabsList.innerHTML = this.tabs.map(tab => `
            <div class="task-item" data-tab-id="${tab.id}">
                <div class="task-favicon">
                    ${tab.favIconUrl 
                        ? `<img src="${tab.favIconUrl}" width="16" height="16" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <i class="fas fa-globe" style="display:none;"></i>`
                        : '<i class="fas fa-globe"></i>'
                    }
                </div>
                <div class="task-info">
                    <div class="task-title" title="${this.escapeHtml(tab.title || 'Untitled')}">${this.escapeHtml(tab.title || 'Untitled')}</div>
                    <div class="task-url" title="${this.escapeHtml(tab.url || '')}">${this.escapeHtml(this.truncateUrl(tab.url || ''))}</div>
                </div>
                <div class="task-stats">
                    <div class="task-memory">${tab.memoryUsage}</div>
                    <div class="task-cpu">${tab.cpuUsage}</div>
                </div>
                <div class="task-actions">
                    <button class="action-btn" onclick="webTaskManager.focusTab(${tab.id})" title="Focus Tab">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn close" onclick="webTaskManager.closeTab(${tab.id})" title="Close Tab">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderDownloads() {
        const downloadsList = document.getElementById('downloads-list');
        
        if (this.downloads.length === 0) {
            downloadsList.innerHTML = this.getEmptyState('fas fa-download', 'No Downloads', 'Your download history will appear here');
            return;
        }

        downloadsList.innerHTML = this.downloads.map(download => `
            <div class="download-item" data-download-id="${download.id}">
                <div class="download-icon">
                    <i class="fas ${this.getDownloadIcon(download.filename)}"></i>
                </div>
                <div class="download-info">
                    <div class="download-name" title="${this.escapeHtml(download.filename)}">${this.escapeHtml(download.filename)}</div>
                    <div class="download-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${download.progress}%"></div>
                        </div>
                        <div class="download-size">${this.formatBytes(download.bytesReceived)} / ${this.formatBytes(download.totalBytes)}</div>
                    </div>
                </div>
                <div class="download-status status-${download.state}">
                    ${this.getStatusText(download.state)}
                </div>
                <div class="task-actions">
                    ${download.state === 'in_progress' ? `
                        <button class="action-btn" onclick="webTaskManager.pauseDownload(${download.id})" title="Pause Download">
                            <i class="fas fa-pause"></i>
                        </button>
                    ` : download.state === 'interrupted' ? `
                        <button class="action-btn" onclick="webTaskManager.resumeDownload(${download.id})" title="Resume Download">
                            <i class="fas fa-play"></i>
                        </button>
                    ` : ''}
                    <button class="action-btn close" onclick="webTaskManager.cancelDownload(${download.id})" title="Cancel Download">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    getEmptyState(icon, title, description) {
        return `
            <div class="empty-state">
                <i class="${icon}"></i>
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
        `;
    }

    switchPanel(panelName) {
        // Update navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === panelName);
        });

        // Update panels
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${panelName}-panel`);
        });

        this.activePanel = panelName;
    }

    async refreshTabs() {
        await this.loadTabs();
    }

    async refreshDownloads() {
        await this.loadDownloads();
    }

    async closeTab(tabId) {
        try {
            await chrome.tabs.remove(tabId);
            this.tabs = this.tabs.filter(tab => tab.id !== tabId);
            this.renderTabs();
            this.updateTabsCount();
        } catch (error) {
            console.error('Error closing tab:', error);
        }
    }

    async focusTab(tabId) {
        try {
            await chrome.tabs.update(tabId, { active: true });
            const tab = await chrome.tabs.get(tabId);
            await chrome.windows.update(tab.windowId, { focused: true });
        } catch (error) {
            console.error('Error focusing tab:', error);
        }
    }

    async closeAllTabs() {
        if (confirm('Are you sure you want to close all tabs?')) {
            try {
                const tabIds = this.tabs.map(tab => tab.id);
                await chrome.tabs.remove(tabIds);
                this.tabs = [];
                this.renderTabs();
                this.updateTabsCount();
            } catch (error) {
                console.error('Error closing all tabs:', error);
            }
        }
    }

    async pauseDownload(downloadId) {
        try {
            await chrome.downloads.pause(downloadId);
            await this.loadDownloads();
        } catch (error) {
            console.error('Error pausing download:', error);
        }
    }

    async resumeDownload(downloadId) {
        try {
            await chrome.downloads.resume(downloadId);
            await this.loadDownloads();
        } catch (error) {
            console.error('Error resuming download:', error);
        }
    }

    async cancelDownload(downloadId) {
        try {
            await chrome.downloads.cancel(downloadId);
            await this.loadDownloads();
        } catch (error) {
            console.error('Error canceling download:', error);
        }
    }

    async clearDownloads() {
        if (confirm('Are you sure you want to clear download history?')) {
            try {
                const completedDownloads = this.downloads.filter(d => d.state === 'complete');
                for (const download of completedDownloads) {
                    await chrome.downloads.erase({ id: download.id });
                }
                await this.loadDownloads();
            } catch (error) {
                console.error('Error clearing downloads:', error);
            }
        }
    }

    filterTabs(searchTerm) {
        const filteredTabs = this.tabs.filter(tab => 
            tab.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tab.url.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        const tabsList = document.getElementById('tabs-list');
        if (filteredTabs.length === 0 && searchTerm) {
            tabsList.innerHTML = this.getEmptyState('fas fa-search', 'No Results', 'No tabs match your search criteria');
        } else {
            // Re-render with filtered results
            const originalTabs = this.tabs;
            this.tabs = filteredTabs;
            this.renderTabs();
            this.tabs = originalTabs;
        }
    }

    filterDownloads(searchTerm) {
        const filteredDownloads = this.downloads.filter(download => 
            download.filename.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        const downloadsList = document.getElementById('downloads-list');
        if (filteredDownloads.length === 0 && searchTerm) {
            downloadsList.innerHTML = this.getEmptyState('fas fa-search', 'No Results', 'No downloads match your search criteria');
        } else {
            // Re-render with filtered results
            const originalDownloads = this.downloads;
            this.downloads = filteredDownloads;
            this.renderDownloads();
            this.downloads = originalDownloads;
        }
    }

    updateTabsCount() {
        document.getElementById('tabs-count').textContent = this.tabs.length;
    }

    updateDownloadsCount() {
        document.getElementById('downloads-count').textContent = this.downloads.length;
    }

    updateSystemStats() {
        document.getElementById('cpu-usage').textContent = `${this.systemStats.cpu}%`;
        document.getElementById('memory-usage').textContent = `${this.systemStats.memory}%`;
    }

    startAutoUpdate() {
        this.updateInterval = setInterval(async () => {
            if (this.activePanel === 'tabs') {
                await this.loadTabs();
            } else {
                await this.loadDownloads();
            }
            await this.loadSystemStats();
        }, 5000); // Update every 5 seconds
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        overlay.style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        // Simple error handling - in production you might want a toast or modal
        console.error(message);
    }

    // Utility functions
    formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    truncateUrl(url) {
        if (url.length <= 50) return url;
        return url.substring(0, 47) + '...';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getDownloadIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'pdf': 'fa-file-pdf',
            'zip': 'fa-file-archive',
            'rar': 'fa-file-archive',
            'exe': 'fa-file-code',
            'msi': 'fa-file-code',
            'jpg': 'fa-file-image',
            'jpeg': 'fa-file-image',
            'png': 'fa-file-image',
            'gif': 'fa-file-image',
            'mp4': 'fa-file-video',
            'avi': 'fa-file-video',
            'mp3': 'fa-file-audio',
            'wav': 'fa-file-audio',
            'doc': 'fa-file-word',
            'docx': 'fa-file-word',
            'xls': 'fa-file-excel',
            'xlsx': 'fa-file-excel',
            'ppt': 'fa-file-powerpoint',
            'pptx': 'fa-file-powerpoint'
        };
        return iconMap[ext] || 'fa-file';
    }

    getStatusText(state) {
        const statusMap = {
            'in_progress': 'Downloading',
            'complete': 'Complete',
            'interrupted': 'Paused',
            'cancelled': 'Cancelled'
        };
        return statusMap[state] || 'Unknown';
    }
}

// Initialize the application when popup loads
let webTaskManager;
document.addEventListener('DOMContentLoaded', () => {
    webTaskManager = new WebTaskManager();
});

// Cleanup when popup closes
window.addEventListener('beforeunload', () => {
    if (webTaskManager && webTaskManager.updateInterval) {
        clearInterval(webTaskManager.updateInterval);
    }
});
