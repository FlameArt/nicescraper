import MySQLClass from "eznodemysql";
import puppeteer from 'puppeteer';


declare class Parser {
   constructor(SQL?: MySQLClass | null);

   /**
    * Подключение к БД, если нужно
    * @type {MySQLClass}
    */
   SQL: MySQLClass | null;

   /**
    * Единый инстанс пупетки
    * @type {null}
    */
   Puppeteer: puppeteer.Browser | null;

   /**
    * Запуск
    * @type {boolean}
    */
   PuppeteerRunning: boolean;

   /**
    * Куки всех доменов в пуле
    * @type {*[]}
    */
   Cookies: any[];

   /**
    * Парсинг
    * @param json
    * @param subpages
    * @param opts
    * @return {Promise<Object>}
    */
   parseOne(json: any, subpages: any, opts?: any): Promise<Object>;

   /**
    * Распарсить одну страницу
    * @param json
    * @param opts
    * @return {Promise<*>}
    */
   parsePage(json: any, opts?: any): Promise<any>;

   sleep(ms: number): Promise<void>;

   prepareParser(json: any): void;

   /**
    *
    * @param json входной массив
    * @param outdata выходной массив
    * @param subpages список подстраниц
    * @return {Promise<void>}
    */
   subpageLoad(outdata: any, json: any, subpages: any): Promise<void>;

   /**
    * Рекурсивно найти все элементы с заданным ключом
    * @param json
    * @param key
    */
   findItemsByKey(json: any, key: string, itemsArr?: any[]): any[];

   /**
    * Рекурсивно найти элемент с заданным ключом
    * @param json
    * @param key
    */
   findItemByKey(json: any, key: string): void;

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
   parse(json: any, opts?: any): Promise<object>;

   /**
    * Нормализуем параметры парсера, если каких-то из них нет
    * @param opts
    */
   normalizeOpts(opts: any): void;

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
   saveData(data: any, opts: any): void;

   getJSONFromDB(id: any): Promise<void>;

   // Загружаем базу одноразово вначале, чтобы не было перекрёстных соединений при одновременном запуске нескольких парсеров
   initDB(): Promise<void>;

   /**
    * Обойти защиту типа Клаудфлаера и получить кукисы
    * @param url
    * @param sleepMS
    */
   getCookiesFromBrowser(url: string, sleepMS?: number): Promise<void>;

   /**
    * Закрыть все соединения и браузер
    */
   close(): Promise<void>;

   LaunchBrowserInstance(): Promise<void>;

   GetDomainCookie(url: string): any;

   /**
    * Установить кукисы для конкретного домена
    * @param items[]
    * @param url
    * @returns {null|*}
    * @constructor
    */
   SetDomainCookie(items: any, url: string): any;

   PassRecaptcha(url: string, method?: string, onlyFindKey?: boolean, fromHTMLText?: any): Promise<void>;
}

export = Parser;
