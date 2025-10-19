class SEOAdvancedCrawler {
    constructor() {
        this.visitedUrls = new Map();
        this.urlsToCrawl = new Set();
        this.externalLinks = new Map();
        this.brokenLinks = new Map();
        this.files = new Map();
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
            collectMetadata: true,
            collectStructuredData: true,
            collectContentAnalysis: true,
            collectTechnicalData: true,
            baseUrl: ''
        };

        this.internalLinkMap = new Map();
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
        this.config.baseUrl = baseUrl;
        this.urlsToCrawl.add(baseUrl);
        
        this.log('🚀 Запуск расширенного SEO краулера...', 'info');
        this.log(`🎯 Анализируем: ${baseUrl}`, 'info');
        this.log(this.config.noLimit ? 
            '📊 Лимит: БЕЗ ОГРАНИЧЕНИЙ' : 
            `📊 Лимит: ${this.config.maxPages} страниц`, 'info');

        try {
            await this.crawlAllPages(baseUrl);
            this.calculateInternalLinks();
            this.completeCrawling();
        } catch (error) {
            this.log(`❌ Ошибка: ${error.message}`, 'error');
            this.stopCrawling();
        }
    }

    async crawlAllPages(baseUrl) {
        while (this.urlsToCrawl.size > 0 && this.isCrawling && !this.isPaused) {
            if (this.visitedUrls.size >= this.config.maxPages && !this.config.noLimit) {
                this.log(`🏁 Достигнут лимит в ${this.config.maxPages} страниц`, 'info');
                break;
            }

            const url = Array.from(this.urlsToCrawl)[0];
            this.urlsToCrawl.delete(url);

            if (this.visitedUrls.has(url)) {
                continue;
            }

            const pageData = await this.crawlSinglePage(url, baseUrl);
            this.visitedUrls.set(url, pageData);

            if (pageData.status === 200) {
                this.processLinks(pageData.content.internalLinks, url, baseUrl);
            }

            if (this.config.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, this.config.delay));
            }

            // Обновляем прогресс
            this.updateProgress();
        }
    }

    async crawlSinglePage(url, baseUrl) {
        this.log(`📄 Анализ: ${url}`, 'crawl');
        const pageData = await this.analyzePage(url, baseUrl);
        
        if (pageData.status >= 400) {
            this.brokenLinks.set(url, {
                status: pageData.status,
                error: pageData.error,
                source: this.findSourceUrl(url),
                timestamp: pageData.timestamp
            });
            this.stats.failed++;
            this.log(`❌ Ошибка ${pageData.status}: ${url}`, 'error');
        } else {
            this.stats.successfullyCrawled++;
            this.log(`✅ Успешно: ${url} (${pageData.responseTime}ms)`, 'success');
        }
        
        this.recordPageTime(pageData.responseTime);
        return pageData;
    }

    async analyzePage(url, baseUrl) {
        const pageData = {
            url: url,
            status: 0,
            timestamp: new Date().toISOString(),
            responseTime: 0,
            size: 0,
            
            // Базовые мета-данные
            title: '',
            description: '',
            h1: '',
            robots: '',
            canonical: '',
            viewport: '',
            charset: '',
            
            // Open Graph
            ogTitle: '',
            ogDescription: '',
            ogImage: '',
            ogType: '',
            
            // Twitter Card
            twitterTitle: '',
            twitterDescription: '',
            twitterImage: '',
            twitterCard: '',
            
            // Заголовки H1-H6
            headings: {
                h1: [],
                h2: [],
                h3: [],
                h4: [],
                h5: [],
                h6: []
            },
            
            // Семантическая разметка
            structuredData: {
                jsonLd: [],
                microdata: [],
                schemaTypes: new Set()
            },
            
            // Контент-анализ
            content: {
                textLength: 0,
                images: [],
                internalLinks: [],
                externalLinks: []
            },
            
            // Технические данные
            technical: {
                serverTiming: 0,
                pageSize: 0,
                internalLinkCount: 0
            },
            
            links: []
        };

        try {
            const startTime = Date.now();
            
            // Используем CORS proxy для обхода ограничений
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SEOAdvancedCrawler/1.0)',
                }
            });

            pageData.responseTime = Date.now() - startTime;

            if (response.ok) {
                const data = await response.json();
                const html = data.contents;
                pageData.size = new Blob([html]).size;
                
                // Парсим HTML и извлекаем все данные
                const parsedData = this.parseHTMLContent(html, url, baseUrl);
                Object.assign(pageData, parsedData);
                
                pageData.links = parsedData.content.internalLinks.concat(parsedData.content.externalLinks);
                pageData.status = 200;
            } else {
                pageData.status = response.status;
                pageData.error = `HTTP Error: ${response.status}`;
            }

        } catch (error) {
            pageData.status = 0;
            pageData.error = error.message;
            this.log(`❌ Ошибка запроса: ${error.message}`, 'error');
        }

        return pageData;
    }

    parseHTMLContent(html, currentUrl, baseUrl) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const result = {
            headings: { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] },
            structuredData: { jsonLd: [], microdata: [], schemaTypes: new Set() },
            content: { textLength: 0, images: [], internalLinks: [], externalLinks: [] },
            technical: { serverTiming: 0, pageSize: 0, internalLinkCount: 0 }
        };

        // Базовые мета-теги
        result.title = doc.querySelector('title')?.textContent?.trim() || '';
        result.description = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
        result.robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
        result.canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        result.viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
        result.charset = doc.querySelector('meta[charset]')?.getAttribute('charset') || 
                        doc.querySelector('meta[http-equiv="Content-Type"]')?.getAttribute('content') || '';

        // Open Graph
        result.ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
        result.ogDescription = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
        result.ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
        result.ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') || '';

        // Twitter Card
        result.twitterTitle = doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '';
        result.twitterDescription = doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '';
        result.twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '';
        result.twitterCard = doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '';

        // Заголовки H1-H6
        for (let i = 1; i <= 6; i++) {
            const headings = doc.querySelectorAll(`h${i}`);
            headings.forEach(heading => {
                const text = heading.textContent?.trim();
                if (text) {
                    result.headings[`h${i}`].push(text);
                }
            });
        }

        // H1 для быстрого доступа (первый найденный)
        result.h1 = result.headings.h1[0] || '';

        // Семантическая разметка
        this.extractStructuredData(doc, result.structuredData);

        // Контент-анализ
        this.analyzeContent(doc, currentUrl, baseUrl, result.content);

        // Технические данные
        result.technical.pageSize = new Blob([html]).size;

        return result;
    }

    extractStructuredData(doc, structuredData) {
        // JSON-LD
        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        jsonLdScripts.forEach(script => {
            try {
                const data = JSON.parse(script.textContent);
                structuredData.jsonLd.push(data);
                
                // Извлекаем типы schema.org
                if (data['@type']) {
                    if (Array.isArray(data['@type'])) {
                        data['@type'].forEach(type => structuredData.schemaTypes.add(type));
                    } else {
                        structuredData.schemaTypes.add(data['@type']);
                    }
                }
            } catch (e) {
                // Невалидный JSON
            }
        });

        // Microdata (упрощенный парсинг)
        const microdataElements = doc.querySelectorAll('[itemtype]');
        microdataElements.forEach(element => {
            const itemtype = element.getAttribute('itemtype');
            if (itemtype) {
                structuredData.schemaTypes.add(itemtype.split('/').pop());
                structuredData.microdata.push({
                    type: itemtype,
                    properties: this.extractMicrodataProperties(element)
                });
            }
        });
    }

    extractMicrodataProperties(element) {
        const properties = {};
        const propElements = element.querySelectorAll('[itemprop]');
        
        propElements.forEach(propElement => {
            const propName = propElement.getAttribute('itemprop');
            let propValue = propElement.getAttribute('content') || 
                           propElement.getAttribute('src') || 
                           propElement.textContent?.trim();
            
            if (propValue) {
                if (!properties[propName]) {
                    properties[propName] = [];
                }
                properties[propName].push(propValue);
            }
        });
        
        return properties;
    }

    analyzeContent(doc, currentUrl, baseUrl, content) {
        // Текст контента (исключая скрипты и стили)
        const contentElements = doc.querySelectorAll('body h1, body h2, body h3, body h4, body h5, body h6, body p, body li, body span, body div');
        let allText = '';
        
        contentElements.forEach(element => {
            if (!element.closest('script') && !element.closest('style')) {
                const text = element.textContent?.trim();
                if (text) {
                    allText += text + ' ';
                }
            }
        });
        
        content.textLength = allText.length;

        // Изображения
        const images = doc.querySelectorAll('img');
        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src) {
                try {
                    const absoluteUrl = new URL(src, currentUrl).href;
                    content.images.push({
                        url: absoluteUrl,
                        alt: img.getAttribute('alt') || '',
                        title: img.getAttribute('title') || '',
                        width: img.getAttribute('width') || '',
                        height: img.getAttribute('height') || ''
                    });
                } catch (e) {
                    // Некорректный URL
                }
            }
        });

        // Ссылки
        const links = doc.querySelectorAll('a[href]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
                try {
                    const absoluteUrl = new URL(href, currentUrl).href;
                    const anchorText = link.textContent?.trim() || '';
                    
                    const linkData = {
                        url: absoluteUrl,
                        anchorText: anchorText,
                        title: link.getAttribute('title') || '',
                        nofollow: link.getAttribute('rel')?.includes('nofollow') || false,
                        type: this.getLinkType(absoluteUrl)
                    };

                    if (this.isSameDomain(absoluteUrl, baseUrl)) {
                        content.internalLinks.push(linkData);
                    } else {
                        content.externalLinks.push(linkData);
                    }
                } catch (e) {
                    // Некорректный URL
                }
            }
        });
    }

    processLinks(links, sourceUrl, baseUrl) {
        links.forEach(link => {
            this.stats.totalDiscovered++;
            
            const normalizedUrl = this.normalizeUrl(link.url);
            
            if (!this.isSameDomain(normalizedUrl, baseUrl)) {
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
                this.files.set(normalizedUrl, {
                    type: link.type,
                    source: sourceUrl,
                    anchorText: link.anchorText,
                    timestamp: new Date().toISOString()
                });
                this.stats.files++;
                return;
            }

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

    calculateInternalLinks() {
        // Сбрасываем счетчики
        for (let [url, data] of this.visitedUrls) {
            data.technical.internalLinkCount = 0;
        }

        // Подсчитываем входящие ссылки
        for (let [url, data] of this.visitedUrls) {
            data.content.internalLinks.forEach(link => {
                const targetUrl = this.normalizeUrl(link.url);
                if (this.visitedUrls.has(targetUrl)) {
                    const targetData = this.visitedUrls.get(targetUrl);
                    targetData.technical.internalLinkCount++;
                }
            });
        }
    }

    getLinkType(url) {
        const extension = url.split('.').pop()?.toLowerCase();
        const linkTypes = {
            'pdf': 'document',
            'doc': 'document',
            'docx': 'document',
            'xls': 'document',
            'xlsx': 'document',
            'ppt': 'document',
            'pptx': 'document',
            'jpg': 'image',
            'jpeg': 'image',
            'png': 'image',
            'gif': 'image',
            'svg': 'image',
            'webp': 'image',
            'mp4': 'video',
            'avi': 'video',
            'mov': 'video',
            'mp3': 'audio',
            'wav': 'audio',
            'zip': 'archive',
            'rar': 'archive',
            '7z': 'archive'
        };
        
        return linkTypes[extension] || 'link';
    }

    normalizeUrl(url) {
        try {
            const urlObj = new URL(url);
            urlObj.hash = ''; // Удаляем якоря
            urlObj.search = ''; // Удаляем параметры запроса (можно настроить)
            return urlObj.href.replace(/\/$/, ''); // Удаляем trailing slash
        } catch (e) {
            return url;
        }
    }

    isSameDomain(url, baseUrl) {
        try {
            const urlDomain = new URL(url).hostname;
            const baseDomain = new URL(baseUrl).hostname;
            return urlDomain === baseDomain;
        } catch (e) {
            return false;
        }
    }

    shouldCrawlUrl(url) {
        if (!this.isValidPageUrl(url)) {
            return false;
        }

        // Исключаем типы файлов
        const excludedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'xls', 'xlsx'];
        const extension = url.split('.').pop()?.toLowerCase();
        if (excludedExtensions.includes(extension)) {
            return false;
        }

        // Исключаем URL с определенными паттернами
        const excludedPatterns = ['/cdn-cgi/', '/wp-json/', '/api/', '/admin/', '/login'];
        if (excludedPatterns.some(pattern => url.includes(pattern))) {
            return false;
        }

        return true;
    }

    isValidPageUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch (e) {
            return false;
        }
    }

    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    findSourceUrl(url) {
        for (let [sourceUrl, data] of this.visitedUrls) {
            if (data.content.internalLinks.some(link => this.normalizeUrl(link.url) === url)) {
                return sourceUrl;
            }
        }
        return 'unknown';
    }

    recordPageTime(time) {
        this.timeTracking.pageTimes.push(time);
        const total = this.timeTracking.pageTimes.reduce((a, b) => a + b, 0);
        this.timeTracking.averageTimePerPage = total / this.timeTracking.pageTimes.length;
    }

    getTimeEstimate() {
        const remaining = this.config.noLimit ? 
            this.urlsToCrawl.size : 
            Math.min(this.urlsToCrawl.size, this.config.maxPages - this.visitedUrls.size);
        
        return Math.round((remaining * this.timeTracking.averageTimePerPage) / 1000 / 60);
    }

    getElapsedTime() {
        return Math.round((Date.now() - this.timeTracking.startTime) / 1000);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}м ${secs}с`;
    }

    getProgressData() {
        const current = this.visitedUrls.size;
        const total = this.config.noLimit ? current + this.urlsToCrawl.size : this.config.maxPages;
        const progress = total > 0 ? (current / total) * 100 : 0;
        
        return {
            current: current,
            total: total,
            progress: progress,
            elapsed: this.getElapsedTime(),
            estimated: this.getTimeEstimate()
        };
    }

    updateProgress() {
        const progress = this.getProgressData();
        if (typeof updateCrawlProgress === 'function') {
            updateCrawlProgress(progress);
        }
    }

    log(message, type = 'info') {
        if (typeof addCrawlLog === 'function') {
            addCrawlLog(message, type);
        }
        console.log(`[${type}] ${message}`);
    }

    resetState() {
        this.visitedUrls.clear();
        this.urlsToCrawl.clear();
        this.externalLinks.clear();
        this.brokenLinks.clear();
        this.files.clear();
        this.internalLinkMap.clear();
        
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

    completeCrawling() {
        this.isCrawling = false;
        this.log('✅ Краулинг завершен!', 'success');
        this.log(`📊 Результаты: ${this.stats.successfullyCrawled} успешных, ${this.stats.failed} ошибок, ${this.stats.external} внешних ссылок`, 'info');
        
        if (typeof showCrawlResults === 'function') {
            showCrawlResults(this.getResults());
        }
    }

    stopCrawling() {
        this.isCrawling = false;
        this.log('⏹️ Краулинг остановлен', 'warning');
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.log(this.isPaused ? '⏸️ Краулинг приостановлен' : '▶️ Краулинг возобновлен', 'info');
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    getResults() {
        const mainPages = Array.from(this.visitedUrls.entries()).map(([url, data]) => ({
            url,
            status: data.status,
            
            // Базовые мета-данные
            title: data.title,
            description: data.description,
            h1: data.h1,
            robots: data.robots,
            canonical: data.canonical,
            
            // Open Graph
            ogTitle: data.ogTitle,
            ogDescription: data.ogDescription,
            ogImage: data.ogImage,
            
            // Заголовки
            headings: data.headings,
            
            // Семантическая разметка
            structuredData: {
                hasJsonLd: data.structuredData.jsonLd.length > 0,
                hasMicrodata: data.structuredData.microdata.length > 0,
                schemaTypes: Array.from(data.structuredData.schemaTypes),
                jsonLdCount: data.structuredData.jsonLd.length
            },
            
            // Контент
            content: {
                textLength: data.content.textLength,
                imagesCount: data.content.images.length,
                internalLinksCount: data.content.internalLinks.length,
                externalLinksCount: data.content.externalLinks.length
            },
            
            // Технические данные
            technical: {
                responseTime: data.responseTime,
                pageSize: data.size,
                internalLinkCount: data.technical.internalLinkCount
            },
            
            timestamp: data.timestamp
        }));

        return {
            mainPages,
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
            stats: this.stats,
            config: this.config
        };
    }

    saveToLocalStorage(siteKey) {
        const data = this.getResults();
        localStorage.setItem(`seo_crawl_${siteKey}`, JSON.stringify(data));
        this.log(`💾 Данные сохранены: ${siteKey}`, 'success');
        return data;
    }

    loadFromLocalStorage(siteKey) {
        const data = localStorage.getItem(`seo_crawl_${siteKey}`);
        if (data) {
            const parsed = JSON.parse(data);
            this.log(`📂 Загружены данные: ${siteKey} (${parsed.mainPages.length} страниц)`, 'success');
            return parsed;
        }
        return null;
    }

    getCrawlData() {
        return this.getResults();
    }
}

// Глобальный инстанс краулера
const seoAdvancedCrawler = new SEOAdvancedCrawler();

// UI функции для краулера
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
    
    seoAdvancedCrawler.updateConfig({ 
        maxPages, 
        delay, 
        noLimit, 
        collectMetadata,
        collectStructuredData: true,
        collectContentAnalysis: true,
        collectTechnicalData: true
    });
    
    seoAdvancedCrawler.startCrawling(url).catch(error => {
        showError(error.message);
    });
}

function stopCrawling() {
    seoAdvancedCrawler.stopCrawling();
    document.getElementById('crawlBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
}

function togglePause() {
    seoAdvancedCrawler.togglePause();
    const pauseBtn = document.getElementById('pauseBtn');
    pauseBtn.textContent = seoAdvancedCrawler.isPaused ? '▶️ Продолжить' : '⏸️ Пауза';
}

function addCrawlLog(message, type = 'info') {
    const logElement = document.getElementById('log');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
    logElement.appendChild(logEntry);
    logElement.scrollTop = logElement.scrollHeight;
}

function updateCrawlProgress(progress) {
    const progressFill = document.getElementById('progressFill');
    const progressInfo = document.getElementById('progressInfo');
    
    if (progressFill && progressInfo) {
        progressFill.style.width = `${progress.progress}%`;
        progressInfo.textContent = 
            `Страниц: ${progress.current}/${progress.total} | ` +
            `Время: ${seoAdvancedCrawler.formatTime(progress.elapsed)} | ` +
            `Осталось: ~${progress.estimated} мин`;
    }
}

function showCrawlResults(results) {
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('crawlBtn').style.display = 'inline-block';
    document.getElementById('stopBtn').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    
    fillMainPagesTable(results.mainPages);
    updateStatsDisplay(results.stats);
    
    // Добавляем кнопку сохранения если её нет
    if (!document.getElementById('saveBtn')) {
        addSaveButton();
    }
}

function fillMainPagesTable(pages) {
    const table = document.getElementById('mainPagesTable');
    if (!table) return;
    
    table.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Title</th>
                    <th>H1</th>
                    <th>Schema</th>
                    <th>Текст</th>
                    <th>Ссылки</th>
                    <th>Входящие</th>
                    <th>Время</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
                ${pages.map(page => `
                    <tr>
                        <td><a href="${page.url}" target="_blank">${page.url}</a></td>
                        <td class="status-${page.status}">${page.status}</td>
                        <td title="${page.title}">${page.title ? page.title.substring(0, 40) + (page.title.length > 40 ? '...' : '') : ''}</td>
                        <td title="${page.h1}">${page.h1 ? page.h1.substring(0, 30) + (page.h1.length > 30 ? '...' : '') : ''}</td>
                        <td>${page.structuredData.schemaTypes.join(', ').substring(0, 20)}${page.structuredData.schemaTypes.join(', ').length > 20 ? '...' : ''}</td>
                        <td>${(page.content.textLength / 1000).toFixed(1)}k</td>
                        <td>${page.content.internalLinksCount}/${page.content.externalLinksCount}</td>
                        <td>${page.technical.internalLinkCount}</td>
                        <td>${page.technical.responseTime}ms</td>
                        <td>
                            <button onclick="showPageDetails(${JSON.stringify(page).replace(/"/g, '&quot;')})">🔍</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function updateStatsDisplay(stats) {
    const statsGrid = document.getElementById('statsGrid');
    if (!statsGrid) return;
    
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.successfullyCrawled}</div>
            <div class="stat-label">Успешных страниц</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.failed}</div>
            <div class="stat-label">Ошибок</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.external}</div>
            <div class="stat-label">Внешних ссылок</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.files}</div>
            <div class="stat-label">Файлов</div>
        </div>
    `;
}

function addSaveButton() {
    const exportButtons = document.querySelector('.export-buttons');
    if (!exportButtons) return;
    
    const saveBtn = document.createElement('button');
    saveBtn.id = 'saveBtn';
    saveBtn.textContent = '💾 Сохранить данные';
    saveBtn.onclick = saveCrawlData;
    exportButtons.appendChild(saveBtn);
}

function saveCrawlData() {
    const siteKey = prompt('Введите название для сохранения (например: old_site):');
    if (siteKey) {
        seoAdvancedCrawler.saveToLocalStorage(siteKey);
    }
}

function showPageDetails(page) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h2>Детальная информация: ${page.url}</h2>
            
            <div class="details-grid">
                <div class="detail-section">
                    <h3>📊 Базовые мета-данные</h3>
                    <p><strong>Title:</strong> ${page.title || '—'}</p>
                    <p><strong>Description:</strong> ${page.description || '—'}</p>
                    <p><strong>H1:</strong> ${page.h1 || '—'}</p>
                    <p><strong>Canonical:</strong> ${page.canonical || '—'}</p>
                    <p><strong>Robots:</strong> ${page.robots || '—'}</p>
                </div>
                
                <div class="detail-section">
                    <h3>🎯 Заголовки</h3>
                    ${Object.entries(page.headings).map(([tag, headings]) => 
                        headings.length > 0 ? `<p><strong>${tag.toUpperCase()}:</strong> ${headings.join(' | ')}</p>` : ''
                    ).join('')}
                </div>
                
                <div class="detail-section">
                    <h3>🔮 Семантическая разметка</h3>
                    <p><strong>JSON-LD:</strong> ${page.structuredData.jsonLdCount} блоков</p>
                    <p><strong>Schema Types:</strong> ${page.structuredData.schemaTypes.join(', ') || '—'}</p>
                </div>
                
                <div class="detail-section">
                    <h3>📈 Контент-анализ</h3>
                    <p><strong>Текст:</strong> ${page.content.textLength} символов</p>
                    <p><strong>Изображения:</strong> ${page.content.imagesCount}</p>
                    <p><strong>Ссылки:</strong> ${page.content.internalLinksCount} внутр. / ${page.content.externalLinksCount} внеш.</p>
                    <p><strong>Входящие ссылки:</strong> ${page.technical.internalLinkCount}</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

function exportFullData() {
    const results = seoAdvancedCrawler.getResults();
    const jsonContent = JSON.stringify(results, null, 2);
    downloadFile(jsonContent, 'seo_audit_full_data.json', 'application/json');
}

function exportDetailedCSV() {
    const results = seoAdvancedCrawler.getResults();
    const headers = [
        'URL', 'Status', 'Title', 'Description', 'H1', 'Canonical', 'Robots',
        'OG Title', 'OG Description', 'Text Length', 'Images Count',
        'Internal Links', 'External Links', 'Incoming Links', 'Schema Types',
        'Response Time', 'Page Size', 'Timestamp'
    ];
    
    const csvContent = [
        headers.join(','),
        ...results.mainPages.map(page => [
            `"${page.url}"`,
            page.status,
            `"${(page.title || '').replace(/"/g, '""')}"`,
            `"${(page.description || '').replace(/"/g, '""')}"`,
            `"${(page.h1 || '').replace(/"/g, '""')}"`,
            `"${(page.canonical || '').replace(/"/g, '""')}"`,
            `"${(page.robots || '').replace(/"/g, '""')}"`,
            `"${(page.ogTitle || '').replace(/"/g, '""')}"`,
            `"${(page.ogDescription || '').replace(/"/g, '""')}"`,
            page.content.textLength,
            page.content.imagesCount,
            page.content.internalLinksCount,
            page.content.externalLinksCount,
            page.technical.internalLinkCount,
            `"${page.structuredData.schemaTypes.join('; ')}"`,
            page.technical.responseTime,
            page.technical.pageSize,
            `"${page.timestamp}"`
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'seo_audit_detailed.csv', 'text/csv');
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
}

function showError(message) {
    const errorElement = document.getElementById('error');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Восстанавливаем сохраненные настройки если есть
    const savedUrl = localStorage.getItem('last_crawl_url');
    if (savedUrl) {
        document.getElementById('urlInput').value = savedUrl;
    }
});
