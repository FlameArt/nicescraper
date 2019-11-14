
const parse = require('scrape-it');
const puppeteer = require('puppeteer');
const URL = require('url');

class Parser {
  
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
    if(subpages!==undefined && subpages.length>0)
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
  
    // Загружаем текст, если нужна полноценная загрузка SPA
    if (json.loadType === 'spa') {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(json.url, {waitUntil: 'load'});
      await this.sleep(opts.Pauses.SPA_AfterLoad);
      let html = await page.evaluate(() => {
        return document.querySelector('html').outerHTML
      });
      await browser.close();
    
      try {
        parsed = await parse.scrapeHTML(html, json.data);
      } catch (ex) {
        console.log("Ошибка парса [spa]: " + ex.name + ": " + ex.message + "\r\n" + ex.stack);
        debugger;
      }
    
    } else
      // Если надо спарсить статично
      try {
        parsed = (await parse(json.url, json.data)).data;
      } catch (ex) {
        console.log("Ошибка парса [static html]: " + ex.name + ": " + ex.message + "\r\n" + ex.stack);
        debugger;
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
          }
          else {
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
          }
          else {
            let func = json[key].how;
            if(func!=='html' && func!=='text') {
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
      
      }
      else if (typeof outdata[key] === 'object') {
        
        // Если это массив (список), то проходим по нему дальше
        if(outdata[key] instanceof Array) {
          if(json.hasOwnProperty(key)) {
            if(json[key].hasOwnProperty('listItem') && json[key].hasOwnProperty('data')) {
              await this.subpageLoad(outdata[key], json[key]['data'], subpages);
            }
          }
          else debugger;
        }
        
        // Простой объект со списком параметров
        else {
          
          // проходимся по каждому параметру, ищем подстраницы
          for (let nameKey in json) {
            if(json[nameKey].hasOwnProperty('subpage') && json[nameKey]['subpage']!=="") {
              
              // Подстраница найдена, ищем её в общем списке
              let sp = subpages.find(res=>res.name===json[nameKey]['subpage']);
              
              // Делаем проверки в массиве
              if(sp===null) {
                console.log("Не найдена подстраница с тегом #"+nameKey);
                continue;
              }
              
              // Проверяем корректность юрл
              let subPageURL = "";
              try {
                subPageURL = new URL.parse(outdata[key][nameKey]);
              } catch (ex) {
                console.log("Not valid URL for subpage #"+json[nameKey]['subpage']+ "; URL: " + outdata[key][nameKey]);
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
                outdata[key][outSubpageKey]=outSubpage[outSubpageKey];
              
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
    if(typeof json === 'object') {
      for (let tKey in json) {
        if(tKey===key) itemsArr.push(json[key]);
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
    if(typeof json === 'object') {
      for (let tKey in json) {
        if(tKey===key) return json[key];
        let returned = this.findItemByKey(json[tKey], key);
        if(returned !== null)
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
   * @param {Function} opts.stopCallback Коллбек, который проверяет, когда надо остановиться при парсе страниц
   * @param {Function} opts.pageErrorCallback Коллбек, который вызывается при любой ошибки парса основной страницы (не sub-страниц)
   * @param {Function} opts.pageIgnoreCallback Коллбек, который проверяет, какую страницу не надо парсить
   * @param {Function} opts.pageConverter Функция, которая конвертит страницу
   * @return {Promise<void>}
   */
  async parse(json, opts = {}) {
  
    // Нормализуем параметры и заполняем стандартными параметрами неизвестные
    opts = this.normalizeOpts(opts);
    
    // Не нужно указывать subpages, если они есть во входном массиве [так обычно и приходит]
    let subpages = [];
    if(json.hasOwnProperty('subpages'))
      subpages = json['subpages'];
    
    
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
      if(await opts.stopCallback(pagedata)) return pagedata;
  
      // Если след страницы нет - парсинг завершён: выходим
      if(nextpagelink==="" || nextpagelink===null) return pagedata;
      
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
  
    if(!opts.hasOwnProperty('Pauses')) opts['Pauses']={};
    if(!opts.Pauses.hasOwnProperty('Subpages')) opts.Pauses['Subpages']=0;
    if(!opts.Pauses.hasOwnProperty('Pagination')) opts.Pauses['Pagination']=0;
    if(!opts.Pauses.hasOwnProperty('SPA_AfterLoad')) opts.Pauses['SPA_AfterLoad']=2000;
    
    if(!opts.hasOwnProperty('Save')) opts['Save']={};
    if(!opts.Save.hasOwnProperty('toFile')) opts.Save['toFile']="";
    if(!opts.Save.hasOwnProperty('format')) opts.Save['format']="xlsx";
    if(!opts.Save.hasOwnProperty('saveAfter')) opts.Save['saveAfter']='EachPage';
    
    if(!opts.hasOwnProperty('stopCallback')) opts['stopCallback']=async function (parsedPage, parsedItem) {
      return false;
    };
    if(!opts.hasOwnProperty('pageIgnoreCallback')) opts['pageIgnoreCallback']=async function (parsedPage) {
      return false;
    };
    if(!opts.hasOwnProperty('pageConverter')) opts['pageConverter']=async function (parsedPage) {
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
    if(opts.Save.toFile==="") return;
    
  }
  
}

module.exports = Parser;