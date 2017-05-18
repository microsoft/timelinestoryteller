/**
 * Forms the url for the given image name
 * @param {string} name The name of the image to get the url for
 * @returns {string} The final url for the given image
 */
function formUrl(name) {
  if (name.indexOf("demo") >= 0) {
    return "img/" + name;
  }

  var raw = require("../assets/img/" + name);
  var imageContents = toArrayBuffer(raw);
  var blob = new Blob([imageContents], {
    type: name.indexOf(".png") >= 0 ? "image/png" : "image/svg+xml"
  });
  return URL.createObjectURL(blob);
}

function toArrayBuffer(str) {
  var buffer = new ArrayBuffer(str.length);
  var array = new Uint8Array(buffer);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return buffer;
}

var imageUrlMapping = {
  "caption.png": formUrl("caption.png"),
  "categories.png": formUrl("categories.png"),
  "check.png": formUrl("check.png"),
  "clear.png": formUrl("clear.png"),
  "close.png": formUrl("close.png"),
  "csv.png": formUrl("csv.png"),
  "delete.png": formUrl("delete.png"),

  /**
   * Demo images
   */
  "demo.png": formUrl("demo.png"),
  "demo_story.png": formUrl("demo_story.png"),

  "draw.png": formUrl("draw.png"),
  "expand.png": formUrl("expand.png"),
  "export.png": formUrl("export.png"),
  "facets.png": formUrl("facets.png"),
  "filter.png": formUrl("filter.png"),
  "gdocs.png": formUrl("gdocs.png"),
  "gif.png": formUrl("gif.png"),
  "hide.png": formUrl("hide.png"),
  "highlight.png": formUrl("highlight.png"),
  "image.png": formUrl("image.png"),
  "info.png": formUrl("info.png"),
  "json.png": formUrl("json.png"),
  "l-fac.png": formUrl("l-fac.png"),
  "l-seg.png": formUrl("l-seg.png"),
  "l-uni.png": formUrl("l-uni.png"),
  "mail.png": formUrl("mail.png"),
  "min.png": formUrl("min.png"),
  "ms-logo.svg": formUrl("ms-logo.svg"),
  "next.png": formUrl("next.png"),
  "open.png": formUrl("open.png"),
  "pin.png": formUrl("pin.png"),
  "play.png": formUrl("play.png"),
  "png.png": formUrl("png.png"),
  "prev.png": formUrl("prev.png"),
  "q.png": formUrl("q.png"),
  "r-arb.png": formUrl("r-arb.png"),
  "r-cal.png": formUrl("r-cal.png"),
  "r-grid.png": formUrl("r-grid.png"),
  "r-lin.png": formUrl("r-lin.png"),
  "r-rad.png": formUrl("r-rad.png"),
  "r-spi.png": formUrl("r-spi.png"),
  "record.png": formUrl("record.png"),
  "reset.png": formUrl("reset.png"),
  "s-chron.png": formUrl("s-chron.png"),
  "s-intdur.png": formUrl("s-intdur.png"),
  "s-log.png": formUrl("s-log.png"),
  "s-rel.png": formUrl("s-rel.png"),
  "s-seq.png": formUrl("s-seq.png"),
  "segments.png": formUrl("segments.png"),
  "story.png": formUrl("story.png"),
  "svg.png": formUrl("svg.png"),
  "timeline.png": formUrl("timeline.png"),
  "vl.png": formUrl("vl.png")
};
module.exports = function (imageName) {
  return imageUrlMapping[imageName];
};
