var mongoose = require('mongoose');
var config = require('../config');

mongoose.connect(config.db.url);

var Schema = mongoose.Schema;

var telegramUserSchema = new Schema({
    userId: { type: String, required: true, unique: true },
    profileData: Schema.Types.Mixed,
    context: Schema.Types.Mixed,
    created_at: { type: Date, default: Date.now }
});

var TelegramUser = mongoose.model('TelegramUser', telegramUserSchema);

module.exports.TelegramUser = TelegramUser;