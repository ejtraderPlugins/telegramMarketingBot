const config = require('../config');
var Promise = require('bluebird');
var telegramuserModel = require('../db/model/TelegramUserModel');
var telegramAPI = require('../telegramAPI').getInstance();
var Fuse = require('fuse.js');
var _ = require('lodash');
const request = require('request-promise');
var format = require("string-template");
var template = require('url-template');

var EMAIL_REGEX = /[^@]+@[^\.]+\..+/g;

function ChatService(opts) {
    this.opts = opts;
}

ChatService.prototype.run = function () {
    var self = this;
    self.context = self.opts.user.context;
    var userId = self.opts.user.userId;
    if (!self.context) {
        self.context = {};
    }
    if(!self.opts.user.user_data) {
        self.opts.user.user_data = {}
    }

    var initialRuleSearch = fuzzySearch(config.rules.languageSelection.keywords, self.opts.message.toLowerCase());

    if (initialRuleSearch) {
        self.context = {};
        self.context.askedRule = 'languageSelection';
        telegramuserModel.updateContext(userId, self.context);
        return telegramAPI.sendMessage(config.rules.languageSelection.message, self.opts.user);
    } else if (self.context.askedRule === 'languageSelection') {
        var language = null;
        _.map(config.languages, function (langObj) {
            var res = fuzzySearch(langObj.keywords, self.opts.message);
            if (res) {
                language = langObj.key;
            }
        });
        if (language) {
            self.context.language = language;
            self.context.askedRule = 'languageSelectionRead';
            var message = _.cloneDeep(config.rules.languageSelectionRead.message);
            if(self.opts.user.referredData) {
                message = message[1][language];
            } else {
                message = message[0][language];
            }

            message.text = format(message.text, {
                username:  self.opts.user.profileData.first_name + (self.opts.user.profileData.last_name? (" " + self.opts.user.profileData.last_name): ""),
                referralname: self.opts.user.referredData? self.opts.user.referredData.name : null
            });

            return telegramAPI.sendMessage(message, self.opts.user).then(function () {
                return self.gotoNextRule();
            });
        } else {
            return telegramAPI.sendMessage(config.rules.languageSelection.message, self.opts.user);
        }
    } else if (self.context.askedRule === 'emailAddress') {
        if(EMAIL_REGEX.test(self.opts.message)) {
            self.opts.user.user_data.email = self.opts.message;
            return telegramuserModel.updateUserData(self.opts.user.userId, self.opts.user.user_data).then(function () {
                self.opts.message = "success";
                return self.gotoNextRule();
            });
        } else {
            return self.askAgain(true);
        }
    } else if (self.context.askedRule === 'walletAddress') {
        self.opts.user.user_data.walletAddress = self.opts.message;
        return telegramuserModel.updateUserData(self.opts.user.userId, self.opts.user.user_data).then(function () {
            self.opts.message = "success";
            return self.gotoNextRule();
        });
    } else if (self.context.askedRule === 'askedFacebook') {
        self.opts.user.user_data.facebookUserName = self.opts.message;
        return telegramuserModel.updateUserData(self.opts.user.userId, self.opts.user.user_data).then(function () {
            self.opts.message = 'success';
            return self.gotoNextRule();
        });
    } else if (self.context.askedRule === 'askedMedipediaSite') {
        self.opts.user.user_data.medipediaSiteUsername = self.opts.message;
        return telegramuserModel.updateUserData(self.opts.user.userId, self.opts.user.user_data).then(function () {
            self.opts.message = 'success';
            return self.gotoNextRule();
        });
    } else if (self.context.askedRule === 'askedTwitter') {
        self.opts.user.user_data.twitterUserName = self.opts.message;
        self.opts.user.user_data.twitterVerifyStatus = 'not-verified';
        return telegramuserModel.updateUserData(self.opts.user.userId, self.opts.user.user_data).then(function () {
            return self.checkTwitterFollowers().then(function (success) {
                if (success) {
                    return self.gotoNextRule();
                } else {
                    return self.askAgain();
                }
            });
        });
    } else if (self.context.askedRule === 'joinTelegramGroup') {
        return telegramuserModel.createUpdateUser(self.opts.user).then(function () {
            return self.checkTelegramGroup().then(function (success) {
                if (success) {
                    return self.gotoNextRule();
                } else {
                    return self.askAgain();
                }
            });
        });
    } else {
        var choosenRule = null;
        _.forOwn(config.rules, function (value, key) {
            if (value.keywords && value.keywords.length > 0) {
                var fuzzy = fuzzySearch(value.keywords, self.opts.message);
                if (fuzzy) {
                    choosenRule = key;
                }
            }
        });
        if (choosenRule) {
            if (!self.context.language) {
                self.context.language = 'en';
            }
            self.context.askedRule = choosenRule;
            var message = _.cloneDeep(config.rules[choosenRule].message[self.context.language]);
            if (choosenRule === 'getReferral') {
                message.text = message.text.replace(/{referral_link}/g,config.referralLinkPrefix + self.opts.user.userId);
            }
            message.text = format(message.text, {
                username: self.opts.user.profileData.first_name + (self.opts.user.profileData.last_name? (" " + self.opts.user.profileData.last_name): ""),
                amount: self.opts.user.referredData? "500": "400"
            });
            telegramuserModel.updateContext(self.opts.user.userId, self.context);
            return telegramAPI.sendMessage(message, self.opts.user);
        }
        return self.gotoNextRule();
    }


};

