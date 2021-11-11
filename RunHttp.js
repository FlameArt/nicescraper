const express = require('express')
const app = express()
const port = 3000

const Parser = new (require('./Parser'))();

app.get('/passRecaptcha/GetKey', async (req, res) => {
    let url = req.query.url ?? 'https://www.google.com/recaptcha/api2/demo';
    let key = await Parser.PassRecaptcha(url, 'audio', true)
    //res.send({url: url, key: key});
    res.send(key);
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})
