const config = require('./config');
var Promise = require('bluebird');
var telegramuserModel = require('../db/model/TelegramUserModel');
var telegramAPI = require('./telegramAPI').getInstance();

function ChatService(opts) {
    this.opts = opts;
}

ChatService.prototype.run = function () {
    var self = this;
};

module.exports.getInstance = function (opts) {
    return new ChatService(opts);
};