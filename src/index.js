const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const config = require('./config');

var chatService = require('./service/chatService');
var telegramUserModel = require('./db/model/TelegramUserModel');

var telegramAPI = require('./telegramAPI').getInstance();
var app = express();

app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.set('ipaddr', '0.0.0.0');
app.listen(config.port);

app.get('/status', function (req, res) {
    res.status(200).send("Running..");
});

app.post('/webhook', function (req, res) {
    var event = req.body;

    console.log("[Telegram] Received Event ::: ", JSON.stringify(event));

    var message = '';
    var senderId = '';
    var profileData = null;
    if (event.callback_query) {
        message = event.callback_query.data;
        senderId = "" + event.callback_query.from.id;
        profileData = event.callback_query.from;
    } else if (event.message) {
        message = event.message.text;
        senderId = "" + event.message.from.id;
        profileData = event.message.from;
    }

    return telegramUserModel.createUpdateUser({
        userId: senderId,
        profileData: profileData
    }).then(function (user) {
        if (!user) {
            return res.sendStatus(400);
        }

        chatService.getInstance({
            user: user,
            message: message,
            event: event
        }).run();

        return res.sendStatus(200);
    });
});

console.log("Bot Running on ", config.port);

telegramAPI.deregisterWebhook().then(function () {
    telegramAPI.registerWebhook();
});

