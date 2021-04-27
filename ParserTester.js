const WebSocketCore = require('websocketcore');
const SQL = new (require('eznodemysql'));
const fs = require('fs');
const url = require('url');

class ParserTester {

    constructor() {

        /**
         * Коннект по сокету
         * @type {WS}
         */
        this.WS = new WS();

        /**
         *
         * @type {Parser}
         */
        this.Parser = new (require('./Parser'));

    }

    async start() {

        let that = this;

        // Парсим конфиг
        this.config = fs.existsSync("configParsers.json") ? JSON.parse(fs.readFileSync('configParsers.json', 'utf8')) : null;

        if (this.config !== null) {
            await SQL.connect(that.config.mysql.host, that.config.mysql.port, that.config.mysql.login, that.config.mysql.password, that.config.mysql.db);
        }

        //let data = await that.Parser.parse(1, {PagesLimit: 1});

        this.WS.init = true;
        this.WS.Parser = this.Parser;
        this.WS.start(7777);

        await that.Parser.parsePage({
            loadType: 'cookies',
            url: 'https://freelancehunt.com/projects',
            SPA_AfterLoad: 5000
        },
            {
                Pauses: {SPA_AfterLoad: 5000}
            });

    }

}

class WS extends WebSocketCore {

    constructor(props) {

        super(props);

        /**
         * @type {Parser}
         */
        this.Parser = null;

    }


    /**
     *
     * @param json
     * @param user
     * @param txtdata
     * @return {Promise<boolean>}
     */
    async getMessage(json, user, txtdata) {

        let that = this;

        switch (json.type) {
            case 'getDomain':

                // Получаем чистый домен второго уровня
                let domain = that.getDomainFromURL(json.value);
                let info = await SQL.selectAll("parsers", "domain=?", [domain]);
                user.WebSocket.send(JSON.stringify({type: "domaindata", data: info}));

                break;
            case 'saveData':
            case 'SaveAndClose': {

                // привязываем домен
                json.data.domain = that.getDomainFromURL(json.data.url);

                // ищем связанные с сайтом подстраницы домена в базе
                //json.data.subpages = await SQL.selectAll("parsers", 'domain = ? AND name!="" AND id!=?', [json.data.domain, json.data.id]);

                let updated = await SQL.BulkUpdate("parsers", [json.data]);

                let thatItem = await SQL.get("parsers", "domain = ? AND url = ?", [json.data.domain, json.data.url]);

                if (json.type === 'SaveAndClose')
                    user.WebSocket.send(JSON.stringify({type: "close", data: thatItem}));
                else
                    user.WebSocket.send(JSON.stringify({type: "saved", data: thatItem}));

                break;
            }
            case 'getSite': {

                json.domain = that.getDomainFromURL(json.url);

                // Тут нужно выискивать по регекспу юрл вместо точного совпадения
                let domainItems = await SQL.selectAll("parsers", "domain = ?", [json.domain]);

                // ищем по регекспам
                let findedID = null;
                for (let item of domainItems) {

                    // Если тут нет регекспа, то поиск по точному совпадению
                    if(item.url.indexOf("--")===-1) {
                        if (item.url === json.url) {
                            findedID = item.id;
                            break;
                        }
                        continue;
                    }

                    // Регексп есть - сравниваем

                    // фиксим все спец-символы
                    let tRegex = item.url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

                    // Делаем замены шаблонов
                    tRegex = tRegex.replace(/--any--/g, "(.*?)");

                    if(json.url.match(new RegExp(tRegex))) {
                        findedID = item.id;
                        break;
                    }

                }

                let thatItem = await SQL.get("parsers", "id = ?", [findedID]);

                user.WebSocket.send(JSON.stringify({type: "info", data: thatItem}));

                break;
            }

            case 'parse':

                let domainx = that.getDomainFromURL(json.current_url);

                // ищем связанные с сайтом подстраницы домена в базе
                json.subpages = await SQL.selectAll("parsers", 'domain = ? AND name!=""', [domainx]);

                // тестовый парс берёт ссылку отсюда, а не из url, в котором регулярка
                json.url = json.current_url;

                // Парсим
                let data = await this.Parser.parse(json, {PagesLimit: 1});

                // Отправляем результат
                if (user !== undefined)
                    user.WebSocket.send(JSON.stringify(data));

                break;

        }

    }

    getDomainFromURL(thisUrl) {
        let domain = (url.parse(thisUrl)).hostname;
        if (domain.split(".").length > 1) {
            let domainspl = domain.split(".");
            domain = domainspl[domainspl.length - 2] + "." + domainspl[domainspl.length - 1];
        }
        return domain;
    }

    loadUser(user) {
        user.WebSocket.send('{"type":"ok"}');
    }

}

module.exports = ParserTester;

// Запуск тестера отдельно
let start = new ParserTester();
start.start();
