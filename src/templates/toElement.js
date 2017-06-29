/**
 * Creates an html element from the given html
 * @param {string} html The html for the element
 * @returns {HTMLElement} The element that was created from the html
 */
module.exports = function (html) {
  var tmpEle = document.createElement("div");
  tmpEle.innerHTML = html.trim().replace(/\n/g, "");
  return tmpEle.firstChild;
};
