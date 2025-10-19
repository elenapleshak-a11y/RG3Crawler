class SEOCrawler {
    constructor() {
        this.visitedUrls = new Map(); // {url: pageData}
        this.urlsToCrawl = new Set();
        this.externalLinks = new Map(); // {url: {source, type}}
        this.brokenLinks = new Map(); // {url: {status, error, source}}
        this.files = new Map(); // {url: {type, size, source}}
        this.isCrawling = false;
        this.isPaused = false;
        
        this.stats = {
            totalDiscovered: 0,
            successfullyCrawled: 0,
            failed: 0,
            duplicates: 0,
            external: 0,
            files: 0
        };
        
        this.timeTracking = {
            startTime: null,
            averageTimePerPage: 0,
            pageTimes: []
        };
        
        this.config = {
            maxPages: 500,
            delay: 200,
            noLimit: false,
            collectMetadata: true
        };
    }

    async startCrawling(startUrl) {
        if (!this.isValidUrl(startUrl)) {
            throw new Error('Некорректный URL');
        }

        this.resetState();
        this.isCrawling = true;
        this.isPaused = false;
        
        this.timeTracking.startTime = Date.now();
        this.timeTracking.pageTimes = [];
        
        const baseUrl = this.normalizeUrl(startUrl);
        this.urlsToCrawl.add(baseUrl);
        
        this.log('🚀 Запуск SEO краулера...', 'info');
        this.log(`🎯 Анализируем: ${baseUrl}`, 'info');
        this.log(this.config.noLimit ? 
            '📊 Лимит: БЕЗ ОГРАНИЧЕНИЙ' : 
            `📊 Лимит: ${this.config.maxPages} страниц`, 'info');

        try {
            await this.crawlAllPages(baseUrl);
            this.completeCrawling();
        } catch (error) {
            this.log(`❌ Ошибка: ${error.message}`, 'error');
            this.stopCrawling();
        }
    }

    async crawlAllPages(baseUrl) {
        while (this.urlsToCrawl.size > 0 && this.isCrawling) {
            if (this.isPaused) {
                await this.delay(100);
                continue;
            }

            // Проверяем лимит (если не отключен)
            if (!this.config.noLimit && this.visitedUrls.size >= this.config.maxPages) {
                this.log(`📈 Достигнут лимит в ${this.config.maxPages} страниц`, 'info');
                break;
            }

            const pageStartTime = Date.now();
            const currentUrl = Array.from(this.urlsToCrawl)[0];
            this.urlsToCrawl.delete(currentUrl);
            
            await this.crawlSinglePage(currentUrl, baseUrl);
            
            const pageTime = Date.now() - pageStartTime;
            this.recordPageTime(pageTime);
            this.updateProgress();
            
            await this.delay(this.config.delay);
        }
    }

    async crawlSinglePage(url, baseUrl) {
        if (this.visitedUrls.has(url)) return;
        
        this.log(`📄 Анализ: ${url}`, 'crawl');

        try {
            const pageData = await this.analyzePage(url, baseUrl);
            
            if (pageData.status >= 400) {
                // Битая ссылка
                this.brokenLinks.set(url, {
                    status: pageData.status,
                    error: pageData.error || `HTTP ${pageData.status}`,
                    source: this.findSourceUrl(url),
                    timestamp: new Date().toISOString()
                });
                this.stats.failed++;
            } else {
                // Успешная страница
                this.visitedUrls.set(url, pageData);
                this.stats.successfullyCrawled++;
                
                // Извлекаем и обрабатываем ссылки
                if (pageData.links) {
                    this.processLinks(pageData.links, url, baseUrl);
                }
            }

        } catch (error) {
            this.log(`❌ Ошибка: ${url} - ${error.message}`, 'error');
            this.brokenLinks.set(url, {
                status: 0,
                error: error.message,
                source: this.findSourceUrl(url),
                timestamp: new Date().toISOString()
            });
            this.stats.failed++;
        }
    }

    async analyzePage(url, baseUrl) {
        const pageData = {
            url: url,
            status: 0,
            timestamp: new Date().toISOString(),
            responseTime: 0,
            size: 0,
            links: []
        };

        try {
            const startTime = Date.now();
            const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SEOCrawler/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml'
                }
            });

            pageData.responseTime = Date.now() - startTime;
            pageData.status = response.status;
            pageData.size = parseInt(response.headers.get('content-length') || '0');

            if (response.ok) {
                const html = await response.text();
                pageData.size = new Blob([html]).size;
                
                if (this.config.collectMetadata) {
                    Object.assign(pageData, this.extractMetadata(html));
                }
                
                pageData.links = this.extractAllLinks(html, url, baseUrl);
            }

        } catch (error) {
            pageData.error = error.message;
        }

        return pageData;
    }

    extractMetadata(html) {
        const metadata = {};
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Title
        metadata.title = doc.querySelector('title')?.textContent?.trim() || '';
        
        // Meta description
        metadata.description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
        
        // H1
        const h1 = doc.querySelector('h1');
        metadata.h1 = h1?.textContent?.trim() || '';
        
        // Meta robots
        metadata.robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
        
        // Canonical
        metadata.canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        
        return metadata;
    }

    extractAllLinks(html, currentUrl, baseUrl) {
        const links = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Все ссылки
        doc.querySelectorAll('a[href], link[href], img[src], script[src], iframe[src]').forEach(element => {
            const href = element.getAttribute('href') || element.getAttribute('src');
            if (!href) return;
            
            try {
                const absoluteUrl = new URL(href, currentUrl).href;
                const linkType = this.getLinkType(element.tagName, href);
                const anchorText = element.tagName === 'A' ? element.textContent?.trim() : '';
                
                links.push({
                    url: absoluteUrl,
                    type: linkType,
                    anchorText: anchorText,
                    element: element.tagName.toLowerCase()
                });
            } catch (e) {
                // Игнорируем некорректные URL
            }
        });
        
        return links;
    }

    getLinkType(tagName, href) {
        const hrefLower = href.toLowerCase();
        
        // Файлы
        if (hrefLower.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/)) {
            return 'document';
        }
        if (hrefLower.match(/\.(jpg|jpeg|png|gif|svg|webp|bmp)$/)) {
            return 'image';
        }
        if (hrefLower.match(/\.(mp4|avi|mov|wmv|mp3|wav)$/)) {
            return 'media';
        }
        
        // Типы элементов
        if (tagName === 'IMG') return 'image';
        if (tagName === 'SCRIPT') return 'script';
        if (tagName === 'LINK') return 'stylesheet';
        if (tagName === 'IFRAME') return 'iframe';
        
        return 'link';
    }

    processLinks(links, sourceUrl, baseUrl) {
        links.forEach(link => {
            this.stats.totalDiscovered++;
            
            const normalizedUrl = this.normalizeUrl(link.url);
            
            if (!this.isSameDomain(normalizedUrl, baseUrl)) {
                // Внешняя ссылка
                this.externalLinks.set(normalizedUrl, {
                    type: link.type,
                    source: sourceUrl,
                    anchorText: link.anchorText,
                    timestamp: new Date().toISOString()
                });
                this.stats.external++;
                return;
            }

            if (link.type !== 'link') {
                // Файл
                this.files.set(normalizedUrl, {
                    type: link.type,
                    source: sourceUrl,
                    anchorText: link.anchorText,
                    timestamp: new Date().toISOString()
                });
                this.stats.files++;
                return;
            }

            // Внутренняя ссылка
            if (this.visitedUrls.has(normalizedUrl) || this.urlsToCrawl.has(normalizedUrl)) {
                this.stats.duplicates++;
                return;
            }

            if (this.shouldCrawlUrl(normalizedUrl)) {
                this.urlsToCrawl.add(normalizedUrl);
                this.log(`🔍 Найдена страница: ${normalizedUrl}`, 'discover');
            }
        });
    }

    // Вспомогательные методы (normalizeUrl, isSameDomain, shouldCrawlUrl и др. остаются похожими)
    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            urlObj.protocol = urlObj.protocol.toLowerCase();
            urlObj.hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
            urlObj.hash = '';
            
            urlObj.pathname = urlObj.pathname
                .replace(/\/+/g, '/')
                .replace(/\/$/, '') || '/';
            
            if (urlObj.search) {
                const params = new URLSearchParams(urlObj.search);
                const importantParams = new URLSearchParams();
                
                for (const [key, value] of params) {
                    if (!key.match(/^(utm_|fbclid|gclid|msclkid|trk_|ref|source)/i)) {
                        importantParams.append(key, value);
                    }
                }
                
                urlObj.search = importantParams.toString();
            }
            
            return urlObj.href;
        } catch (error) {
            return url;
        }
    }

    isSameDomain(url, baseUrl) {
        try {
            return new URL(url).hostname === new URL(baseUrl).hostname;
        } catch {
            return false;
        }
    }

    shouldCrawlUrl(url) {
        if (!this.isValidPageUrl(url)) return false;
        
        const excludedPaths = ['/admin', '/login', '/logout', '/register', '/api/'];
        const urlLower = url.toLowerCase();
        return !excludedPaths.some(path => urlLower.includes(path));
    }

    isValidPageUrl(url) {
        try {
            const urlObj = new URL(url);
            const excludedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.zip'];
            const pathname = urlObj.pathname.toLowerCase();
            
            if (excludedExtensions.some(ext => pathname.endsWith(ext))) {
                return false;
            }
            
            if (['mailto:', 'tel:', 'javascript:', 'ftp:', 'data:'].some(proto => 
                url.toLowerCase().startsWith(proto))) {
                return false;
            }
            
            return ['http:', 'https:'].includes(urlObj.protocol);
            
        } catch (error) {
            return false;
        }
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    findSourceUrl(targetUrl) {
        for (let [url, data] of this.visitedUrls) {
            if (data.links?.some(link => link.url === targetUrl)) {
                return url;
            }
        }
        return 'unknown';
    }

    recordPageTime(pageTime) {
        this.timeTracking.pageTimes.push(pageTime);
        if (this.timeTracking.pageTimes.length > 50) {
            this.timeTracking.pageTimes.shift();
        }
        const sum = this.timeTracking.pageTimes.reduce((a, b) => a + b, 0);
        this.timeTracking.averageTimePerPage = sum / this.timeTracking.pageTimes.length;
    }

    getTimeEstimate() {
        if (this.timeTracking.pageTimes.length < 5) return 'расчет...';
        
        const pagesRemaining = this.config.noLimit ? 
            this.urlsToCrawl.size : 
            Math.min(this.urlsToCrawl.size, this.config.maxPages - this.visitedUrls.size);
            
        if (pagesRemaining <= 0) return 'завершается...';
        
        const estimatedTimeMs = pagesRemaining * this.timeTracking.averageTimePerPage;
        return this.formatTime(estimatedTimeMs);
    }

    getElapsedTime() {
        if (!this.timeTracking.startTime) return '0с';
        return this.formatTime(Date.now() - this.timeTracking.startTime);
    }

    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}ч ${minutes % 60}м`;
        if (minutes > 0) return `${minutes}м ${seconds % 60}с`;
        return `${seconds}с`;
    }

    getProgressData() {
        const pagesProcessed = this.visitedUrls.size + this.stats.failed;
        const progress = this.config.noLimit ? 
            Math.min((pagesProcessed / (pagesProcessed + this.urlsToCrawl.size)) * 100, 100) :
            (pagesProcessed / this.config.maxPages) * 100;
            
        return {
            progress: Math.min(progress, 100),
            stats: this.stats,
            visited: this.visitedUrls.size,
            queued: this.urlsToCrawl.size,
            failed: this.stats.failed,
            timeEstimate: this.getTimeEstimate(),
            elapsedTime: this.getElapsedTime(),
            averageTime: Math.round(this.timeTracking.averageTimePerPage / 100) / 10,
            pagesProcessed: pagesProcessed
        };
    }

    updateProgress() {
        const progressData = this.getProgressData();
        if (typeof updateUI === 'function') {
            updateUI(progressData);
        }
    }

    log(message, type = 'info') {
        if (typeof addLog === 'function') {
            addLog(message, type);
        }
    }

    completeCrawling() {
        this.isCrawling = false;
        this.log('✅ Краулинг завершен!', 'success');
        this.log(`📊 Итоговая статистика:`, 'success');
        this.log(`   ✅ Успешных страниц: ${this.visitedUrls.size}`, 'success');
        this.log(`   ❌ Битых ссылок: ${this.brokenLinks.size}`, 'success');
        this.log(`   🌐 Внешних ссылок: ${this.externalLinks.size}`, 'success');
        this.log(`   📎 Файлов: ${this.files.size}`, 'success');
        this.log(`   🔄 Дубликатов: ${this.stats.duplicates}`, 'success');
        
        if (typeof showResults === 'function') {
            showResults(this.getResults());
        }
    }

    stopCrawling() {
        this.isCrawling = false;
        this.isPaused = false;
        this.log('⏹️ Краулинг остановлен', 'warning');
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.log(this.isPaused ? '⏸️ Пауза' : '▶️ Продолжено', 'info');
    }

    resetState() {
        this.visitedUrls.clear();
        this.urlsToCrawl.clear();
        this.externalLinks.clear();
        this.brokenLinks.clear();
        this.files.clear();
        this.stats = {
            totalDiscovered: 0,
            successfullyCrawled: 0,
            failed: 0,
            duplicates: 0,
            external: 0,
            files: 0
        };
        this.timeTracking = {
            startTime: null,
            averageTimePerPage: 0,
            pageTimes: []
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getResults() {
        return {
            mainPages: Array.from(this.visitedUrls.entries()).map(([url, data]) => ({
                url,
                status: data.status,
                title: data.title,
                description: data.description,
                h1: data.h1,
                responseTime: data.responseTime,
                size: data.size,
                timestamp: data.timestamp
            })),
            externalLinks: Array.from(this.externalLinks.entries()).map(([url, data]) => ({
                url,
                type: data.type,
                source: data.source,
                anchorText: data.anchorText,
                timestamp: data.timestamp
            })),
            brokenLinks: Array.from(this.brokenLinks.entries()).map(([url, data]) => ({
                url,
                status: data.status,
                error: data.error,
                source: data.source,
                timestamp: data.timestamp
            })),
            files: Array.from(this.files.entries()).map(([url, data]) => ({
                url,
                type: data.type,
                source: data.source,
                anchorText: data.anchorText,
                timestamp: data.timestamp
            })),
            stats: this.stats
        };
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}

// Глобальный инстанс краулера
const seoCrawler = new SEOCrawler();

// UI функции
function updateUI(data) {
    const progressFill = document.getElementById('progressFill');
    const progressInfo = document.getElementById('progressInfo');
    const statsGrid = document.getElementById('statsGrid');
    
    progressFill.style.width = data.progress + '%';
    
    progressInfo.innerHTML = `
        <div style="text-align: center; margin-bottom: 10px;">
            <strong>${data.visited}</strong> страниц | 
            <strong>${data.queued}</strong> в очереди | 
            <strong>${data.failed}</strong> ошибок
            ${!seoCrawler.config.noLimit ? `| <strong>${data.pagesProcessed}/${seoCrawler.config.maxPages}</strong> всего` : ''}
        </div>
        
        <div class="time-info">
            <div class="time-card">
                <span class="time-value">${data.elapsedTime}</span>
                <span class="time-label">Прошло времени</span>
            </div>
            <div class="time-card">
                <span class="time-value">${data.timeEstimate}</span>
                <span class="time-label">Осталось времени</span>
            </div>
            <div class="time-card">
                <span class="time-value">${data.averageTime}с</span>
                <span class="time-label">На страницу</span>
            </div>
        </div>
        
        <div class="progress-details">
            <span class="progress-speed">
                ⚡ ~${Math.round(60 / data.averageTime * 10) / 10} стр/мин
            </span>
            <span class="estimated-time">
                ⏱️ Завершение: ${data.timeEstimate}
            </span>
        </div>
    `;
    
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${data.visited}</div>
            <div class="stat-label">Страниц</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${data.stats.external}</div>
            <div class="stat-label">Внешних ссылок</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${data.stats.files}</div>
            <div class="stat-label">Файлов</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${data.stats.duplicates}</div>
            <div class="stat-label">Дубликатов</div>
        </div>
    `;
}

