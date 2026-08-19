const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  repoName: {
    type: String,
    required: true
  },
  prNumber: {
    type: Number,
    required: true
  },
  prTitle: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Summary', summarySchema);