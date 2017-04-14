// Include the flexi-color-picker css
require("../assets/css/lib/colorpicker.css");

// Include the color picker js
require("./lib/colorpicker");
var colorPicker = window.ColorPicker;

/**
 * Creates a color picker popup
 * @param {HTMLElement} parentElement The parent element.
 * @returns {Object} The color picker popup instance
 */
module.exports = function (parentElement) {
  /* eslint-disable */
  var element = document.createElement("div");
  element.className = "color-picker-popup";
  element.innerHTML =
    '<div class="cp-small"></div>' +
    '<div style="clear:both">' +
      '<button class="color-picker-cancel">Cancel</button>' +
      '<button class="color-picker-ok" style="margin:5px 5px 2px 0px;">OK</button>'
    '</div>';
  /* eslint-enable */

  element.style.cssText = "text-align:right;border:1px solid #ccc;display:none;position:absolute;outline:none;z-index:10000000;background-color:white";
  parentElement.appendChild(element);

  // The currently selected color
  var selectedColor;
  var listener;

  // Our color picker
  var cp = colorPicker(element.querySelector(".cp-small"), function (hex) {
    selectedColor = hex;
  });

  element.querySelector(".color-picker-ok").addEventListener("click", function () {
    me.hide();
    if (listener) {
      listener(selectedColor);
    }
  });

  element.querySelector(".color-picker-cancel").addEventListener("click", function () {
    me.hide();
  });

  var me = {

    /**
     * Shows the color picker
     * @param {HTMLElement} relativeTo The element to show the color picker relative to
     * @param {string} color The starting color for the color picker
     * @param {Function} onChanged The function which will be called when a color is picked.
     * @returns {void}
     */
    show: function (relativeTo, color, onChanged) {
      selectedColor = color;

      cp.setHex(color);
      listener = onChanged;

      element.style.display = "block";

      var rect = relativeTo.getBoundingClientRect();
      element.style.left = rect.right + "px";
      element.style.top = rect.bottom + "px";
    },

    /**
     * Hides the color picker
     * @returns {void}
     */
    hide: function () {
      element.style.display = "none";
    }
  };
  return me;
};
