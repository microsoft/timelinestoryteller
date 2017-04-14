var addImage = require("./addImage");
var expect = require("chai").expect;
var d3 = require("d3");

describe("addImage", function () {
  beforeEach(function () {
    document.body.innerHTML = "<div class=\"timeline_storyteller\"><svg id=\"main_svg\"></svg></div>";
  });

  it("should generate a unique clip path for each image it draws", function () {
    var fakeVis = {
      tl_representation: function () {
        return "Radial";
      }
    };

    // Add two images, make sure they have different clip paths
    addImage(fakeVis, "about:blank", 10, 10, 10, 10, 0);
    addImage(fakeVis, "about:blank", 10, 10, 10, 10, 1);

    var ids = {};
    d3.selectAll(".image-clip-path").each(function () {
      ids[this.getAttribute("id")] = true;
    });
    expect(Object.keys(ids).length).to.be.equal(2);
  });
});
