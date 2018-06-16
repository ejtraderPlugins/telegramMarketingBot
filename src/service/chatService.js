const config = require('../config');
var Promise = require('bluebird');
var telegramuserModel = require('../db/model/TelegramUserModel');
var telegramAPI = require('../telegramAPI').getInstance();
var Fuse = require('fuse.js');
var _ = require('lodash');
const request = require('request-promise');
var template = require('url-template');

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
            config.rules.languageSelectionRead.message[language].text = 'Hi ' + self.opts.user.profileData.first_name + " "
                + self.opts.user.profileData.last_name + "! "
                + config.rules.languageSelectionRead.message[language].text;
            return telegramAPI.sendMessage(config.rules.languageSelectionRead.message[language], self.opts.user).then(function () {
                return self.gotoNextRule();
            });
        } else {
            return telegramAPI.sendMessage(config.rules.languageSelection.message, self.opts.user);
        }
    } else if (self.context.askedRule === 'walletAddress') {
        self.opts.user.profileData.walletAddress = self.opts.message;
        return telegramuserModel.createUpdateUser(self.opts.user).then(function () {
            return self.gotoNextRule();
        });
    } else if (self.context.askedRule === 'askedFacebook') {
        self.opts.user.profileData.facebookUserName = self.opts.message;
        return telegramuserModel.createUpdateUser(self.opts.user).then(function () {
            return self.gotoNextRule();
        });
    } else if (self.context.askedRule === 'askedTwitter') {
        self.opts.user.profileData.twitterUserName = self.opts.message;
        return telegramuserModel.createUpdateUser(self.opts.user).then(function () {
            return self.checkTwitterFollowers().then(function (success) {
                if (success) {

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
            telegramuserModel.updateContext(self.opts.user.userId, self.context);
            return telegramAPI.sendMessage(config.rules[choosenRule].message[self.context.language], self.opts.user);
        }
        return self.gotoNextRule();
    }


};

ChatService.prototype.askAgain = function () {
    var self = this;

    var message = _.clone(config.rules[self.context.askedRule].message[self.context.language]);
    message.text = config.messages.SORRY_FOLLOW[self.context.language] + "\n" + message.text;
    return telegramAPI.sendMessage(message, self.opts.user);
};

ChatService.prototype.gotoNextRule = function () {
    var self = this;

    var nextConditions = config.rules[self.context.askedRule].next;

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
        var message = config.rules[nextRule].message[self.context.language];
        if (nextRule === 'getReferral') {
            message.text = template.parse(message).expand({referral_link: ' https://t.me/MedipediaInviteBot?start=' + self.opts.user.userId});
        }
        return telegramAPI.sendMessage(message, self.opts.user).then(function () {
            self.opts.message = null;
            self.gotoNextRule();
        });
    }
};

ChatService.prototype.checkTwitterFollowers = function (cursor) {
    var self = this;
    if (!cursor) {
        cursor = -1;
    }
    var reqOptions = {
        url: config.twitter.get_followers_api + "?cursor=" + cursor,
        headers: {
          "Authorization": config.twitter.token
        },
        method: "get"
    };

    return request(reqOptions).then(function (res) {
        if (!res.users || res.users.length < 1) {
            return Promise.resolve(true);
        } else {
            var userFound = false;
            _.map(res.users, function (user) {
                if (user.screen_name.toLowerCase() === self.opts.message) {
                    userFound = true;
                    return false;
                }
            });
            if (userFound) {
                return Promise.resolve(true);
            } else if (res.next_cursor) {
                return self.checkTwitterFollowers(res.next_cursor);
            } else {
                return Promise.resolve(true);
            }
        }
    }, function (err) {
        console.error(err.stack);
        return Promise.resolve(true);
    })
        .catch(function (err) {
            console.error(err.stack);
            return Promise.resolve(true);
        });
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
        if(res.ok && res.result && res.result.user && res.result.user.id) {
            return Promise.resolve(true);
        }
        return Promise.resolve();
    }, function (err) {
        console.error(err.stack);
        return Promise.resolve();
    })
        .catch(function (err) {
            console.error(err.stack);
            return Promise.resolve();
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