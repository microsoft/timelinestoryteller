var TimelineStoryteller = require("./main");
var utils = require("./utils");
var imageUrls = require("./imageUrls");

// Expose the utils as well
TimelineStoryteller.utils = utils;
TimelineStoryteller.images = imageUrls;

module.exports = TimelineStoryteller;
