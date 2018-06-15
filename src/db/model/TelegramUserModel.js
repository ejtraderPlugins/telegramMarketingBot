var Promise = require('bluebird');
var TelegramUser = require('../index').TelegramUser;

function createNew(user) {
    var newUser = new TelegramUser(user);

    return new Promise(function (resolve, reject) {
        newUser.save(function (err) {
            if (err) {
                reject(err);
            }

            TelegramUser.find({userId: user.userId}, function (err1, createdUser) {
                if(err1) {
                    reject(err1);
                }

                resolve(createdUser);
            });
        });
    });
}

function find(query) {
    return new Promise(function (resolve, reject) {
        TelegramUser.findOne(query, function (err, user) {
            if(err) {
                reject(err);
            }

            resolve(user);
        });
    });
}

function updateUserProfile(query, profileData) {
    return new Promise(function (resolve, reject) {
        TelegramUser.findOneAndUpdate(query, {
            $set: {
                profileData: profileData
            }
        }, function(err, updatedUser) {
            if (err) {
                reject(err);
            }
            resolve(updatedUser)
        });
    });
}

function createUpdateUser(data) {
    return find({userId: data.userId}).then(function (user) {
        if(user) {
            return updateUserProfile({userId: data.userId}, data.profileData);
        }
        return createNew(data);
    }).catch(function (reason) {
       return createNew(data);
    });
}

function updateContext(query, context) {
    return new Promise(function (resolve, reject) {
        TelegramUser.findOneAndUpdate(query, {
            $set: {
                context: context
            }
        }, function(err, updatedUser) {
            if (err) {
                reject(err);
            }
            resolve(updatedUser)
        });
    });
}

module.exports.createNew = createNew;
module.exports.find = find;
module.exports.createUpdateUser = createUpdateUser;
module.exports.updateContext = updateContext;