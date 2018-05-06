var mongoose = require('mongoose');

var model = mongoose.model('user', new mongoose.Schema({
  username: {
    type: String,
    unique: true
  },
  password: {
    type: String
  },
  name: {
    type: String
  },
  avatar: {
    type: String
  },
  salt: {
    type: String
  }
}));

exports.getModel = function() {
  return model;
}
