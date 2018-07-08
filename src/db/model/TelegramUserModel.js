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


function findAll(query) {
    return new Promise(function (resolve, reject) {
        TelegramUser.find(query, function (err, user) {
            if(err) {
                reject(err);
            }

            resolve(user);
        });
    });
}

function updateUserProfile(query, profileData, referredData) {
    return new Promise(function (resolve, reject) {
        var updateSet = {
            $set: {
                profileData: profileData
            }
        };
        if(referredData) {
           updateSet.$set.referredData = referredData;
        }
        TelegramUser.findOneAndUpdate(query, updateSet, function(err, updatedUser) {
            if (err) {
                reject(err);
            }
            resolve(updatedUser)
        });
    });
}

function getTwitterUnverifiedUsers() {
    return findAll({'user_data.twitterVerifyStatus' : 'not-verified'}).then(function (users) {
        return Promise.resolve(users);
    }).catch(function (reason) {
        return;
    });
}

function createUpdateUser(data) {
    return find({userId: data.userId}).then(function (user) {
        if(user) {
            return updateUserProfile({userId: data.userId}, data.profileData, data.referredData);
        }
        return createNew(data);
    }).catch(function (reason) {
       return createNew(data);
    });
}

function updateContext(userId, context) {
    return new Promise(function (resolve, reject) {
        TelegramUser.findOneAndUpdate({userId: userId}, {
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

function updateUserData(userId, user_data) {
    return new Promise(function (resolve, reject) {
        TelegramUser.findOneAndUpdate({userId: userId}, {
            $set: {
                user_data: user_data
            }
        }, function(err, profiles) {
            if (err) {
                reject(err);
            }
            resolve(profiles)
        });
    });
}

module.exports.createNew = createNew;
module.exports.find = find;
module.exports.createUpdateUser = createUpdateUser;
module.exports.updateContext = updateContext;
module.exports.updateUserData = updateUserData;
module.exports.getTwitterUnverifiedUsers = getTwitterUnverifiedUsers;