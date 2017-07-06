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
   * Gets the highest id being used in the list of items
   * @param {{ id: number }[]} list The list of items to look through
   * @returns {number} The highest id
   */
  getHighestId: function (list) {
    let highestId = 0;
    (list || []).forEach(n => {
      if (n.id > highestId) {
        highestId = n.id;
      }
    });
    return highestId;
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
        return function () {
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
   * @returns {function} The debounced function
   */
  debounce: function (fn, delay) {
    var timeout;
    return function () {
      var args = Array.prototype.slice.call(arguments, 0);
      var that = this;
      clearTimeout(timeout);
      timeout = setTimeout(function () {
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
    if (obj === null || typeof obj !== "object") return obj;

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
        if (obj.hasOwnProperty(attr)) {
          copy[attr] = utils.clone(obj[attr]);
        }
      }
      return copy;
    }
  },

  /**
   * Sets the scale value for the given category
   * @param {d3.Scale} scale The scale to change
   * @param {string} category The category to change
   * @param {object} value The value to set the category to
   * @returns {void}
   */
  setScaleValue: function (scale, category, value) {
    var temp_palette = scale.range();
    var target = temp_palette.indexOf(scale(category));
    temp_palette[target] = value;
    scale.range(temp_palette);
  },

  /**
   * Adds a listener on a transition for when the transition is complete
   * @param {d3.Transition} transition The transition to listen for completion
   * @param {Function} callback The callback for when the transition is complete
   * @returns {void}
   */
  onTransitionComplete: function (transition) {
    // if (typeof callback !== "function") throw new Error("Wrong callback in onTransitionComplete");
    return new Promise((resolve) => {
      if (transition.size() === 0) {
        resolve();
      }
      var n = 0;
      transition
          .each(() => ++n)
          .each("end", () => {
            if (!--n) {
              resolve();
            }
          });
    });
  },

  /**
   * Converts a data url into a object url
   * @param {string} dataURL The data url to convert
   * @returns {string} The object url
   */
  dataURLtoObjectURL: function (dataURL) {
    // convert base64/URLEncoded data component to raw binary data held in a string
    const dataURLParts = dataURL.split(",");
    const byteString = dataURLParts[0].indexOf("base64") >= 0 ? atob(dataURLParts[1]) : decodeURIComponent(dataURLParts[1]);

    // separate out the mime component
    const type = dataURLParts[0].split(":")[1].split(";")[0];

    // write the bytes of the string to a typed array
    const ia = new Uint8Array(byteString.length);
    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }

    const blob = new Blob([ia], { type });
    return URL.createObjectURL(blob);
  },

  /**
   * Converts an image url to a data URL
   * @param {string} url The url of the image
   * @returns {Promise<string>} A dataurl containing the image
   */
  imageUrlToDataURL: function (url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    return new Promise((resolve, reject) => {
      img.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = this.width;
        canvas.height = this.height;

        // step 3, resize to final size
        ctx.drawImage(img, 0, 0);

        try {
          resolve(canvas.toDataURL());
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        reject();
      };
      img.src = url;
    });
  },

  /**
   * Resizes the given image to the given size
   * @param {string} url The url of the image
   * @param {number} width The final width of the image
   * @param {number} height The final height of the image
   * @param {boolean} [preserve=true] True if the aspect ratio should be preserved
   * @returns {Promise<string>} A dataurl containing the image
   */
  resizeImage: function (url, width, height, preserve) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    preserve = preserve === undefined ? true : preserve;

    return new Promise((resolve, reject) => {
      img.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // https://stackoverflow.com/questions/19262141/resize-image-with-javascript-canvas-smoothly
        // Perform the resize in two steps to produce a higher quality resized image

        // set size proportional to image if there is no height passed to it, otherwise just use the height
        if (preserve) {
          if (width >= height) {
            height = width * (img.height / img.width);
          } else {
            width = height * (img.width / img.height);
          }
        }

        canvas.width = width;
        canvas.height = height;

        // step 1 - resize to 50%
        const oc = document.createElement("canvas");
        const octx = oc.getContext("2d");

        oc.width = img.width * 0.5;
        oc.height = img.height * 0.5;
        octx.drawImage(img, 0, 0, oc.width, oc.height);

        // step 2 - resize 50% of step 1
        octx.drawImage(oc, 0, 0, oc.width * 0.5, oc.height * 0.5);

        // step 3, resize to final size
        ctx.drawImage(oc, 0, 0, oc.width * 0.5, oc.height * 0.5, 0, 0, width, height);

        try {
          resolve(canvas.toDataURL());
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () {
        reject();
      };
      img.src = url;
    });
  }
};

module.exports = utils;