function addLog(message, type = 'info') {
    const logElement = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
    logElement.appendChild(logEntry);
    logElement.scrollTop = logElement.scrollHeight;
}

function showResults(results) {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    
    const statsHtml = `
        <div class="final-stats">
            <div class="stat-item">✅ <strong>Успешных страниц:</strong> ${results.stats.successfullyCrawled}</div>
            <div class="stat-item">❌ <strong>Битых ссылок:</strong> ${results.brokenLinks.length}</div>
            <div class="stat-item">🌐 <strong>Внешних ссылок:</strong> ${results.externalLinks.length}</div>
            <div class="stat-item">📎 <strong>Файлов:</strong> ${results.files.length}</div>
            <div class="stat-item">🔄 <strong>Дубликатов:</strong> ${results.stats.duplicates}</div>
        </div>
    `;
    
    document.getElementById('resultsStats').innerHTML = statsHtml;
    
    // Заполняем таблицы
    fillMainPagesTable(results.mainPages);
    fillExternalLinksTable(results.externalLinks);
    fillBrokenLinksTable(results.brokenLinks);
    fillFilesTable(results.files);
}

function fillMainPagesTable(pages) {
    const table = document.getElementById('mainPagesTable');
    table.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>H1</th>
                    <th>Время</th>
                    <th>Размер</th>
                </tr>
            </thead>
            <tbody>
                ${pages.map(page => `
                    <tr>
                        <td><a href="${page.url}" target="_blank">${page.url}</a></td>
                        <td class="status-${page.status}">${page.status}</td>
                        <td title="${page.title}">${page.title.substring(0, 50)}${page.title.length > 50 ? '...' : ''}</td>
                        <td title="${page.description}">${page.description.substring(0, 70)}${page.description.length > 70 ? '...' : ''}</td>
                        <td title="${page.h1}">${page.h1.substring(0, 30)}${page.h1.length > 30 ? '...' : ''}</td>
                        <td>${page.responseTime}ms</td>
                        <td>${(page.size / 1024).toFixed(1)}KB</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function fillExternalLinksTable(links) {
    const table = document.getElementById('externalLinksTable');
    table.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Тип</th>
                    <th>Источник</th>
                    <th>Текст ссылки</th>
                </tr>
            </thead>
            <tbody>
                ${links.map(link => `
                    <tr>
                        <td><a href="${link.url}" target="_blank">${link.url}</a></td>
                        <td>${link.type}</td>
                        <td><a href="${link.source}" target="_blank">${link.source}</a></td>
                        <td title="${link.anchorText}">${link.anchorText.substring(0, 50)}${link.anchorText.length > 50 ? '...' : ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function fillBrokenLinksTable(links) {
    const table = document.getElementById('brokenLinksTable');
    table.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Статус</th>
                    <th>Ошибка</th>
                    <th>Источник</th>
                </tr>
            </thead>
            <tbody>
                ${links.map(link => `
                    <tr>
                        <td><a href="${link.url}" target="_blank">${link.url}</a></td>
                        <td class="status-${link.status}">${link.status}</td>
                        <td>${link.error}</td>
                        <td><a href="${link.source}" target="_blank">${link.source}</a></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function fillFilesTable(files) {
    const table = document.getElementById('filesTable');
    table.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Тип файла</th>
                    <th>Источник</th>
                    <th>Текст ссылки</th>
                </tr>
            </thead>
            <tbody>
                ${files.map(file => `
                    <tr>
                        <td><a href="${file.url}" target="_blank">${file.url}</a></td>
                        <td>${file.type}</td>
                        <td><a href="${file.source}" target="_blank">${file.source}</a></td>
                        <td title="${file.anchorText}">${file.anchorText.substring(0, 50)}${file.anchorText.length > 50 ? '...' : ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Экспорт функций
function startCrawling() {
    const url = document.getElementById('urlInput').value.trim();
    const maxPages = parseInt(document.getElementById('maxPages').value) || 500;
    const delay = parseInt(document.getElementById('crawlDelay').value) || 200;
    const noLimit = document.getElementById('noLimit').checked;
    const collectMetadata = document.getElementById('collectMetadata').checked;
    
    if (!url) {
        showError('Введите URL сайта');
        return;
    }
    
    document.getElementById('error').textContent = '';
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('crawlBtn').style.display = 'none';
    document.getElementById('stopBtn').style.display = 'inline-block';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('log').innerHTML = '';
    
    seoCrawler.updateConfig({ maxPages, delay, noLimit, collectMetadata });
    seoCrawler.startCrawling(url).catch(error => {
        showError(error.message);
    });
}

function stopCrawling() {
    seoCrawler.stopCrawling();
    document.getElementById('crawlBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
}

function togglePause() {
    seoCrawler.togglePause();
    const pauseBtn = document.getElementById('pauseBtn');
    pauseBtn.textContent = seoCrawler.isPaused ? '▶️ Продолжить' : '⏸️ Пауза';
}

function showError(message) {
    document.getElementById('error').textContent = message;
    addLog(`❌ ${message}`, 'error');
}

// Система вкладок
function openTab(tabName) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    document.querySelector(`[onclick="openTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// Функции экспорта
function exportMainCSV() {
    const results = seoCrawler.getResults();
    const headers = ['URL', 'Status', 'Title', 'Description', 'H1', 'Response Time', 'Size', 'Timestamp'];
    const csvContent = [
        headers.join(','),
        ...results.mainPages.map(page => [
            `"${page.url}"`,
            page.status,
            `"${page.title.replace(/"/g, '""')}"`,
            `"${page.description.replace(/"/g, '""')}"`,
            `"${page.h1.replace(/"/g, '""')}"`,
            page.responseTime,
            page.size,
            `"${page.timestamp}"`
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'main_pages.csv', 'text/csv');
}

function exportExternalCSV() {
    const results = seoCrawler.getResults();
    const headers = ['URL', 'Type', 'Source', 'Anchor Text', 'Timestamp'];
    const csvContent = [
        headers.join(','),
        ...results.externalLinks.map(link => [
            `"${link.url}"`,
            `"${link.type}"`,
            `"${link.source}"`,
            `"${link.anchorText.replace(/"/g, '""')}"`,
            `"${link.timestamp}"`
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'external_links.csv', 'text/csv');
}

function exportBrokenCSV() {
    const results = seoCrawler.getResults();
    const headers = ['URL', 'Status', 'Error', 'Source', 'Timestamp'];
    const csvContent = [
        headers.join(','),
        ...results.brokenLinks.map(link => [
            `"${link.url}"`,
            link.status,
            `"${link.error.replace(/"/g, '""')}"`,
            `"${link.source}"`,
            `"${link.timestamp}"`
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'broken_links.csv', 'text/csv');
}

function exportFilesCSV() {
    const results = seoCrawler.getResults();
    const headers = ['URL', 'File Type', 'Source', 'Anchor Text', 'Timestamp'];
    const csvContent = [
        headers.join(','),
        ...results.files.map(file => [
            `"${file.url}"`,
            `"${file.type}"`,
            `"${file.source}"`,
            `"${file.anchorText.replace(/"/g, '""')}"`,
            `"${file.timestamp}"`
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'files.csv', 'text/csv');
}

function exportFullData() {
    const results = seoCrawler.getResults();
    const jsonContent = JSON.stringify(results, null, 2);
    downloadFile(jsonContent, 'full_crawl_data.json', 'application/json');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog(`📥 Файл ${filename} скачан`, 'success');
}

// Обработчики событий
document.getElementById('urlInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') startCrawling();
});

document.getElementById('noLimit').addEventListener('change', function(e) {
    document.getElementById('maxPages').disabled = e.target.checked;
});
