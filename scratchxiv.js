// ScratchXiv - Research Paper Reader Application

// Wait for PDF.js to load
if (typeof pdfjsLib === 'undefined') {
    console.error('PDF.js library not loaded!');
}

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Application State
class ScratchXivApp {
    constructor() {
        console.log('Initializing ScratchXiv...');
        this.tabs = [];
        this.activeTabId = null;
        this.currentPdf = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.selectedHighlightColor = '#fef08a';
        this.highlightMode = true;
        this.storageReady = false;
        
        this.init();
    }
    
    async init() {
        console.log('Initializing IndexedDB...');
        try {
            await window.scratchXivStorage.init();
            this.storageReady = true;
            console.log('IndexedDB ready');
        } catch (error) {
            console.error('IndexedDB initialization failed:', error);
            console.log('Falling back to localStorage');
        }
        
        console.log('Loading from storage...');
        await this.loadFromStorage();
        console.log('Binding events...');
        this.bindEvents();
        console.log('Applying theme...');
        this.applyTheme();
        console.log('Rendering tabs...');
        this.renderTabs();
        
        // Create default tab if no tabs exist
        if (this.tabs.length === 0) {
            console.log('Creating default tab...');
            this.createNewTab();
        } else {
            console.log('Switching to existing tab...');
            await this.switchToTab(this.activeTabId || this.tabs[0].id);
        }
        
        console.log('ScratchXiv initialized successfully!');
        
        // Show storage info
        this.logStorageInfo();
    }
    
    // Storage Methods
    async loadFromStorage() {
        try {
            let data = null;
            
            if (this.storageReady) {
                data = await window.scratchXivStorage.loadAppData();
            } else {
                // Fallback to localStorage
                const stored = localStorage.getItem('scratchxiv_data');
                if (stored) {
                    data = JSON.parse(stored);
                }
            }
            
            if (data) {
                this.tabs = data.tabs || [];
                this.activeTabId = data.activeTabId;
                console.log('Loaded', this.tabs.length, 'tabs from storage');
            }
            
            const theme = localStorage.getItem('scratchxiv_theme');
            if (theme) {
                document.documentElement.setAttribute('data-theme', theme);
            }
        } catch (e) {
            console.error('Error loading from storage:', e);
        }
    }
    
    async saveToStorage() {
        try {
            const data = {
                tabs: this.tabs.map(tab => ({
                    id: tab.id,
                    name: tab.name,
                    pdfName: tab.pdfName,
                    pdfPath: tab.pdfPath,
                    hasPdf: !!tab.hasPdf,
                    notes: tab.notes,
                    highlights: tab.highlights,
                    lastPage: tab.lastPage,
                    lastScale: tab.lastScale
                })),
                activeTabId: this.activeTabId
            };
            
            if (this.storageReady) {
                await window.scratchXivStorage.saveAppData(data);
            } else {
                // Fallback to localStorage
                localStorage.setItem('scratchxiv_data', JSON.stringify(data));
            }
            
            console.log('Saved to storage');
        } catch (e) {
            console.error('Error saving to storage:', e);
            // Try localStorage as fallback
            try {
                const dataStr = JSON.stringify(data);
                localStorage.setItem('scratchxiv_data', dataStr);
                console.log('Saved to localStorage as fallback');
            } catch (lsError) {
                console.error('localStorage also failed:', lsError);
                alert('Failed to save data. Storage may be full.');
            }
        }
    }
    
    async logStorageInfo() {
        if (this.storageReady) {
            const info = await window.scratchXivStorage.getStorageInfo();
            if (info) {
                console.log('Storage Info:', info);
            }
        }
    }
    
