class SiteComparator {
    constructor() {
        this.oldSiteData = null;
        this.newSiteData = null;
        this.comparisonResults = null;
        this.isComparing = false;
        
        this.config = {
            autoMapUrls: true,
            checkRedirects: true,
            checkBrokenLinks: true,
            customUrlMapping: null
        };
    }

    async startComparison(oldSiteUrl, newSiteUrl) {
        if (!oldSiteUrl || !newSiteUrl) {
            throw new Error('Укажите URL обоих сайтов');
        }

        this.isComparing = true;
        this.log('🚀 Запуск сравнения сайтов...', 'info');
        this.log(`📊 Старый сайт: ${oldSiteUrl}`, 'info');
        this.log(`🎯 Новый сайт: ${newSiteUrl}`, 'info');

        try {
            // Загружаем данные сайтов (в реальности это будут результаты краулинга)
            await this.loadSiteData(oldSiteUrl, newSiteUrl);
            
            // Сопоставляем URL
            this.log('🔗 Сопоставление URL...', 'info');
            const urlMapping = this.mapUrls();
            
            // Выполняем сравнение
            this.log('⚖️ Выполнение сравнения...', 'info');
            this.comparisonResults = this.compareSites(urlMapping);
            
            // Анализируем результаты
            this.analyzeResults();
            
            this.completeComparison();
            
        } catch (error) {
            this.log(`❌ Ошибка сравнения: ${error.message}`, 'error');
            this.stopComparison();
        }
    }

    // Обновляем метод loadSiteData в SiteComparator
    async loadSiteData(oldSiteUrl, newSiteUrl) {
    this.log('📥 Загрузка данных сайтов...', 'info');
    
    // Пробуем загрузить из localStorage
    const oldData = this.loadCrawlData('old_site');
    const newData = this.loadCrawlData('new_site');
    
    if (oldData && newData) {
        this.oldSiteData = oldData;
        this.newSiteData = newData;
        this.log('✅ Данные загружены из сохраненных результатов', 'success');
    } else {
        // Используем демо-данные или запускаем краулинг
        this.log('ℹ️ Сохраненные данные не найдены, используем демо-режим', 'info');
        this.oldSiteData = this.getDemoSiteData(oldSiteUrl, 'old');
        this.newSiteData = this.getDemoSiteData(newSiteUrl, 'new');
    }
    
    this.log(`✅ Загружено: ${this.oldSiteData.pages.length} страниц со старого сайта`, 'success');
    this.log(`✅ Загружено: ${this.newSiteData.pages.length} страниц с нового сайта`, 'success');
}

loadCrawlData(siteKey) {
    const data = localStorage.getItem(`seo_crawl_${siteKey}`);
    if (data) {
        return JSON.parse(data);
    }
    return null;
}

// Добавляем функцию для запуска краулинга перед сравнением
async function crawlAndCompare() {
    const oldSiteUrl = document.getElementById('oldSiteUrl').value.trim();
    const newSiteUrl = document.getElementById('newSiteUrl').value.trim();
    
    if (!oldSiteUrl || !newSiteUrl) {
        showError('Укажите URL обоих сайтов');
        return;
    }
    
    const crawlFirst = confirm('Запустить краулинг обоих сайтов перед сравнением?');
    
    if (crawlFirst) {
        // Переключаемся в режим краулинга
        switchMode('crawl');
        
        // Сохраняем URL для последующего использования
        localStorage.setItem('comparison_old_url', oldSiteUrl);
        localStorage.setItem('comparison_new_url', newSiteUrl);
        
        alert('Запустите краулинг для старого сайта, затем для нового. После завершения вернитесь в режим сравнения.');
    } else {
        // Используем демо-данные
        startComparison();
    }
}

// Обновляем startComparison
function startComparison() {
    const oldSiteUrl = document.getElementById('oldSiteUrl').value.trim();
    const newSiteUrl = document.getElementById('newSiteUrl').value.trim();
    
    // Сохраняем URL в localStorage
    localStorage.setItem('comparison_old_url', oldSiteUrl);
    localStorage.setItem('comparison_new_url', newSiteUrl);
    
    // ... остальной код без изменений
}

    getDemoSiteData(baseUrl, type) {
        // Демо-данные - в реальности будут данные из краулера
        return {
            baseUrl: baseUrl,
            pages: [
                {
                    url: `${baseUrl}/`,
                    status: 200,
                    title: type === 'old' ? 'Главная страница' : 'Домашняя страница',
                    description: type === 'old' ? 'Описание главной страницы' : 'Новое описание домашней страницы',
                    h1: type === 'old' ? 'Добро пожаловать' : 'Welcome to our site',
                    canonical: `${baseUrl}/`,
                    responseTime: 150,
                    size: 24500
                },
                {
                    url: `${baseUrl}/about`,
                    status: 200,
                    title: 'О компании',
                    description: 'Информация о нашей компании',
                    h1: 'О нас',
                    canonical: `${baseUrl}/about`,
                    responseTime: 120,
                    size: 18700
                },
                {
                    url: `${baseUrl}/contact`,
                    status: type === 'new' ? 404 : 200,
                    title: 'Контакты',
                    description: 'Как с нами связаться',
                    h1: 'Контакты',
                    canonical: `${baseUrl}/contact`,
                    responseTime: 110,
                    size: 15600
                }
            ]
        };
    }

