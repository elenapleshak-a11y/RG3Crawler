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
            collectTechnicalData: true
        };

        // Для подсчета входящих ссылок
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

    // ... (crawlAllPages, crawlSinglePage, recordPageTime, getTimeEstimate, 
    // getElapsedTime, formatTime, getProgressData методы остаются без изменений)

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
            const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SEOAdvancedCrawler/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml'
                }
            });

            pageData.responseTime = Date.now() - startTime;
            pageData.status = response.status;

            if (response.ok) {
                const html = await response.text();
                pageData.size = new Blob([html]).size;
                
                // Парсим HTML и извлекаем все данные
                const parsedData = this.parseHTMLContent(html, url, baseUrl);
                Object.assign(pageData, parsedData);
                
                pageData.links = parsedData.content.internalLinks.concat(parsedData.content.externalLinks);
            }

        } catch (error) {
            pageData.error = error.message;
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
                        nofollow: link.getAttribute('rel')?.includes('nofollow') || false
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

    // ... (processLinks, getLinkType, normalizeUrl, isSameDomain, 
    // shouldCrawlUrl, isValidPageUrl, isValidUrl, findSourceUrl методы остаются)

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

    // ... (остальные вспомогательные методы без изменений)

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
            stats: this.stats
        };
    }

    saveToLocalStorage(siteKey) {
        const data = {
            baseUrl: this.config.baseUrl,
            pages: Array.from(this.visitedUrls.values()),
            externalLinks: Array.from(this.externalLinks.entries()),
            brokenLinks: Array.from(this.brokenLinks.entries()),
            files: Array.from(this.files.entries()),
            stats: this.stats,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem(`seo_crawl_${siteKey}`, JSON.stringify(data));
        this.log(`💾 Данные сохранены: ${siteKey}`, 'success');
    }

    loadFromLocalStorage(siteKey) {
        const data = localStorage.getItem(`seo_crawl_${siteKey}`);
        if (data) {
            const parsed = JSON.parse(data);
            this.log(`📂 Загружены данные: ${siteKey} (${parsed.pages.length} страниц)`, 'success');
            return parsed;
        }
        return null;
    }

    getCrawlData() {
        return {
            baseUrl: this.config.baseUrl,
            pages: Array.from(this.visitedUrls.values()),
            externalLinks: Array.from(this.externalLinks.entries()),
            brokenLinks: Array.from(this.brokenLinks.entries()),
            files: Array.from(this.files.entries()),
            stats: this.stats,
            timestamp: new Date().toISOString()
        };
    }
}

// Добавляем кнопку сохранения в UI
function addSaveButton() {
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Сохранить данные';
    saveBtn.onclick = saveCrawlData;
    document.querySelector('.export-buttons').appendChild(saveBtn);
}

function saveCrawlData() {
    const siteKey = prompt('Введите название для сохранения (например: old_site):');
    if (siteKey) {
        seoAdvancedCrawler.saveToLocalStorage(siteKey);
    }
}
}

// Глобальный инстанс краулера
const seoAdvancedCrawler = new SEOAdvancedCrawler();

// Обновленные UI функции для отображения расширенных данных
function fillMainPagesTable(pages) {
    const table = document.getElementById('mainPagesTable');
    table.innerHTML = `
        <table>
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
                </tr>
            </thead>
            <tbody>
                ${pages.map(page => `
                    <tr>
                        <td><a href="${page.url}" target="_blank">${page.url}</a></td>
                        <td class="status-${page.status}">${page.status}</td>
                        <td title="${page.title}">${page.title.substring(0, 40)}${page.title.length > 40 ? '...' : ''}</td>
                        <td title="${page.h1}">${page.h1.substring(0, 30)}${page.h1.length > 30 ? '...' : ''}</td>
                        <td>${page.structuredData.schemaTypes.join(', ').substring(0, 20)}${page.structuredData.schemaTypes.join(', ').length > 20 ? '...' : ''}</td>
                        <td>${(page.content.textLength / 1000).toFixed(1)}k</td>
                        <td>${page.content.internalLinksCount}/${page.content.externalLinksCount}</td>
                        <td>${page.technical.internalLinkCount}</td>
                        <td>${page.technical.responseTime}ms</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Новая функция для детального просмотра страницы
function showPageDetails(page) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Детальная информация: ${page.url}</h2>
            
            <div class="details-grid">
                <div class="detail-section">
                    <h3>📊 Базовые мета-данные</h3>
                    <p><strong>Title:</strong> ${page.title}</p>
                    <p><strong>Description:</strong> ${page.description}</p>
                    <p><strong>H1:</strong> ${page.h1}</p>
                    <p><strong>Canonical:</strong> ${page.canonical}</p>
                    <p><strong>Robots:</strong> ${page.robots}</p>
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
                    <p><strong>Schema Types:</strong> ${page.structuredData.schemaTypes.join(', ')}</p>
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
    
    modal.querySelector('.close').onclick = () => modal.remove();
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
}

// Обновляем функцию экспорта для расширенных данных
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

// Обновляем конфигурацию в startCrawling
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

// ... (остальные функции UI без изменений)
