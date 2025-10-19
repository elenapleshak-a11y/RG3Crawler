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
            // Загружаем данные сайтов
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
            // Используем демо-данные
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

    getDemoSiteData(baseUrl, type) {
        // Демо-данные для тестирования
        const pages = [
            {
                url: `${baseUrl}/`,
                status: 200,
                title: type === 'old' ? 'Главная страница' : 'Домашняя страница',
                description: type === 'old' ? 'Описание главной страницы' : 'Новое описание домашней страницы',
                h1: type === 'old' ? 'Добро пожаловать' : 'Welcome to our site',
                canonical: `${baseUrl}/`,
                responseTime: type === 'old' ? 150 : 180,
                size: type === 'old' ? 24500 : 26500,
                robots: 'index, follow'
            },
            {
                url: `${baseUrl}/about`,
                status: 200,
                title: 'О компании',
                description: 'Информация о нашей компании',
                h1: 'О нас',
                canonical: `${baseUrl}/about`,
                responseTime: 120,
                size: 18700,
                robots: 'index, follow'
            },
            {
                url: `${baseUrl}/contact`,
                status: type === 'new' ? 404 : 200,
                title: 'Контакты',
                description: 'Как с нами связаться',
                h1: 'Контакты',
                canonical: `${baseUrl}/contact`,
                responseTime: 110,
                size: 15600,
                robots: 'index, follow'
            },
            {
                url: `${baseUrl}/services`,
                status: 200,
                title: type === 'old' ? 'Наши услуги' : 'Услуги компании',
                description: type === 'old' ? 'Список наших услуг' : 'Перечень предоставляемых услуг',
                h1: 'Услуги',
                canonical: `${baseUrl}/services`,
                responseTime: type === 'old' ? 130 : 160,
                size: type === 'old' ? 19800 : 21500,
                robots: 'index, follow'
            }
        ];

        // Добавляем специфичные страницы для демонстрации
        if (type === 'new') {
            pages.push({
                url: `${baseUrl}/blog`,
                status: 200,
                title: 'Наш блог',
                description: 'Статьи и новости компании',
                h1: 'Блог',
                canonical: `${baseUrl}/blog`,
                responseTime: 140,
                size: 22700,
                robots: 'index, follow'
            });
        }

        if (type === 'old') {
            pages.push({
                url: `${baseUrl}/portfolio`,
                status: 200,
                title: 'Портфолио',
                description: 'Наши работы',
                h1: 'Портфолио',
                canonical: `${baseUrl}/portfolio`,
                responseTime: 125,
                size: 20300,
                robots: 'index, follow'
            });
        }

        return {
            baseUrl: baseUrl,
            pages: pages
        };
    }

    mapUrls() {
        const mapping = new Map();
        
        if (!this.config.autoMapUrls && !this.config.customUrlMapping) {
            this.log('⚠️ Не выбран метод сопоставления URL', 'warning');
            return new Map();
        }

        if (this.config.customUrlMapping) {
            // Используем пользовательское сопоставление
            this.config.customUrlMapping.forEach(pair => {
                mapping.set(pair.old_url, pair.new_url);
                this.log(`🔗 Сопоставлено (ручное): ${pair.old_url} → ${pair.new_url}`, 'success');
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
        // Ищем точное совпадение пути
        for (let newPage of newSiteData.pages) {
            const newPath = new URL(newPage.url).pathname;
            if (oldPath === newPath) {
                return newPage.url;
            }
        }
        
        // Ищем похожий путь (по последнему сегменту)
        for (let newPage of newSiteData.pages) {
            const newPath = new URL(newPage.url).pathname;
            if (this.arePathsSimilar(oldPath, newPath)) {
                return newPage.url;
            }
        }
        
        return null;
    }

    arePathsSimilar(path1, path2) {
        const segments1 = path1.split('/').filter(s => s);
        const segments2 = path2.split('/').filter(s => s);
        
        if (segments1.length === 0 || segments2.length === 0) return false;
        
        return segments1[segments1.length - 1] === segments2[segments2.length - 1];
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
            
            results.summary.totalCompared++;
            
            if (!newPage) {
                // Страница отсутствует на новом сайте
                results.missingOnNew.push({
                    oldUrl: oldUrl,
                    oldTitle: oldPage?.title,
                    oldStatus: oldPage?.status,
                    oldDescription: oldPage?.description
                });
                results.summary.missingOnNew++;
                return;
            }
            
            if (!oldPage) {
                // Страница отсутствует на старом сайте (новая страница)
                results.missingOnOld.push({
                    newUrl: newUrl,
                    newTitle: newPage?.title,
                    newStatus: newPage?.status,
                    newDescription: newPage?.description
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
                    status: oldPage.status,
                    oldTitle: oldPage.title
                });
                results.summary.redirectsFound++;
            }
            
            // Проверяем битые ссылки
            if (this.config.checkBrokenLinks && newPage.status >= 400) {
                results.brokenLinks.push({
                    url: newUrl,
                    status: newPage.status,
                    title: newPage.title,
                    oldUrl: oldUrl
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

        if (Math.abs(oldPage.size - newPage.size) > 5000) {
            comparison.differences.push('size');
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
        
        // Ошибка 404 на новой странице
        if (newPage.status === 404) {
            warnings.push({
                type: 'page_not_found',
                message: `Страница возвращает 404: ${newPage.url}`,
                severity: 'critical',
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
        this.log(`🆕 Новых страниц: ${summary.missingOnOld}`, 'info');
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
    document.getElementById('compareBtn').style.display = 'inline-block';
    document.getElementById('stopCompareBtn').style.display = 'none';
    
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
    const matchPercentage = summary.totalCompared > 0 ? Math.round((summary.identical / summary.totalCompared) * 100) : 0;
    
    summaryCards.innerHTML = `
        <div class="summary-cards-grid">
            <div class="summary-card ${matchPercentage >= 90 ? 'success' : matchPercentage >= 70 ? 'warning' : 'error'}">
                <div class="summary-card-number">${matchPercentage}%</div>
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
        
        <div class="summary-cards-grid" style="margin-top: 20px;">
            <div class="summary-card ${summary.redirectsFound === 0 ? 'success' : 'warning'}">
                <div class="summary-card-number">${summary.redirectsFound}</div>
                <div class="summary-card-label">Редиректов</div>
            </div>
            <div class="summary-card ${summary.missingOnOld === 0 ? 'success' : 'info'}">
                <div class="summary-card-number">${summary.missingOnOld}</div>
                <div class="summary-card-label">Новых страниц</div>
            </div>
            <div class="summary-card ${summary.withDifferences === 0 ? 'success' : 'warning'}">
                <div class="summary-card-number">${summary.withDifferences}</div>
                <div class="summary-card-label">С отличиями</div>
            </div>
            <div class="summary-card info">
                <div class="summary-card-number">${summary.totalCompared}</div>
                <div class="summary-card-label">Всего проверено</div>
            </div>
        </div>
    `;
}

function showComparisonTable(results) {
    const table = document.getElementById('comparisonTable');
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Старый URL</th>
                    <th>Новый URL</th>
                    <th>Статус</th>
                    <th>Отличия</th>
                    <th>Действия</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    results.comparedPages.forEach(page => {
        const statusClass = page.status === 'identical' ? 'status-identical' : 'status-differences';
        const statusText = page.status === 'identical' ? '✅ Идентично' : '⚠️ Отличия';
        const differences = page.differences.join(', ') || 'Нет';
        
        html += `
            <tr>
                <td><a href="${page.oldUrl}" target="_blank">${page.oldUrl}</a></td>
                <td><a href="${page.newUrl}" target="_blank">${page.newUrl}</a></td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td>${differences}</td>
                <td>
                    <button onclick="showPageDetails('${page.oldUrl}', '${page.newUrl}')">🔍 Детали</button>
                </td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    table.innerHTML = html;
}

function showRedirectsTable(results) {
    const table = document.getElementById('redirectsTable');
    
    if (results.redirects.length === 0) {
        table.innerHTML = '<div class="no-data">✅ Редиректов не найдено</div>';
        return;
    }
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Откуда</th>
                    <th>Куда</th>
                    <th>Статус</th>
                    <th>Заголовок</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    results.redirects.forEach(redirect => {
        html += `
            <tr>
                <td><a href="${redirect.from}" target="_blank">${redirect.from}</a></td>
                <td><a href="${redirect.to}" target="_blank">${redirect.to}</a></td>
                <td>${redirect.status}</td>
                <td>${redirect.oldTitle || '—'}</td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    table.innerHTML = html;
}

function showBrokenLinksTable(results) {
    const table = document.getElementById('brokenLinksTable');
    
    if (results.brokenLinks.length === 0) {
        table.innerHTML = '<div class="no-data">✅ Битых ссылок не найдено</div>';
        return;
    }
    
    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>URL</th>
                    <th>Статус</th>
                    <th>Заголовок</th>
                    <th>Старый URL</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    results.brokenLinks.forEach(link => {
        const statusClass = link.status >= 400 ? 'status-error' : '';
        html += `
            <tr>
                <td><a href="${link.url}" target="_blank">${link.url}</a></td>
                <td class="${statusClass}">${link.status}</td>
                <td>${link.title || '—'}</td>
                <td>${link.oldUrl ? `<a href="${link.oldUrl}" target="_blank">${link.oldUrl}</a>` : '—'}</td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    table.innerHTML = html;
}

function showMissingPagesTables(results) {
    // Страницы отсутствующие на новом сайте
    const missingNewTable = document.getElementById('missingNewTable');
    if (results.missingOnNew.length === 0) {
        missingNewTable.innerHTML = '<div class="no-data">✅ Все страницы перенесены</div>';
    } else {
        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>URL</th>
                        <th>Заголовок</th>
                        <th>Статус</th>
                        <th>Описание</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        results.missingOnNew.forEach(page => {
            html += `
                <tr>
                    <td><a href="${page.oldUrl}" target="_blank">${page.oldUrl}</a></td>
                    <td>${page.oldTitle || '—'}</td>
                    <td>${page.oldStatus || '—'}</td>
                    <td>${page.oldDescription || '—'}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        missingNewTable.innerHTML = html;
    }
    
    // Новые страницы (отсутствующие на старом сайте)
    const missingOldTable = document.getElementById('missingOldTable');
    if (results.missingOnOld.length === 0) {
        missingOldTable.innerHTML = '<div class="no-data">✅ Новых страниц нет</div>';
    } else {
        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>URL</th>
                        <th>Заголовок</th>
                        <th>Статус</th>
                        <th>Описание</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        results.missingOnOld.forEach(page => {
            html += `
                <tr>
                    <td><a href="${page.newUrl}" target="_blank">${page.newUrl}</a></td>
                    <td>${page.newTitle || '—'}</td>
                    <td>${page.newStatus || '—'}</td>
                    <td>${page.newDescription || '—'}</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        missingOldTable.innerHTML = html;
    }
}

function showWarningsList(results) {
    const warningsList = document.getElementById('warningsList');
    
    if (results.warnings.length === 0) {
        warningsList.innerHTML = '<div class="no-data">✅ Критических предупреждений нет</div>';
        return;
    }
    
    let html = '';
    results.warnings.forEach(warning => {
        const severityClass = `warning-${warning.severity}`;
        html += `
            <div class="warning-item ${severityClass}">
                <div class="warning-header">
                    <span class="warning-type">${getWarningTypeText(warning.type)}</span>
                    <span class="warning-severity">${getSeverityText(warning.severity)}</span>
                </div>
                <div class="warning-message">${warning.message}</div>
                <div class="warning-page">Страница: <a href="${warning.page}" target="_blank">${warning.page}</a></div>
            </div>
        `;
    });
    
    warningsList.innerHTML = html;
}

function getWarningTypeText(type) {
    const types = {
        'noindex': '🚫 Noindex',
        'canonical_changed': '🔀 Canonical изменен',
        'performance_degradation': '🐌 Ухудшение производительности',
        'page_not_found': '❌ Страница не найдена'
    };
    return types[type] || type;
}

function getSeverityText(severity) {
    const severities = {
        'critical': '🚨 Критическое',
        'warning': '⚠️ Предупреждение',
        'info': 'ℹ️ Информация'
    };
    return severities[severity] || severity;
}

function showPageDetails(oldUrl, newUrl) {
    const results = siteComparator.comparisonResults;
    const comparison = results.comparedPages.find(p => p.oldUrl === oldUrl && p.newUrl === newUrl);
    
    if (!comparison) return;
    
    let detailsHtml = `
        <h3>🔍 Детальное сравнение страниц</h3>
        <div class="page-details">
            <div class="page-comparison">
                <div class="page-old">
                    <h4>📄 Старая страница</h4>
                    <div class="page-url"><strong>URL:</strong> <a href="${comparison.oldUrl}" target="_blank">${comparison.oldUrl}</a></div>
    `;
    
    // Добавляем сравнение атрибутов
    const attributes = ['title', 'description', 'h1', 'canonical', 'status', 'responseTime', 'size'];
    attributes.forEach(attr => {
        const oldValue = comparison.oldData[attr];
        const newValue = comparison.newData[attr];
        const isDifferent = comparison.differences.includes(attr);
        const diffClass = isDifferent ? 'diff' : '';
        
        detailsHtml += `
            <div class="attribute-comparison ${diffClass}">
                <div class="attribute-name">${getAttributeName(attr)}:</div>
                <div class="attribute-values">
                    <div class="attribute-old"><strong>Старое:</strong> ${formatValue(oldValue, attr)}</div>
                    <div class="attribute-new"><strong>Новое:</strong> ${formatValue(newValue, attr)}</div>
                </div>
            </div>
        `;
    });
    
    detailsHtml += `
            </div>
        </div>
        <div class="details-actions">
            <button onclick="closeModal()">Закрыть</button>
        </div>
    `;
    
    // Показываем модальное окно с деталями
    showModal(detailsHtml);
}

function getAttributeName(attr) {
    const names = {
        'title': 'Заголовок',
        'description': 'Описание',
        'h1': 'H1 заголовок',
        'canonical': 'Canonical URL',
        'status': 'HTTP статус',
        'responseTime': 'Время ответа (мс)',
        'size': 'Размер (байт)'
    };
    return names[attr] || attr;
}

function formatValue(value, attr) {
    if (value === undefined || value === null) return '—';
    if (attr === 'responseTime') return `${value} мс`;
    if (attr === 'size') return `${value.toLocaleString()} байт`;
    return value;
}

function showModal(content) {
    // Создаем модальное окно
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <span class="close" onclick="closeModal()">&times;</span>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Закрытие по клику вне контента
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
}

function openCompareTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    
    document.querySelector(`[onclick="openCompareTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

function openMissingTab(tabName) {
    document.querySelectorAll('.subtab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.subtab-pane').forEach(pane => pane.classList.remove('active'));
    
    document.querySelector(`[onclick="openMissingTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

function filterComparisonTable() {
    const filter = document.getElementById('comparisonFilter').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const rows = document.querySelectorAll('#comparisonTable tbody tr');
    
    rows.forEach(row => {
        const url = row.cells[0].textContent.toLowerCase();
        const status = row.cells[2].textContent;
        let show = true;
        
        // Фильтр по тексту
        if (filter && !url.includes(filter)) {
            show = false;
        }
        
        // Фильтр по статусу
        if (statusFilter !== 'all') {
            if (statusFilter === 'identical' && !status.includes('Идентично')) show = false;
            if (statusFilter === 'differences' && !status.includes('Отличия')) show = false;
            if (statusFilter === 'missing_new' && !status.includes('Отсутствует')) show = false;
            if (statusFilter === 'missing_old' && !status.includes('Новая')) show = false;
        }
        
        row.style.display = show ? '' : 'none';
    });
}

function exportComparisonXLSX() {
    alert('📊 Экспорт в Excel будет реализован в следующей версии');
    // В реальности здесь будет использование библиотеки like SheetJS
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
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Восстанавливаем сохраненные URL если есть
    const savedOldUrl = localStorage.getItem('comparison_old_url');
    const savedNewUrl = localStorage.getItem('comparison_new_url');
    
    if (savedOldUrl) {
        document.getElementById('oldSiteUrl').value = savedOldUrl;
    }
    if (savedNewUrl) {
        document.getElementById('newSiteUrl').value = savedNewUrl;
    }
});
