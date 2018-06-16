const config = require('../config');
const request = require('request-promise');
var template = require('url-template');

function TelegramAPI() {
}

TelegramAPI.prototype.deregisterWebhook = function () {
    return request({
        method: 'GET',
        url: template.parse(config.API.deleteWebhook).expand({ token: config.credentials.apiToken })
    }).then(function (res) {
        console.log("Webhook Deleted", res);
        return Promise.resolve();
    }, function (err) {
        console.error(err.stack);
        return Promise.reject({error: 'Error in deleting webhook. ' + err});
    })
    .catch(function (err) {
        console.error(err.stack);
        return Promise.reject({error: 'Error in deleting webhook. ' + err});
    });
};

TelegramAPI.prototype.registerWebhook = function () {
    var payload = {
        url: config.host + config.API.webhookpath
    };

    var reqOptions = {
        method: 'POST',
        url: template.parse(config.API.addWebhook).expand({ token: config.credentials.apiToken }),
        json: payload
    };

    return request(reqOptions).then(function (res) {
        if (!res.ok) {
            return Promise.reject(res.description);
        }
        console.log("Webhook Configured", res);
        return Promise.resolve();
    }, function (err) {
        console.error(err.stack);
        return Promise.reject({error: 'Error in configuring webhook. ' + err});
    })
        .catch(function (err) {
            console.error(err.stack);
            return Promise.reject(err);
        });
};

TelegramAPI.prototype.sendMessage = function (message, userDetails) {
    var payload = message;
    payload.chat_id = userDetails.userId;

    var reqOptions = {
        method: 'POST',
        url: template.parse(config.API.sendMessage).expand({ token: config.credentials.apiToken }),
        json: payload
    };

    return request(reqOptions).then(function (res) {
        console.log("Message Sent");
        return Promise.resolve();
    }, function (err) {
        console.error(err.stack);
        return Promise.resolve(err);
    })
        .catch(function (err) {
            console.error(err);
            return Promise.resolve();
        });
};

module.exports.getInstance = function () {
    return new TelegramAPI();
};