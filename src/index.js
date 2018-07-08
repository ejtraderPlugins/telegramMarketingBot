const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const config = require('./config');
var Promise = require('bluebird');
var chatService = require('./service/chatService');
var telegramUserModel = require('./db/model/TelegramUserModel');
var _ = require('lodash');

var telegramAPI = require('./telegramAPI').getInstance();
var app = express();

var REFERRAL_REGEX = /\/start\s(.*)/g;

var oauth = require('oauth');
var twitterConsumer = new oauth.OAuth(
    "https://twitter.com/oauth/request_token", "https://twitter.com/oauth/access_token",
    config.twitter.consumerKey, config.twitter.consumerSecret, "1.0A", config.host + "/sessions/callback", "HMAC-SHA1");

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

    if(!message) {
        return res.sendStatus(200);
    }

    var referredDataP = Promise.resolve();
    var match = REFERRAL_REGEX.exec(message);
    if(match && match.length > 1 && match[1] && (""+senderId !== match[1])) {
        message = "/start";
        referredDataP = telegramUserModel.find({userId: match[1]}).then(function (user) {
           if(user && user.profileData && !user.referredData) {
               return Promise.resolve({
                   id: match[1],
                   name: user.profileData.first_name + (user.profileData.last_name? (" " + user.profileData.last_name): "")
               });
           } else {
               return Promise.resolve();
           }
        });
    }

    return referredDataP.then(function(referredData){
        telegramUserModel.createUpdateUser({
            userId: senderId,
            profileData: profileData,
            referredData: referredData
        }).then(function (user) {
            if (!user) {
                return res.sendStatus(400);
            }
            if(Array.isArray(user)) {
                user = user[0];
            }
            chatService.getInstance({
                user: user,
                message: message,
                event: event
            }).run();

            return res.sendStatus(200);
        });
    });
});

console.log("Bot Running on ", config.port);

telegramAPI.deregisterWebhook().then(function () {
    telegramAPI.registerWebhook();
});

function getTwitterFollowers(cursor) {
    if (!cursor) {
        cursor = -1;
    }
    return new Promise(function (resolve, reject) {
        twitterConsumer.get("https://api.twitter.com/1.1/followers/list.json?cursor=" + cursor + "&count=200",
            config.twitter.accessToken, config.twitter.accessTokenSecret,
            function (error, data, response) {
                if (error) {
                    console.log(error.stack);
                    resolve()
                } else {
                    try {
                        data = JSON.parse(data);
                    } catch(e) {

                    }
                    resolve(data)
                }
            });
    });
}

function verifyTwitterUsers(cursor, users) {
    console.log("Verifying twitter users!!");
    return getTwitterFollowers(cursor).then(function (res) {
        if (!res || !res.users || res.users.length < 1) {
            return Promise.resolve();
        } else {
            _.map(res.users, function (twitterUser) {
                _.map(users, function (unverifiedUser) {
                    if (twitterUser.screen_name.toLowerCase() === unverifiedUser.user_data.twitterUserName.toLowerCase()) {
                        unverifiedUser.user_data.twitterVerifyStatus = 'verified';
                        telegramUserModel.updateUserData(unverifiedUser.userId, unverifiedUser.user_data);
                    }
                });
            });
        }
    }, function (err) {
        console.error(err.stack);
        return Promise.resolve();
    })
        .catch(function (err) {
            console.error(err.stack);
            return Promise.resolve();
        });
}

function getAndverifyTwitterUsers() {
    return telegramUserModel.getTwitterUnverifiedUsers().then(function (users) {
        if(users && users.length > 0) {
            return verifyTwitterUsers(null, users).then(function () {
                setTimeout(getAndverifyTwitterUsers, 900000);
            });
        }
    });
}

getAndverifyTwitterUsers();
setTimeout(getAndverifyTwitterUsers, 900000);
