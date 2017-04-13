var d3 = require("d3");
var globals = require("./globals");
var log = require("debug")("TimelineStoryteller:utils");
var _nextId = 0;

/**
 * Provides a set of utility functions
 */
module.exports = {

  /**
   * Creates a d3 selection with the correct parent selector
   * @param selector The selector to seelct
   */
  selectWithParent: function (selector) {
    return d3.select(".timeline_storyteller" + (selector ? " " + selector : ""));
  },

  /**
   * Creates a d3 selection with the correct parent selector
   * @param selector The selector to seelct
   */
  selectAllWithParent: function (selector) {
    return d3.selectAll(".timeline_storyteller" + (selector ? " " + selector : ""));
  },

  /**
   * A function which will return the next unique id within a session.
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
    return function (d, i, a) {
      var finalValue = arc.call(this, d, i, a);
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
  }

};
