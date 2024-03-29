const parse = require('scrape-it');
const puppeteer = require('puppeteer');
const URL = require('url');
const axios = require('axios');
const iconv = require('iconv-lite');
const fs = require('fs');


class Parser {

    constructor(SQL = null) {

        /**
         * Подключение к БД, если нужно
         * @type {MySQLClass}
         */
        this.SQL = null;

        /**
         * Единый инстанс пупетки
         * @type {null}
         */
        this.Puppeteer = null;

        /**
         * Запуск
         * @type {boolean}
         */
        this.PuppeteerRunning = false;

        /**
         * Куки всех доменов в пуле
         * @type {*[]}
         */
        this.Cookies = [];

    }

    /**
     * Парсинг
     * @param json
     * @param subpages
     * @param opts
     * @return {Promise<Object>}
     */
    async parseOne(json, subpages, opts = {}) {

        // Нормализуем параметры и заполняем стандартными параметрами неизвестные
        opts = this.normalizeOpts(opts);

        // Получаем страницу
        let data = await this.parsePage(json, opts);

        // постобработка: обогащаем страницу подстраницами
        if (subpages !== undefined && subpages.length > 0)
            await this.subpageLoad(data, json.data, subpages);

        return data;

    }

    /**
     * Распарсить одну страницу
     * @param json
     * @param opts
     * @return {Promise<*>}
     */
    async parsePage(json, opts = {}) {

        // Готовим парсер
        this.prepareParser(json.data);

        let parsed = null;
        let cookies = null;

        // Загружаем текст, если нужна полноценная загрузка SPA
        if (json.loadType === 'spa' || json.loadType === 'cookies' && this.GetDomainCookie(json.url) === null) {
            try {

                // Запускаем инстанс, если не запущен
                await this.LaunchBrowserInstance();

                let page = await this.Puppeteer.newPage();
                await page.goto(json.url, {waitUntil: 'load'});
                await this.sleep(opts.Pauses.SPA_AfterLoad);

                let html = "";

                if (json.loadType === 'spa')
                    html = await page.evaluate(() => {
                        return document.querySelector('html').outerHTML
                    });

                if (json.loadType === 'cookies')
                    html = await page.cookies();

                await page.close();

                if (json.loadType === 'spa')
                    parsed = await parse.scrapeHTML(html, json.data);
                if (json.loadType === 'cookies')
                    this.SetDomainCookie(html, json.url);

            } catch (ex) {
                console.log("Ошибка парса [spa]: " + ex.name + ": " + ex.message + "\r\n" + ex.stack);
                debugger;
            }

        }

        if (json.loadType === 'html' || json.loadType === 'cookies' && this.GetDomainCookie(json.url) !== null) {

            // Получаем через axios, чтобы можно было определить кодировку
            const response = await axios.request({
                method: 'GET',
                url: json.url,
                responseType: 'arraybuffer',
                responseEncoding: 'binary',
                headers: Object.assign({}, this.GetDomainCookie(json.url) === null ? {} : {
                    Cookie: this.GetDomainCookie(json.url).map(res => res.name + "=" + res.value).join(";")
                })
            });

            // Сохраняем свежие кукисы
            // TODO: необязательно, но желательно, если возникнет када-нибудь потребность
            const cookie = response.headers["set-cookie"];

            // Конвертим буффер в UTF8 по-умолчанию
            const UTF8Converted = response.data.toString('utf8');

            let encoding = null;

            // Ищем кодировку в хедерах
            if (response.headers.hasOwnProperty('content-type') && response.headers['content-type'].indexOf('charset=') !== -1)
                encoding = response.headers['content-type'].substr(response.headers['content-type'].indexOf('charset=') + 'charset='.length);

            // Ищем кодировку в мета-тегах
            if (encoding === null) {
                let enc = UTF8Converted.match(/<head>(.*?)<meta(.*?) charset(\s*?)=(\s*?)("|')(.*?)("|')(.*?)<\/head>/);
                if (enc !== null)
                    encoding = enc[6];
                else {
                    // TODO: Нужна реализация поиска кодировки в http-equiv="Content-Type"
                    //enc = UTF8Converted.match(/<head>(.*?)<meta(.*?) http-equiv="Content-Type" (\s*?)=(\s*?)("|')(.*?)("|')(.*?)<\/head>/);
                    //if (enc !== null)
                    //encoding = enc[6];
                    console.log("Требуется реализация")
                    debugger;
                }
            }

            // Если кодировка utf8, либо не найдена - ничего не делаем, иначе - преобразуем в чистый текст
            let DecodedData = "";
            if (encoding === null || encoding.toString().toLowerCase().replace(/([^a-z0-9])/, '') === 'utf8')
                DecodedData = UTF8Converted;
            else
                DecodedData = iconv.decode(response.data, encoding);

            // Если надо спарсить статично
            try {
                parsed = (await parse.scrapeHTML(DecodedData, json.data));
            } catch (ex) {
                console.log("Ошибка парса [static html]: " + ex.name + ": " + ex.message + "\r\n" + ex.stack);
                debugger;
            }
        }

        return parsed;

    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    prepareParser(json) {
        for (let key in json) {
            if (key === 'locked') {
                delete json[key];
                continue;
            }
            if (typeof json[key].selector === 'string') {

                // Convert string to func
                if (json[key].hasOwnProperty('convert') && typeof json[key].convert === 'string') {
                    if (json[key].convert === '') {
                        delete json[key].convert;
                    } else {
                        let func = json[key].convert;
                        json[key].convert = function (res) {
                            try {
                                return eval(func);
                            } catch (e) {
                                return "ERROR: " + e.message
                            }
                        }
                    }
                }

                // How string to func
                if (json[key].hasOwnProperty('how') && typeof json[key].how === 'string') {
                    if (json[key].how === '') {
                        delete json[key].how;
                    } else {
                        let func = json[key].how;
                        if (func !== 'html' && func !== 'text') {
                            json[key].how = function (res) {
                                try {
                                    return eval(func);
                                } catch (e) {
                                    return "ERROR: " + e.message
                                }
                            }
                        }
                    }

                }

            } else if (typeof json[key] === 'object')
                this.prepareParser(json[key]);
        }
    }

    /**
     *
     * @param json входной массив
     * @param outdata выходной массив
     * @param subpages список подстраниц
     * @return {Promise<void>}
     */
    async subpageLoad(outdata, json, subpages) {
        for (let key in outdata) {
            if (typeof outdata[key].selector === 'string') {

            } else if (typeof outdata[key] === 'object') {

                // Если это массив (список), то проходим по нему дальше
                if (outdata[key] instanceof Array) {
                    if (json.hasOwnProperty(key)) {
                        if (json[key].hasOwnProperty('listItem') && json[key].hasOwnProperty('data')) {
                            await this.subpageLoad(outdata[key], json[key]['data'], subpages);
                        }
                    } else debugger;
                }

                // Простой объект со списком параметров
                else {

                    // проходимся по каждому параметру, ищем подстраницы
                    for (let nameKey in json) {
                        if (json[nameKey].hasOwnProperty('subpage') && json[nameKey]['subpage'] !== "") {

                            // Подстраница найдена, ищем её в общем списке
                            let sp = subpages.find(res => res.name === json[nameKey]['subpage']);

                            // Делаем проверки в массиве
                            if (sp === null) {
                                console.log("Не найдена подстраница с тегом #" + nameKey);
                                continue;
                            }

                            // Проверяем корректность юрл
                            let subPageURL = "";
                            try {
                                subPageURL = new URL.parse(outdata[key][nameKey]);
                            } catch (ex) {
                                console.log("Not valid URL for subpage #" + json[nameKey]['subpage'] + "; URL: " + outdata[key][nameKey]);
                                continue;
                            }

                            // Получаем страницу рекурсивно [может быть любая глубина подстраниц у самих подстраниц]
                            let outSubpage = await this.parsePage({
                                url: outdata[key][nameKey],
                                loadType: sp.loadType,
                                data: sp.data,
                                subpages: subpages
                            });

                            // Вписываем элементы подстраницы в результирующий массив
                            for (let outSubpageKey in outSubpage)
                                outdata[key][outSubpageKey] = outSubpage[outSubpageKey];

                        }
                    }

                }
            }
        }
    }

    /**
     * Рекурсивно найти все элементы с заданным ключом
     * @param json
     * @param key
     */
    findItemsByKey(json, key, itemsArr = []) {
        if (typeof json === 'object') {
            for (let tKey in json) {
                if (tKey === key) itemsArr.push(json[key]);
                this.findItemsByKey(json[tKey], key, itemsArr);
            }
        }
        return itemsArr;
    }

    /**
     * Рекурсивно найти элемент с заданным ключом
     * @param json
     * @param key
     */
    findItemByKey(json, key) {
        if (typeof json === 'object') {
            for (let tKey in json) {
                if (tKey === key) return json[key];
                let returned = this.findItemByKey(json[tKey], key);
                if (returned !== null)
                    return returned;
            }
        }
        return null;
    }

    /**
     * Постраничный парсер
     * @param json
     * @param opts Параметры
     * @param opts.Pauses
     * @param {int} opts.Pauses.Subpages
     * @param {int} opts.Pauses.Pagination
     * @param {int} opts.Pauses.SPA_AfterLoad
     * @param opts.Save
     * @param {string} opts.Save.toFile
     * @param {('xls')} opts.Save.format
     * @param {('EachSubpage','EachPage')} opts.Save.saveAfter
     * @param {int} opts.PagesLimit
     * @param {Function} opts.stopCallback Коллбек, который проверяет, когда надо остановиться при парсе страниц
     * @param {Function} opts.pageErrorCallback Коллбек, который вызывается при любой ошибки парса основной страницы (не sub-страниц)
     * @param {Function} opts.pageIgnoreCallback Коллбек, который проверяет, какую страницу не надо парсить
     * @param {Function} opts.pageConverter Функция, которая конвертит страницу
     * @return {Promise<object>}
     */
    async parse(json, opts = {}) {

        // Нормализуем параметры и заполняем стандартными параметрами неизвестные
        opts = this.normalizeOpts(opts);

        // Если вместо json передан int номер парсера в базе, загружаем его
        if (typeof json === 'number') {
            json = await this.getJSONFromDB(json);
        }

        // Не нужно указывать subpages, если они есть во входном массиве [так обычно и приходит]
        let subpages = [];
        if (json.hasOwnProperty('subpages')) {
            subpages = json['subpages'];
        }

        let totalPages = 0;

        // Парсим страницы по ходу появления надписи "следующая страница" любое число раз
        while (true) {

            // Парсим страницу
            let pagedata = await this.parseOne(json, subpages, opts);

            // Конвертируем спраршенное через функцию-конвертер
            await opts.pageConverter(pagedata);

            // Если нужно сохранить результат между страницами
            await this.saveData(pagedata, opts);

            // находим параметр NextPage, и соотв. ссылку на него
            let nextpagelink = pagedata.hasOwnProperty('nextpage') ? pagedata['nextpage'] : this.findItemByKey('nextpage');

            // Триггер завершения
            if (await opts.stopCallback(pagedata)) return pagedata;

            // Если след страницы нет - парсинг завершён: выходим
            if (nextpagelink === "" || nextpagelink === null) return pagedata;

            // Если исчерпан лимит страниц - выходим
            // Можно указать ноль или -1, и тогда это бесконечное число страниц
            totalPages += 1;
            if (totalPages >= opts.PagesLimit && opts.PagesLimit !== 0 && opts.PagesLimit !== -1) return pagedata;

            // Указываем новый линк для следующей страницы:
            json.url = nextpagelink;

            // Делаем паузу перед след. страницей
            await this.sleep(opts.Pauses.Pagination);

        }

    }

    /**
     * Нормализуем параметры парсера, если каких-то из них нет
     * @param opts
     */
    normalizeOpts(opts) {

        if (!opts.hasOwnProperty('Pauses')) opts['Pauses'] = {};
        if (!opts.Pauses.hasOwnProperty('Subpages')) opts.Pauses['Subpages'] = 0;
        if (!opts.Pauses.hasOwnProperty('Pagination')) opts.Pauses['Pagination'] = 0;
        if (!opts.Pauses.hasOwnProperty('SPA_AfterLoad')) opts.Pauses['SPA_AfterLoad'] = 2000;

        if (!opts.hasOwnProperty('PagesLimit')) opts['PagesLimit'] = 10;

        if (!opts.hasOwnProperty('Save')) opts['Save'] = {};
        if (!opts.Save.hasOwnProperty('toFile')) opts.Save['toFile'] = "";
        if (!opts.Save.hasOwnProperty('format')) opts.Save['format'] = "xlsx";
        if (!opts.Save.hasOwnProperty('saveAfter')) opts.Save['saveAfter'] = 'EachPage';

        if (!opts.hasOwnProperty('stopCallback')) opts['stopCallback'] = async function (parsedPage, parsedItem) {
            return false;
        };
        if (!opts.hasOwnProperty('pageIgnoreCallback')) opts['pageIgnoreCallback'] = async function (parsedPage) {
            return false;
        };
        if (!opts.hasOwnProperty('pageConverter')) opts['pageConverter'] = async function (parsedPage) {
            return parsedPage;
        };

        return opts;

    }

    /**
     * Сохранить данные
     * @param data
     * @param opts Параметры
     * @param opts.Pauses
     * @param {int} opts.Pauses.Subpages
     * @param {int} opts.Pauses.Pagination
     * @param {int} opts.Pauses.SPA_AfterLoad
     * @param opts.Save
     * @param {string} opts.Save.toFile
     * @param {('xls')} opts.Save.format
     * @param {string} opts.Save.saveAfter
     * @param {string} opts.Save.saveAfter.EachSubpage
     * @param {string} opts.Save.saveAfter.EachPage
     * @param {Function} opts.stopCallback Коллбек, который проверяет, когда надо остановиться при парсе страниц
     * @param {Function} opts.pageIgnoreCallback Коллбек, который проверяет, какую страницу не надо парсить
     */
    saveData(data, opts) {

        // Чекаем формат
        if (opts.Save.toFile === "") return;

    }

    async getJSONFromDB(id) {

        let that = this;

        // Проверяем наличие объекта SQL: он может быть доставлен извне или уже быть подсоединён
        // Если коннекта нет - соединяем самостоятельно
        await that.initDB();

        // Соединение есть, получаем парсер из базы по его ID
        let parser = await that.SQL.get("parsers", "id = ?", [id]);

        // декодим данные
        parser.data = JSON.parse(parser.data);

        // получаем подстраницы
        parser.subpages = await that.SQL.selectAll("parsers", "domain = ?", [parser.domain]);

        // Десериализуем подстраницы
        parser.subpages.forEach(res => {
            if (typeof res.data === 'string' && res.data.substr(0, 1) === '{') res.data = JSON.parse(res.data);
        });

        return parser;

    }

    // Загружаем базу одноразово вначале, чтобы не было перекрёстных соединений при одновременном запуске нескольких парсеров
    async initDB() {

        let that = this;
        if (that.SQL === null) {

            // Парсим конфиг
            this.config = fs.existsSync("configParsers.json") ? JSON.parse(fs.readFileSync('configParsers.json', 'utf8')) : null;

            if (this.config !== null) {
                that.SQL = new (require('eznodemysql'));
                await that.SQL.connect(that.config.mysql.host, that.config.mysql.port, that.config.mysql.login, that.config.mysql.password, that.config.mysql.db);
            } else
                throw "Невозможно соединиться с базой";

        }

    }

    /**
     * Обойти защиту типа Клаудфлаера и получить кукисы
     * @param url
     * @param sleepMS
     */
    async getCookiesFromBrowser(url, sleepMS = 5000) {

        // Запускаем инстанс, если не запущен
        await this.LaunchBrowserInstance();

        let page = await this.Puppeteer.newPage();
        await page.goto(url, {waitUntil: 'load'});
        await this.sleep(sleepMS);
        let html = await page.cookies();
        await page.screenshot({path: 'buddy-screenshot.png'});
        await page.close();

        return html;

    }

    /**
     * Закрыть все соединения и браузер
     */
    async close() {

        // Закрываем инстанс
        if (this.Puppeteer !== null) {
            await this.Puppeteer.close();
        }

        // Закрываем SQL - закрывать не надо, т.к. соединение вынесено в общее
        // await this.SQL.disconnect();
        // this.SQL = null;

    }

    async LaunchBrowserInstance() {

        if (this.PuppeteerRunning === true) return;

        // Запускаем инстанс, если не запущен
        if (this.Puppeteer === null) {
            this.PuppeteerRunning = true;
            this.Puppeteer = await puppeteer.launch();
            this.PuppeteerRunning = false;
        }

    }

    GetDomainCookie(url) {
        let domain = URL.parse(url);
        return this.Cookies[domain.hostname] === undefined ? null : this.Cookies[domain.hostname];
    }

    /**
     * Установить кукисы для конкретного домена
     * @param items[]
     * @param url
     * @returns {null|*}
     * @constructor
     */
    SetDomainCookie(items, url) {
        let domain = URL.parse(url);
        this.Cookies[domain.hostname] = items.filter(res => res.domain.substr(1) === domain.hostname || res.domain === domain.hostname);
        return true;
    }

    async PassRecaptcha(url, method = 'audio', onlyFindKey = false, fromHTMLText = null) {

        try {

            // Запускаем инстанс, если не запущен
            await this.LaunchBrowserInstance();

            let page = await this.Puppeteer.newPage();
            if (fromHTMLText === null)
                await page.goto(url, {waitUntil: 'load'});
            else
                await page.setContent(fromHTMLText);

            await this.sleep(5000);

            let cookies = "";

            let frames = await page.frames();
            let frame = frames.find(res => res._url.includes('google.com/recaptcha/api2/anchor'));

            // Фрейм с капчей не найден
            if (!frame) return false;

            // Фрейм найден: если нужно только отдать ключ - отдаём
            if (onlyFindKey === true) {
                let key = await frame.evaluate(() => {
                    return document.location.search.match(/&k=(.*?)&/);
                });
                if(key===null) return null;
                return key[1];
            }

            // Перво-наперво кликаем по кнопке пройти
            await frame.evaluate(() => {
                return document.querySelectorAll(".recaptcha-checkbox")[0].click();
            });

            await this.sleep(5000);

            // Чекаем наличие капчи [может сработать авторедирект]
            frames = await page.frames();
            frame = frames.find(res => res._url.includes('google.com/recaptcha/api2/anchor'));

            await page.screenshot({path: 'buddy-screenshot.png'});

            if (frame !== undefined) {

                // Простой клик не сработал, фрейм с капчей всё ещё есть, ищем фрейм с расширенным окном с картинками
                frame = await page.frames().find(res => res._url.includes('google.com/recaptcha/api2/bframe'));

                if (!frame) throw "Не найдено окна с картинками";

                debugger;

            }

            cookies = await page.cookies();

            await page.close();

            this.SetDomainCookie(cookies, url);

            return cookies;

        } catch (ex) {
            console.log("Ошибка парса [spa]: " + ex.name + ": " + ex.message + "\r\n" + ex.stack);
            debugger;
        }

    }

}

module.exports = Parser;