    mapUrls() {
        const mapping = new Map();
        
        if (this.config.customUrlMapping) {
            // Используем пользовательское сопоставление
            this.config.customUrlMapping.forEach(pair => {
                mapping.set(pair.old_url, pair.new_url);
            });
        } else if (this.config.autoMapUrls) {
            // Автоматическое сопоставление по пути
            this.oldSiteData.pages.forEach(oldPage => {
                const oldPath = new URL(oldPage.url).pathname;
                const correspondingNewUrl = this.findCorrespondingUrl(oldPath, this.newSiteData);
                
                if (correspondingNewUrl) {
                    mapping.set(oldPage.url, correspondingNewUrl);
                    this.log(`🔗 Сопоставлено: ${oldPage.url} → ${correspondingNewUrl}`, 'success');
                } else {
                    mapping.set(oldPage.url, null);
                    this.log(`❌ Не найден аналог для: ${oldPage.url}`, 'warning');
                }
            });
        }
        
        return mapping;
    }

    findCorrespondingUrl(oldPath, newSiteData) {
        // Простая логика: ищем страницу с таким же путем
        for (let newPage of newSiteData.pages) {
            const newPath = new URL(newPage.url).pathname;
            if (oldPath === newPath) {
                return newPage.url;
            }
        }
        
        // Если не нашли по точному совпадению, пробуем найти похожий путь
        for (let newPage of newSiteData.pages) {
            const newPath = new URL(newPage.url).pathname;
            if (this.arePathsSimilar(oldPath, newPath)) {
                return newPage.url;
            }
        }
        
        return null;
    }

    arePathsSimilar(path1, path2) {
        // Упрощенная логика сравнения путей
        const segments1 = path1.split('/').filter(s => s);
        const segments2 = path2.split('/').filter(s => s);
        
        return segments1.length === segments2.length && 
               segments1[segments1.length - 1] === segments2[segments2.length - 1];
    }

    compareSites(urlMapping) {
        const results = {
            comparedPages: [],
            redirects: [],
            brokenLinks: [],
            missingOnNew: [],
            missingOnOld: [],
            warnings: [],
            summary: {
                totalCompared: 0,
                identical: 0,
                withDifferences: 0,
                missingOnNew: 0,
                missingOnOld: 0,
                redirectsFound: 0,
                brokenLinksFound: 0,
                criticalWarnings: 0
            }
        };

        // Сравниваем сопоставленные страницы
        urlMapping.forEach((newUrl, oldUrl) => {
            const oldPage = this.findPageByUrl(oldUrl, this.oldSiteData.pages);
            const newPage = newUrl ? this.findPageByUrl(newUrl, this.newSiteData.pages) : null;
            
            results.totalCompared++;
            
            if (!newPage) {
                // Страница отсутствует на новом сайте
                results.missingOnNew.push({
                    oldUrl: oldUrl,
                    oldTitle: oldPage?.title,
                    oldStatus: oldPage?.status
                });
                results.summary.missingOnNew++;
                return;
            }
            
            if (!oldPage) {
                // Страница отсутствует на старом сайте (новая страница)
                results.missingOnOld.push({
                    newUrl: newUrl,
                    newTitle: newPage?.title,
                    newStatus: newPage?.status
                });
                results.summary.missingOnOld++;
                return;
            }
            
            // Сравниваем атрибуты страниц
            const comparison = this.comparePages(oldPage, newPage);
            results.comparedPages.push(comparison);
            
            if (comparison.status === 'identical') {
                results.summary.identical++;
            } else {
                results.summary.withDifferences++;
            }
            
            // Проверяем редиректы
            if (this.config.checkRedirects && oldPage.status >= 300 && oldPage.status < 400) {
                results.redirects.push({
                    from: oldUrl,
                    to: newUrl,
                    status: oldPage.status
                });
                results.summary.redirectsFound++;
            }
            
            // Проверяем битые ссылки
            if (this.config.checkBrokenLinks && newPage.status >= 400) {
                results.brokenLinks.push({
                    url: newUrl,
                    status: newPage.status,
                    title: newPage.title
                });
                results.summary.brokenLinksFound++;
            }
            
            // Проверяем критические предупреждения
            const warnings = this.checkCriticalWarnings(oldPage, newPage);
            results.warnings.push(...warnings);
            results.summary.criticalWarnings += warnings.length;
        });

        return results;
    }

