# Web scraper for humans

Extended and fully async version of [scrape-it](https://github.com/IonicaBizau/scrape-it)

    npm install --save flamescraper

###### Features and usage
* Multiple pages parse per request
* Recursive subpage loading per each parameter with `subpage` field
* Pagination infinity loop, where `Next page` param detected and next page link is finded
* You can select for each page: use `Puppeteer` for SPA sites or default `web request`
* If Convert and How is a string => make functions
* Async `PageConvertor` callback after each page (in pagination) for bulk processing/save results, but with full control after each step
* Async `stopCallback` for stop scraping if results are right for you (for example you scraped next pages last time)