    // Theme Methods
    applyTheme() {
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        console.log('Applied theme:', theme);
    }
    
    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('scratchxiv_theme', newTheme);
        console.log('Toggled theme to:', newTheme);
    }
    
    // Tab Methods
    createNewTab(name = 'Untitled Paper') {
        const tab = {
            id: Date.now().toString(),
            name: name,
            pdfName: null,
            pdfPath: null,
            hasPdf: false,
            notes: '',
            highlights: [],
            lastPage: 1,
            lastScale: 1.0
        };
        
        this.tabs.push(tab);
        this.switchToTab(tab.id);
        this.renderTabs();
        this.saveToStorage();
        
        console.log('Created new tab:', tab.name);
        return tab;
    }
    
    async switchToTab(tabId) {
        console.log('Switching to tab:', tabId);
        
        // Save current tab state BEFORE switching
        if (this.activeTabId && this.activeTabId !== tabId) {
            const oldTab = this.getActiveTab();
            if (oldTab) {
                oldTab.notes = document.getElementById('notesTextarea').value;
                oldTab.lastPage = this.currentPage;
                oldTab.lastScale = this.scale;
                console.log('Saved state for tab:', oldTab.name, 'notes length:', oldTab.notes.length);
            }
        }
        
        this.activeTabId = tabId;
        const tab = this.getActiveTab();
        
        if (tab) {
            // Load tab state
            this.currentPage = tab.lastPage || 1;
            this.scale = tab.lastScale || 1.0;
            
            // Update notes - force update
            const notesTextarea = document.getElementById('notesTextarea');
            notesTextarea.value = tab.notes || '';
            console.log('Loaded notes for tab:', tab.name, 'notes length:', (tab.notes || '').length);
            
            // Render PDF if available
            if (tab.hasPdf && this.storageReady) {
                console.log('Loading PDF from IndexedDB for tab:', tab.name);
                await this.loadPdfFromIndexedDB(tab.id);
            } else {
                console.log('No PDF data for tab:', tab.name);
                this.clearPdfViewer();
            }
            
            // Render highlights list
            this.renderHighlightsList();
        }
        
        this.renderTabs();
        await this.saveToStorage();
    }
    
    async closeTab(tabId) {
        console.log('Closing tab:', tabId);
        const index = this.tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;
        
        // Delete PDF from IndexedDB
        if (this.storageReady) {
            try {
                await window.scratchXivStorage.deletePdf(tabId);
                console.log('Deleted PDF from IndexedDB for tab:', tabId);
            } catch (error) {
                console.error('Error deleting PDF:', error);
            }
        }
        
        this.tabs.splice(index, 1);
        
        if (this.tabs.length === 0) {
            this.createNewTab();
        } else if (this.activeTabId === tabId) {
            const newIndex = Math.min(index, this.tabs.length - 1);
            await this.switchToTab(this.tabs[newIndex].id);
        }
        
        this.renderTabs();
        await this.saveToStorage();
    }
    
    renameTab(tabId, newName) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.name = newName;
            this.renderTabs();
            this.saveToStorage();
            console.log('Renamed tab to:', newName);
        }
    }
    
    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }
    
    saveCurrentTabState() {
        const tab = this.getActiveTab();
        if (tab) {
            tab.notes = document.getElementById('notesTextarea').value;
            tab.lastPage = this.currentPage;
            tab.lastScale = this.scale;
            this.saveToStorage();
        }
    }
    
    renderTabs() {
        const container = document.getElementById('tabsContainer');
        container.innerHTML = '';
        
        this.tabs.forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = `tab ${tab.id === this.activeTabId ? 'active' : ''}`;
            tabEl.dataset.tabId = tab.id;
            
            // Add title with PDF info
            let title = tab.name;
            if (tab.pdfName && tab.pdfName !== tab.name) {
                title += `\nPDF: ${tab.pdfName}`;
            }
            tabEl.title = title;
            
            // Add PDF indicator
            const pdfIndicator = tab.hasPdf ? '<span class="pdf-indicator">📄</span>' : '';
            
            tabEl.innerHTML = `
                ${pdfIndicator}
                <span class="tab-title">${this.escapeHtml(tab.name)}</span>
                <span class="tab-close" data-tab-id="${tab.id}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </span>
            `;
            
            tabEl.addEventListener('click', async (e) => {
                if (!e.target.closest('.tab-close')) {
                    await this.switchToTab(tab.id);
                }
            });
            
            tabEl.addEventListener('dblclick', (e) => {
                if (!e.target.closest('.tab-close')) {
                    this.showRenameModal(tab.id);
                }
            });
            
            const closeBtn = tabEl.querySelector('.tab-close');
            closeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.closeTab(tab.id);
            });
            
            container.appendChild(tabEl);
        });
        
        console.log('Rendered', this.tabs.length, 'tabs');
    }
    
    // PDF Methods
    async loadPdf(file) {
        console.log('Loading PDF file:', file.name, 'Size:', this.formatBytes(file.size));
        try {
            const tab = this.getActiveTab();
            if (!tab) {
                console.error('No active tab');
                return;
            }
            
            // Save file info
            tab.pdfName = file.name;
            tab.pdfPath = file.name; // We can't store actual path due to security, but store name
            tab.hasPdf = true;
            
            if (tab.name === 'Untitled Paper') {
                tab.name = file.name.replace('.pdf', '');
                this.renderTabs();
            }
            
            // Save PDF to IndexedDB
            if (this.storageReady) {
                console.log('Saving PDF to IndexedDB...');
                await window.scratchXivStorage.savePdf(tab.id, file, file.name);
                console.log('PDF saved to IndexedDB');
            }
            
            // Load and render PDF
            const arrayBuffer = await file.arrayBuffer();
            await this.renderPdfFromArrayBuffer(arrayBuffer);
            
            await this.saveToStorage();
            console.log('PDF loaded successfully');
        } catch (error) {
            console.error('Error loading PDF:', error);
            alert('Error loading PDF file: ' + error.message);
        }
    }
    
    async loadPdfFromIndexedDB(tabId) {
        if (!this.storageReady) {
            console.log('IndexedDB not ready');
            return;
        }
        
        try {
            const pdfData = await window.scratchXivStorage.loadPdf(tabId);
            
            if (pdfData && pdfData.blob) {
                console.log('Loading PDF from IndexedDB:', pdfData.fileName);
                const arrayBuffer = await pdfData.blob.arrayBuffer();
                await this.renderPdfFromArrayBuffer(arrayBuffer);
                console.log('PDF loaded from IndexedDB successfully');
            } else {
                console.log('No PDF found in IndexedDB for tab:', tabId);
                this.clearPdfViewer();
            }
        } catch (error) {
            console.error('Error loading PDF from IndexedDB:', error);
            this.clearPdfViewer();
        }
    }
    
    async renderPdfFromArrayBuffer(arrayBuffer) {
        try {
            const bytes = new Uint8Array(arrayBuffer);
            
            this.currentPdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            this.totalPages = this.currentPdf.numPages;
            
            document.getElementById('totalPages').textContent = this.totalPages;
            document.getElementById('currentPageInput').max = this.totalPages;
            
            document.getElementById('pdfPlaceholder').classList.add('hidden');
            document.getElementById('pdfCanvasContainer').classList.add('visible');
            
            await this.renderPage();
            console.log('PDF rendered, total pages:', this.totalPages);
        } catch (error) {
            console.error('Error rendering PDF:', error);
            alert('Error rendering PDF: ' + error.message);
        }
    }
    
    
    clearPdfViewer() {
        this.currentPdf = null;
        this.totalPages = 0;
        this.currentPage = 1;
        
        document.getElementById('totalPages').textContent = '0';
        document.getElementById('currentPageInput').value = 1;
        document.getElementById('pdfPlaceholder').classList.remove('hidden');
        document.getElementById('pdfCanvasContainer').classList.remove('visible');
        
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        document.getElementById('textLayer').innerHTML = '';
        document.getElementById('highlightLayer').innerHTML = '';
        
        console.log('PDF viewer cleared');
    }
    
    async renderPage() {
        if (!this.currentPdf) {
            console.log('No PDF to render');
            return;
        }
        
        console.log('Rendering page', this.currentPage, 'at scale', this.scale);
        
        try {
            const page = await this.currentPdf.getPage(this.currentPage);
            const viewport = page.getViewport({ scale: this.scale });
            
            const canvas = document.getElementById('pdfCanvas');
            const ctx = canvas.getContext('2d');
            
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            const container = document.getElementById('pdfCanvasContainer');
            container.style.width = viewport.width + 'px';
            container.style.height = viewport.height + 'px';
            
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;
            
            // Render text layer for selection
            await this.renderTextLayer(page, viewport);
            
            // Render highlights
            this.renderHighlights();
            
            // Update UI
            document.getElementById('currentPageInput').value = this.currentPage;
            document.getElementById('zoomLevel').textContent = Math.round(this.scale * 100) + '%';
            
            console.log('Page rendered successfully');
        } catch (error) {
            console.error('Error rendering page:', error);
            alert('Error rendering page: ' + error.message);
        }
    }
    
    async renderTextLayer(page, viewport) {
        const textLayer = document.getElementById('textLayer');
        textLayer.innerHTML = '';
        textLayer.style.width = viewport.width + 'px';
        textLayer.style.height = viewport.height + 'px';
        
        try {
            const textContent = await page.getTextContent();
            
            textContent.items.forEach(item => {
                const span = document.createElement('span');
                const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
                
                span.textContent = item.str;
                span.style.position = 'absolute';
                span.style.left = tx[4] + 'px';
                span.style.top = (tx[5] - tx[0]) + 'px';
                span.style.fontSize = Math.abs(tx[0]) + 'px';
                span.style.fontFamily = item.fontName || 'sans-serif';
                span.style.transformOrigin = '0% 0%';
                
                // Make text selectable
                span.style.userSelect = 'text';
                span.style.cursor = 'text';
                
                textLayer.appendChild(span);
            });
            
            console.log('Text layer rendered with', textContent.items.length, 'items');
        } catch (error) {
            console.error('Error rendering text layer:', error);
        }
    }
    
    // Navigation Methods
    goToPage(pageNum) {
        if (!this.currentPdf) return;
        
        pageNum = Math.max(1, Math.min(pageNum, this.totalPages));
        if (pageNum !== this.currentPage) {
            this.currentPage = pageNum;
            this.renderPage();
            this.saveCurrentTabState();
            console.log('Navigated to page:', pageNum);
        }
    }
    
    nextPage() {
        this.goToPage(this.currentPage + 1);
    }
    
    prevPage() {
        this.goToPage(this.currentPage - 1);
    }
    
    // Zoom Methods
    setZoom(newScale) {
        newScale = Math.max(0.25, Math.min(3, newScale));
        if (newScale !== this.scale) {
            this.scale = newScale;
            this.renderPage();
            this.saveCurrentTabState();
            console.log('Zoom set to:', Math.round(newScale * 100) + '%');
        }
    }
    
    zoomIn() {
        this.setZoom(this.scale + 0.25);
    }
    
    zoomOut() {
        this.setZoom(this.scale - 0.25);
    }
    
    // Highlight Methods
    addHighlight(text, rects, color) {
        const tab = this.getActiveTab();
        if (!tab) return;
        
        const highlight = {
            id: Date.now().toString() + Math.random(),
            text: text,
            page: this.currentPage,
            rects: rects, // Array of rectangles for multi-line selections
            color: color,
            scale: this.scale
        };
        
        tab.highlights.push(highlight);
        this.renderHighlights();
        this.renderHighlightsList();
        this.saveToStorage();
        console.log('Added highlight on page', this.currentPage, 'with', rects.length, 'rectangles');
    }
    
    deleteHighlight(highlightId) {
        const tab = this.getActiveTab();
        if (!tab) return;
        
        const beforeCount = tab.highlights.length;
        tab.highlights = tab.highlights.filter(h => h.id !== highlightId);
        const afterCount = tab.highlights.length;
        
        this.renderHighlights();
        this.renderHighlightsList();
        this.saveToStorage();
        console.log('Deleted highlight:', highlightId, '(removed', beforeCount - afterCount, 'highlight)');
    }
    
    renderHighlights() {
        const tab = this.getActiveTab();
        const highlightLayer = document.getElementById('highlightLayer');
        highlightLayer.innerHTML = '';
        
        if (!tab) return;
        
        const pageHighlights = tab.highlights.filter(h => h.page === this.currentPage);
        
        pageHighlights.forEach(highlight => {
            // Handle both old format (single rect) and new format (multiple rects)
            const rects = highlight.rects || [highlight.rect];
            
            // Scale the rectangles based on current scale vs original scale
            const scaleRatio = this.scale / highlight.scale;
            
            // Create a div for each rectangle in the highlight
            rects.forEach(rect => {
                const div = document.createElement('div');
                div.className = 'highlight';
                div.dataset.highlightId = highlight.id;
                
                div.style.left = (rect.left * scaleRatio) + 'px';
                div.style.top = (rect.top * scaleRatio) + 'px';
                div.style.width = (rect.width * scaleRatio) + 'px';
                div.style.height = (rect.height * scaleRatio) + 'px';
                div.style.backgroundColor = highlight.color;
                
                div.addEventListener('click', () => {
                    if (confirm('Delete this highlight?')) {
                        this.deleteHighlight(highlight.id);
                    }
                });
                
                highlightLayer.appendChild(div);
            });
        });
    }
    
    renderHighlightsList() {
        const tab = this.getActiveTab();
        const container = document.getElementById('highlightsList');
        
        if (!tab || tab.highlights.length === 0) {
            container.innerHTML = '<p class="empty-state">No highlights yet. Select text in the PDF to highlight.</p>';
            return;
        }
        
        container.innerHTML = '';
        
        // Sort by page
        const sortedHighlights = [...tab.highlights].sort((a, b) => a.page - b.page);
        
        // Filter to only show highlights with text
        const textHighlights = sortedHighlights.filter(h => h.text && h.text.trim());
        
        if (textHighlights.length === 0) {
            container.innerHTML = '<p class="empty-state">No highlights yet. Select text in the PDF to highlight.</p>';
            return;
        }
        
        textHighlights.forEach(highlight => {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            item.style.setProperty('--highlight-color', highlight.color);
            
            // Show how many rectangles this highlight spans
            const rects = highlight.rects || [highlight.rect];
            const rectsInfo = rects.length > 1 ? ` (${rects.length} lines)` : '';
            
            item.innerHTML = `
                <div class="highlight-text">${this.escapeHtml(highlight.text)}</div>
                <div class="highlight-page">Page ${highlight.page}${rectsInfo}</div>
                <button class="delete-highlight" data-highlight-id="${highlight.id}" title="Delete highlight">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            `;
            
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-highlight')) {
                    this.goToPage(highlight.page);
                }
            });
            
            const deleteBtn = item.querySelector('.delete-highlight');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Delete button clicked for highlight:', highlight.id);
                this.deleteHighlight(highlight.id);
            });
            
            container.appendChild(item);
        });
        
        console.log('Rendered', textHighlights.length, 'highlights in list');
    }
    
    handleTextSelection() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        if (!text || !this.highlightMode) {
            console.log('No text selected or highlight mode disabled');
            return;
        }
        
        console.log('Text selected:', text.substring(0, 50) + '...');
        
        try {
            const range = selection.getRangeAt(0);
            const clientRects = range.getClientRects();
            
            if (clientRects.length === 0) {
                console.log('No rects found for selection');
                return;
            }
            
            const container = document.getElementById('pdfCanvasContainer');
            const containerRect = container.getBoundingClientRect();
            
            console.log('Container position:', {
                left: containerRect.left,
                top: containerRect.top
            });
            
            // Collect all rectangles for this selection
            const highlightRects = [];
            
            for (let i = 0; i < clientRects.length; i++) {
                const rect = clientRects[i];
                
                // Calculate position relative to the PDF container (not the viewport or scroll)
                const highlightRect = {
                    left: rect.left - containerRect.left,
                    top: rect.top - containerRect.top,
                    width: rect.width,
                    height: rect.height
                };
                
                // Filter out tiny/invalid rectangles
                if (highlightRect.width > 1 && highlightRect.height > 1) {
                    highlightRects.push(highlightRect);
                    console.log('Rect', i, ':', highlightRect);
                }
            }
            
            if (highlightRects.length > 0) {
                // Create a single highlight with all rectangles
                this.addHighlight(text, highlightRects, this.selectedHighlightColor);
                console.log('Created highlight with', highlightRects.length, 'rectangles');
            } else {
                console.log('No valid rectangles found');
            }
            
            selection.removeAllRanges();
            console.log('Highlight added successfully');
        } catch (error) {
            console.error('Error handling text selection:', error);
        }
    }
    
    // Export Methods
    exportNotes() {
        const tab = this.getActiveTab();
        if (!tab) return;
        
        let content = `# ${tab.name}\n\n`;
        content += `## Notes\n\n${tab.notes || 'No notes.'}\n\n`;
        content += `## Highlights\n\n`;
        
        if (tab.highlights.length === 0) {
            content += 'No highlights.\n';
        } else {
            const sortedHighlights = [...tab.highlights]
                .filter(h => h.text)
                .sort((a, b) => a.page - b.page);
            
            sortedHighlights.forEach(h => {
                content += `- **Page ${h.page}**: "${h.text}"\n`;
            });
        }
        
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tab.name}_notes.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Exported notes for:', tab.name);
    }
    
    // Modal Methods
    showRenameModal(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;
        
        const modal = document.getElementById('renameModal');
        const input = document.getElementById('renameInput');
        
        input.value = tab.name;
        modal.classList.add('visible');
        modal.dataset.tabId = tabId;
        
        input.focus();
        input.select();
    }
    
    hideRenameModal() {
        const modal = document.getElementById('renameModal');
        modal.classList.remove('visible');
    }
    
    confirmRename() {
        const modal = document.getElementById('renameModal');
        const input = document.getElementById('renameInput');
        const tabId = modal.dataset.tabId;
        
        if (input.value.trim()) {
            this.renameTab(tabId, input.value.trim());
        }
        
        this.hideRenameModal();
    }
    
    // Utility Methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // Event Binding
    bindEvents() {
        // Theme toggle
        const themeBtn = document.getElementById('toggleTheme');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                console.log('Theme toggle clicked');
                this.toggleTheme();
            });
        }
        
        // Add tab
        const addTabBtn = document.getElementById('addTabBtn');
        if (addTabBtn) {
            addTabBtn.addEventListener('click', () => {
                console.log('Add tab clicked');
                this.createNewTab();
            });
        }
        
        // PDF loading
        const pdfInput = document.getElementById('pdfInput');
        if (pdfInput) {
            pdfInput.addEventListener('change', async (e) => {
                console.log('File input changed');
                if (e.target.files && e.target.files[0]) {
                    await this.loadPdf(e.target.files[0]);
                    e.target.value = ''; // Reset input
                }
            });
        }
        
        // Navigation
        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        if (prevBtn) prevBtn.addEventListener('click', () => this.prevPage());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextPage());
        
        const pageInput = document.getElementById('currentPageInput');
        if (pageInput) {
            pageInput.addEventListener('change', (e) => {
                this.goToPage(parseInt(e.target.value) || 1);
            });
        }
        
        // Zoom
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');
        if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoomOut());
        
        // Highlight colors
        document.querySelectorAll('.highlight-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.highlight-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedHighlightColor = btn.dataset.color;
                this.highlightMode = true;
                
                // Add visual feedback
                const container = document.getElementById('pdfCanvasContainer');
                if (container) container.classList.add('highlight-mode');
                
                console.log('Highlight color selected:', this.selectedHighlightColor);
            });
        });
        
        const clearHighlightBtn = document.getElementById('clearHighlightMode');
        if (clearHighlightBtn) {
            clearHighlightBtn.addEventListener('click', () => {
                document.querySelectorAll('.highlight-btn').forEach(b => b.classList.remove('active'));
                this.highlightMode = false;
                
                // Remove visual feedback
                const container = document.getElementById('pdfCanvasContainer');
                if (container) container.classList.remove('highlight-mode');
                
                console.log('Highlight mode disabled');
            });
        }
        
        // Text selection for highlighting
        const textLayer = document.getElementById('textLayer');
        if (textLayer) {
            textLayer.addEventListener('mouseup', () => {
                setTimeout(() => this.handleTextSelection(), 10);
            });
        }
        
        // Notes auto-save
        let notesTimeout;
        const notesTextarea = document.getElementById('notesTextarea');
        if (notesTextarea) {
            notesTextarea.addEventListener('input', () => {
                const tab = this.getActiveTab();
                if (tab) {
                    // Immediately update the tab's notes
                    tab.notes = notesTextarea.value;
                    console.log('Notes updated for tab:', tab.name);
                    
                    // Debounce the storage save
                    clearTimeout(notesTimeout);
                    notesTimeout = setTimeout(async () => {
                        await this.saveToStorage();
                        console.log('Notes saved to storage');
                    }, 500);
                }
            });
        }
        
        // Toggle notes panel
        const toggleNotesBtn = document.getElementById('toggleNotesPanel');
        if (toggleNotesBtn) {
            toggleNotesBtn.addEventListener('click', () => {
                console.log('Toggle notes panel clicked');
                const notesSection = document.getElementById('notesSection');
                notesSection.classList.toggle('collapsed');
            });
        }
        
        // Export notes
        const exportBtn = document.getElementById('exportNotes');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportNotes());
        }
        
        // Rename modal
        const cancelRenameBtn = document.getElementById('cancelRename');
        const confirmRenameBtn = document.getElementById('confirmRename');
        if (cancelRenameBtn) cancelRenameBtn.addEventListener('click', () => this.hideRenameModal());
        if (confirmRenameBtn) confirmRenameBtn.addEventListener('click', () => this.confirmRename());
        
        const renameInput = document.getElementById('renameInput');
        if (renameInput) {
            renameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.confirmRename();
                if (e.key === 'Escape') this.hideRenameModal();
            });
        }
        
        const renameModal = document.getElementById('renameModal');
        if (renameModal) {
            renameModal.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) this.hideRenameModal();
            });
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                this.prevPage();
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                this.nextPage();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            }
        });
        
        // Save before unload
        window.addEventListener('beforeunload', () => {
            this.saveCurrentTabState();
        });
        
        console.log('All events bound');
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, initializing app...');
        window.app = new ScratchXivApp();
    });
} else {
    console.log('DOM already loaded, initializing app...');
    window.app = new ScratchXivApp();
}

