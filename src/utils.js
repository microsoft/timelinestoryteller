var d3 = require("d3");
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
    }
};