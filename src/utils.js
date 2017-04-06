var d3 = require("d3");
var globals = require("./globals");
var _nextId = 0;

/**
 * Provides a set of utility functions
 */
module.exports = {

    /**
     * Creates a d3 selection with the correct parent selector
     * @param selector The selector to seelct
     */
    selectWithParent: function(selector) {
        return d3.select(".timeline_storyteller" + (selector ? " " + selector : ""));
    },

    /**
     * Creates a d3 selection with the correct parent selector
     * @param selector The selector to seelct
     */
    selectAllWithParent: function(selector) {
        return d3.selectAll(".timeline_storyteller" + (selector ? " " + selector : ""));
    },

    /**
     * A function which will return the next unique id within a session.
     */
    nextId: function() {
        return _nextId++;
    },

    /**
     * Logs an event that occurred
     * @param {string} detail The detailed information for the event
     * @param {string} [category=annotation] The category of the event
     * @returns {void}
     */
    logEvent: function (detail, category) {
        console.log(detail);
        var log_event = {
            event_time: new Date().valueOf(),
            event_category: category || "annotation",
            event_detail: detail
        };
        globals.usage_log.push(log_event);
    }
};