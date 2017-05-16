var TimelineStoryteller = require("./main");
var expect = require("chai").expect;
var sceneWithAnnotations = require("./spec/testData/singleSceneWithAnnotations.json");
var d3 = require("d3");

describe("TimelineStoryteller", function () {
  function createInstance() {
    var teller = new TimelineStoryteller(true, false);
    teller.setOptions({
      animations: false
    });
    return teller;
  }

  beforeEach(function () {
    document.body.innerHTML = "";
  });

  it("loads", function () {
    expect(TimelineStoryteller).to.not.be.undefined;
  });
  describe("playback", function () {
    it("should draw annotations with the z-index in which they were created", function (done) {
      var teller = createInstance();
      teller.loadStory(JSON.stringify(sceneWithAnnotations), 0);

      setTimeout(function () {
        var labels = [];
        d3.selectAll(".event_annotation .event_label").each(function () { labels.push(d3.select(this).text()); });

        // Remove all spaces, we only care if it is in the right order.
        labels = labels.map(function (label) {
          return label.replace(/\s*/g, "");
        });

        // The order in which we pull these from the DOM indicates their "z-index"
        expect(labels).to.be.deep.equal(["AritomoYamagata", "KinmochiSaionji", "TaroKatsura"]);

        done();
      }, 20);
    });
    it("should draw annotations with the correct position if scenes are switched quickly");
    it("should not draw annotations on the wrong scene");
  });
});