    findPageByUrl(url, pages) {
        return pages.find(page => page.url === url) || null;
    }

    comparePages(oldPage, newPage) {
        const comparison = {
            oldUrl: oldPage.url,
            newUrl: newPage.url,
            status: 'identical',
            differences: [],
            oldData: {},
            newData: {}
        };

        // Сравниваем основные атрибуты
        const attributes = ['title', 'description', 'h1', 'canonical', 'status'];
        
        attributes.forEach(attr => {
            comparison.oldData[attr] = oldPage[attr];
            comparison.newData[attr] = newPage[attr];
            
            if (oldPage[attr] !== newPage[attr]) {
                comparison.differences.push(attr);
                comparison.status = 'differences';
            }
        });

        // Сравниваем технические параметры
        comparison.oldData.responseTime = oldPage.responseTime;
        comparison.newData.responseTime = newPage.responseTime;
        comparison.oldData.size = oldPage.size;
        comparison.newData.size = newPage.size;

        if (Math.abs(oldPage.responseTime - newPage.responseTime) > 100) {
            comparison.differences.push('responseTime');
            comparison.status = 'differences';
        }

        return comparison;
    }

    checkCriticalWarnings(oldPage, newPage) {
        const warnings = [];
        
        // Noindex на новой странице
        if (newPage.robots && newPage.robots.includes('noindex')) {
            warnings.push({
                type: 'noindex',
                message: `Страница ${newPage.url} имеет noindex`,
                severity: 'critical',
                page: newPage.url
            });
        }
        
        // Изменение canonical
        if (oldPage.canonical && newPage.canonical && oldPage.canonical !== newPage.canonical) {
            warnings.push({
                type: 'canonical_changed',
                message: `Canonical изменился: ${oldPage.canonical} → ${newPage.canonical}`,
                severity: 'warning',
                page: newPage.url
            });
        }
        
        // Значительное ухудшение производительности
        if (newPage.responseTime > oldPage.responseTime * 2) {
            warnings.push({
                type: 'performance_degradation',
                message: `Время загрузки ухудшилось: ${oldPage.responseTime}ms → ${newPage.responseTime}ms`,
                severity: 'warning',
                page: newPage.url
            });
        }
        
        return warnings;
    }

    analyzeResults() {
        this.log('📈 Анализ результатов...', 'info');
        
        const summary = this.comparisonResults.summary;
        
        this.log(`📊 Всего сравнено: ${summary.totalCompared} страниц`, 'info');
        this.log(`✅ Идентичных: ${summary.identical}`, summary.identical > 0 ? 'success' : 'warning');
        this.log(`⚠️ С отличиями: ${summary.withDifferences}`, summary.withDifferences > 0 ? 'warning' : 'success');
        this.log(`❌ Отсутствует на новом: ${summary.missingOnNew}`, summary.missingOnNew > 0 ? 'error' : 'success');
        this.log(`🔀 Редиректов: ${summary.redirectsFound}`, 'info');
        this.log(`🚫 Битых ссылок: ${summary.brokenLinksFound}`, summary.brokenLinksFound > 0 ? 'error' : 'success');
        this.log(`🚨 Критических предупреждений: ${summary.criticalWarnings}`, summary.criticalWarnings > 0 ? 'error' : 'success');
    }

    completeComparison() {
        this.isComparing = false;
        this.log('✅ Сравнение завершено!', 'success');
        
        if (typeof showComparisonResults === 'function') {
            showComparisonResults(this.comparisonResults);
        }
    }

    stopComparison() {
        this.isComparing = false;
        this.log('⏹️ Сравнение остановлено', 'warning');
    }

