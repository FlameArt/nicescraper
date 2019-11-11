const WebSocketCore = require('websocket-core');


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
    
    this.WS.init = true;
    this.WS.Parser = this.Parser;
    this.WS.start(7777);
    
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
    
    // Парсим
    let data = await this.Parser.pagesParser(json, json.subpages);
    
    // Постраничный обход
    
    // Отправляем результат
    if(user!==undefined)
      user.WebSocket.send(JSON.stringify(data));
    
    return true;
    
  }
  
  loadUser(user) {
    user.WebSocket.send('{"type":"ok"}');
  }
  
}

module.exports=ParserTester;

// Запуск тестера отдельно
let start = new ParserTester();
start.start();