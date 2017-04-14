var globals = require("./globals");

module.exports = {

  /**
   * Returns the next available z-index for an annotation
   * @returns {number} The next z-index
   */
  getNextZIndex: function () {
    var nextIndex = 0;
    (globals.annotation_list || [])
      .concat(globals.caption_list || [])
      .concat(globals.image_list || [])
      .forEach(function (item) {
        if (item.z_index >= nextIndex) {
          nextIndex = item.z_index + 1;
        }
      });
    return nextIndex;
  }
};
