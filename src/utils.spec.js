var d3 = require("d3");
var utils = require("./utils");
var expect = require("chai").expect;

describe("utils", function () {
  describe("setScaleValue", function () {
    it("should replace a scale value correctly", function () {
      var scale = d3.scale.ordinal();
      scale.range([1, 2, 3]);
      scale.domain(["B", "A", "C"]);

      utils.setScaleValue(scale, "A", 200);

      expect(scale("A")).to.be.equal(200);
    });
  });
});