ChatService.prototype.askAgain = function (invalidValue) {
    var self = this;

    var message = _.clone(config.rules[self.context.askedRule].message[self.context.language]);
    message.text = (invalidValue? config.messages.INVALID_VALUE[self.context.language]: config.messages.SORRY_FOLLOW[self.context.language])
        + "\n" + message.text;
    return telegramAPI.sendMessage(message, self.opts.user);
};

ChatService.prototype.gotoNextRule = function () {
    var self = this;

    if(!config.rules[self.context.askedRule]) {
        return telegramAPI.sendMessage({
            "text": "Sorry I don't know that! Please use /start to start the campaign.", "parse_mode": "HTML"
        }, self.opts.user);
    }

    var nextConditions = config.rules[self.context.askedRule].next;

    if(!nextConditions) {
        return telegramAPI.sendMessage({"text": config.messages.END_OF_CAMPAIGN[self.context.language], "parse_mode": "HTML"}, self.opts.user);
    }

    var nextCndMatch = fuzzySearch(_.keys(nextConditions), self.opts.message);
    var nextRule = null;
    if (!nextConditions) {
        return;
    }
    if (!self.opts.message && nextConditions['default']) {
        nextRule = nextConditions['default'];
    } else if (nextCndMatch) {
        nextRule = nextConditions[nextCndMatch];
    } else if (nextConditions['default']) {
        nextRule = nextConditions['default'];
    } else if (self.opts.message) {
        nextRule = self.context.askedRule;
    }
    if (nextRule) {
        self.context.askedRule = nextRule;
        telegramuserModel.updateContext(self.opts.user.userId, self.context);
        var message = _.cloneDeep(config.rules[nextRule].message[self.context.language]);
        if (nextRule === 'getReferral') {
            message.text = message.text.replace(/{referral_link}/g,config.referralLinkPrefix + self.opts.user.userId);
        }
        message.text = format(message.text, {
            username: self.opts.user.profileData.first_name + (self.opts.user.profileData.last_name? (" " + self.opts.user.profileData.last_name): ""),
            amount: self.opts.user.referredData? "500": "400"
        });
        return telegramAPI.sendMessage(message, self.opts.user).then(function () {
            self.opts.message = null;
            self.gotoNextRule();
        });
    }
};

ChatService.prototype.checkTwitterFollowers = function (cursor) {
    var self = this;
    self.opts.message = 'success';
    return Promise.resolve(true);
};

ChatService.prototype.checkTelegramGroup = function () {
    var self = this;
    var reqOptions = {
        method: 'GET',
        url: template.parse(config.API.getChatMember).expand({
            token: config.credentials.apiToken,
            groupId: config.credentials.groupId,
            userId: self.opts.user.userId
        })
    };

    return request(reqOptions).then(function (res) {
        try {
            res = JSON.parse(res);
        } catch(e) {
        }
        if(res.ok && res.result && res.result.user && res.result.user.id && res.result.status !== 'left') {
            return Promise.resolve(true);
        }
        return Promise.resolve(true);
    }, function (err) {
        console.error(err.stack);
        return Promise.resolve(true);
    })
        .catch(function (err) {
            console.error(err.stack);
            return Promise.resolve(true);
        });
};

function fuzzySearch(keys, keyword) {
    if (!keyword) {
        return;
    }
    var fuseOptions = {
        shouldSort: true,
        threshold: 0.4,
        location: 0,
        distance: 100,
        maxPatternLength: 32,
        minMatchCharLength: 1,
        keys: [
            "key"
        ]
    };
    keyword = keyword.toLowerCase();
    var keyObjs = [];
    _.map(keys, function (key) {
        keyObjs.push({
            key: key
        });
    });

    var results = new Fuse(keyObjs, fuseOptions).search(keyword);

    if (results.length > 0) {
        return results[0].key;
    }
    return null;
}

module.exports.getInstance = function (opts) {
    return new ChatService(opts);
};