    log(message, type = 'info') {
        if (typeof addCompareLog === 'function') {
            addCompareLog(message, type);
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }
}

// Глобальный инстанс компаратора
const siteComparator = new SiteComparator();

// UI функции для режима сравнения
function switchMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.mode-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[onclick="switchMode('${mode}')"]`).classList.add('active');
    document.getElementById(`${mode}Mode`).classList.add('active');
}

function startComparison() {
    const oldSiteUrl = document.getElementById('oldSiteUrl').value.trim();
    const newSiteUrl = document.getElementById('newSiteUrl').value.trim();
    const autoMapUrls = document.getElementById('autoMapUrls').checked;
    const checkRedirects = document.getElementById('checkRedirects').checked;
    const checkBrokenLinks = document.getElementById('checkBrokenLinks').checked;
    
    if (!oldSiteUrl || !newSiteUrl) {
        showError('Укажите URL обоих сайтов');
        return;
    }
    
    document.getElementById('error').textContent = '';
    document.getElementById('compareProgressSection').style.display = 'block';
    document.getElementById('compareResultsSection').style.display = 'none';
    document.getElementById('compareBtn').style.display = 'none';
    document.getElementById('stopCompareBtn').style.display = 'inline-block';
    document.getElementById('compareLog').innerHTML = '';
    
    siteComparator.updateConfig({ 
        autoMapUrls, 
        checkRedirects, 
        checkBrokenLinks 
    });
    
    siteComparator.startComparison(oldSiteUrl, newSiteUrl).catch(error => {
        showError(error.message);
    });
}

function stopComparison() {
    siteComparator.stopComparison();
    document.getElementById('compareBtn').style.display = 'inline-block';
    document.getElementById('stopCompareBtn').style.display = 'none';
}

function addCompareLog(message, type = 'info') {
    const logElement = document.getElementById('compareLog');
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
    logElement.appendChild(logEntry);
    logElement.scrollTop = logElement.scrollHeight;
}

function showComparisonResults(results) {
    document.getElementById('compareProgressSection').style.display = 'none';
    document.getElementById('compareResultsSection').style.display = 'block';
    
    showComparisonSummary(results);
    showComparisonTable(results);
    showRedirectsTable(results);
    showBrokenLinksTable(results);
    showMissingPagesTables(results);
    showWarningsList(results);
}

function showComparisonSummary(results) {
    const summary = results.summary;
    const statsHtml = `
        <div class="final-stats">
            <div class="stat-item">📊 <strong>Всего сравнено:</strong> ${summary.totalCompared} страниц</div>
            <div class="stat-item">✅ <strong>Идентичных:</strong> ${summary.identical}</div>
            <div class="stat-item">⚠️ <strong>С отличиями:</strong> ${summary.withDifferences}</div>
            <div class="stat-item">❌ <strong>Отсутствует на новом:</strong> ${summary.missingOnNew}</div>
            <div class="stat-item">🆕 <strong>Новых страниц:</strong> ${summary.missingOnOld}</div>
            <div class="stat-item">🔀 <strong>Редиректов:</strong> ${summary.redirectsFound}</div>
            <div class="stat-item">🚫 <strong>Битых ссылок:</strong> ${summary.brokenLinksFound}</div>
            <div class="stat-item">🚨 <strong>Критических предупреждений:</strong> ${summary.criticalWarnings}</div>
        </div>
    `;
    
    document.getElementById('compareResultsStats').innerHTML = statsHtml;
    
    // Сводные карточки
    const summaryCards = document.getElementById('summaryCards');
    summaryCards.innerHTML = `
        <div class="summary-cards-grid">
            <div class="summary-card ${summary.identical === summary.totalCompared ? 'success' : 'warning'}">
                <div class="summary-card-number">${Math.round((summary.identical / summary.totalCompared) * 100)}%</div>
                <div class="summary-card-label">Совпадение</div>
            </div>
            <div class="summary-card ${summary.missingOnNew === 0 ? 'success' : 'error'}">
                <div class="summary-card-number">${summary.missingOnNew}</div>
                <div class="summary-card-label">Потеряно страниц</div>
            </div>
            <div class="summary-card ${summary.brokenLinksFound === 0 ? 'success' : 'error'}">
                <div class="summary-card-number">${summary.brokenLinksFound}</div>
                <div class="summary-card-label">Битых ссылок</div>
            </div>
            <div class="summary-card ${summary.criticalWarnings === 0 ? 'success' : 'error'}">
                <div class="summary-card-number">${summary.criticalWarnings}</div>
                <div class="summary-card-label">Критических ошибок</div>
            </div>
        </div>
    `;
}

// ... остальные функции для отображения таблиц ...

function exportComparisonXLSX() {
    // В реальности здесь будет генерация Excel файла
    alert('Экспорт в Excel будет реализован в следующей версии');
}

function exportComparisonJSON() {
    const results = siteComparator.comparisonResults;
    const jsonContent = JSON.stringify(results, null, 2);
    downloadFile(jsonContent, 'site_comparison.json', 'application/json');
}

function exportComparisonSummary() {
    const results = siteComparator.comparisonResults;
    const headers = ['Метрика', 'Значение'];
    const csvContent = [
        headers.join(','),
        ['Всего сравнено страниц', results.summary.totalCompared].join(','),
        ['Идентичных страниц', results.summary.identical].join(','),
        ['Страниц с отличиями', results.summary.withDifferences].join(','),
        ['Отсутствует на новом сайте', results.summary.missingOnNew].join(','),
        ['Новых страниц', results.summary.missingOnOld].join(','),
        ['Найдено редиректов', results.summary.redirectsFound].join(','),
        ['Битых ссылок', results.summary.brokenLinksFound].join(','),
        ['Критических предупреждений', results.summary.criticalWarnings].join(',')
    ].join('\n');
    
    downloadFile(csvContent, 'comparison_summary.csv', 'text/csv');
}
