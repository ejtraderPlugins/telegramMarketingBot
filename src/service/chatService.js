const config = require('../config');
var Promise = require('bluebird');
var telegramuserModel = require('../db/model/TelegramUserModel');
var telegramAPI = require('../telegramAPI').getInstance();
var Fuse = require('fuse.js');
var _ = require('lodash');

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
    } else {
        var choosenRule = null;
        _.forOwn(config.rules, function (value, key) {
            if(value.keywords && value.keywords.length > 0) {
                var fuzzy = fuzzySearch(value.keywords, self.opts.message);
                if(fuzzy) {
                    choosenRule = key;
                }
            }
        });
        if(choosenRule) {
            if(!self.context.language) {
                self.context.language = 'en';
            }
            self.context.askedRule = choosenRule;
            telegramuserModel.updateContext(self.opts.user.userId, self.context);
            return telegramAPI.sendMessage(config.rules[choosenRule].message[self.context.language], self.opts.user).then(function () {
                self.opts.message = null;
                self.gotoNextRule();
            });
        }
        return self.gotoNextRule();
    }


};

ChatService.prototype.gotoNextRule = function () {
    var self = this;

    var nextConditions = config.rules[self.context.askedRule].next;

    var nextCndMatch = fuzzySearch(_.keys(nextConditions), self.opts.message);
    var nextRule = null;
    if(!nextConditions) {
        return;
    }
    if(!self.opts.message && nextConditions['default']) {
        nextRule = nextConditions['default'];
    } else if (nextCndMatch) {
        nextRule = nextConditions[nextCndMatch];
    } else if(nextConditions['default']) {
        nextRule = nextConditions['default'];
    } else if(self.opts.message) {
        nextRule = self.context.askedRule;
    }
    if(nextRule) {
        self.context.askedRule = nextRule;
        telegramuserModel.updateContext(self.opts.user.userId, self.context);
        return telegramAPI.sendMessage(config.rules[nextRule].message[self.context.language], self.opts.user).then(function () {
            self.opts.message = null;
            self.gotoNextRule();
        });
    }
};

function fuzzySearch(keys, keyword) {
    if(!keyword) {
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

    if(results.length > 0) {
        return results[0].key;
    }
    return null;
}

module.exports.getInstance = function (opts) {
    return new ChatService(opts);
};