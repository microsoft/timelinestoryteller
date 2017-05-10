var d3 = require("d3");
var globals = require("./globals");
var log = require("debug")("TimelineStoryteller:utils");
var _nextId = 0;

/**
 * Provides a set of utility functions
 */
var utils = {

  /**
   * Creates a d3 selection with the correct parent selector
   * @param {d3.Selection} selector The selector to select
   * @returns {d3.Selection} d3 selection bound to the parent
   */
  selectWithParent: function (selector) {
    return d3.select(".timeline_storyteller" + (selector ? " " + selector : ""));
  },

  /**
   * Creates a d3 selection with the correct parent selector
   * @param {d3.Selection} selector The selector to select
   * @returns {d3.Selection} d3 selection bound to the parent
   */
  selectAllWithParent: function (selector) {
    return d3.selectAll(".timeline_storyteller" + (selector ? " " + selector : ""));
  },

  /**
   * A function which will return the next unique id within a session.
   * @returns {number} The next unique id
   */
  nextId: function () {
    return _nextId++;
  },

  /**
   * Logs an event that occurred
   * @param {string} detail The detailed information for the event
   * @param {string} [category=annotation] The category of the event
   * @returns {void}
   */
  logEvent: function (detail, category) {
    log(detail);
    var log_event = {
      event_time: new Date().valueOf(),
      event_category: category || "annotation",
      event_detail: detail
    };
    globals.usage_log.push(log_event);
  },
  /**
   * Creates a tweening function for an arc
   * @param {d3.svg.arc} arc The arc to create the tweening function for
   * @returns {function} A tweening function.
   */
  arcTween: function (arc) {
    var cmdRegEx = /[mlhvcsqtaz][^mlhvcsqtaz]*/ig;

    // The gist is, basically if we are just transitioning between two states, then we
    // update the arc flags to match between the start and end states so the interpolate function doesn't try to interpolate the flags
    // problem being, if it interpolates the flags, sometimes it can generate values that aren't 0 or 1, but like .2398
    return function (d, idx, a) {
      var finalValue = arc.call(this, d, idx, a);
      var finalMatches = (finalValue).match(cmdRegEx) || [];
      var initialMatches = (d3.select(this).attr("d") || "").match(cmdRegEx) || [];
      if (finalMatches.length === initialMatches.length) {
        for (var i = 0; i < finalMatches.length; i++) {
          var finalMatch = finalMatches[i];
          var startMatch = initialMatches[i];
          var command = finalMatch[0];
          // We've got an arc command
          if ((command === "A" || command === "a") && finalMatch[i] === startMatch[i]) {
            var finalParts = finalMatch.substring(1).split(/[\s\,]/);
            var startParts = startMatch.substring(1).split(/[\s\,]/);

            // Large arc flag
            startParts[3] = finalParts[3];

            // sweep flag
            startParts[4] = finalParts[4];

            initialMatches[i] = command + startParts.join(" ");
            finalMatches[i] = command + finalParts.join(" ");
          }
        }
      } else {
        return function (t) {
          return finalValue;
        };
      }
      return d3.interpolate(initialMatches.join(""), finalMatches.join(""));
    };
  },

  /**
   * Creates a debounced function
   * @param {function} fn The function to debounce
   * @param {number} [delay=100] The debounce delay
   */
  debounce: function (fn, delay) {
    var timeout;
    return function (){
      var args = Array.prototype.slice.call(arguments, 0);
      var that = this;
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        fn.apply(that, args);
      }, delay || 500);
    };
  },

  /**
   * Provides a very basic deep clone of an object, functions get directly copied over
   * @param {Object} obj The object to clone
   * @returns {Object} The clone
   */
  clone: function (obj) {
    var copy;

    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
            copy[i] = utils.clone(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = utils.clone(obj[attr]);
        }
        return copy;
    }
  },

  /**
   * Sets the scale value for the given category
   * @param {d3.Scale} scale The scale to change
   * @param {string} category The category to change
   * @param {object} value The value to set the category to
   */
  setScaleValue: function (scale, category, value) {
    var temp_palette = scale.range();
    var target = temp_palette.indexOf(category);
    temp_palette[target] = value;
    scale.range(temp_palette);
  }
};

module.exports = utils;