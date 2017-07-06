var TimelineStoryteller = require("./main");
var expect = require("chai").expect;
var sceneWithAnnotations = require("./spec/testData/singleSceneWithAnnotations.js");
var simpleJsonData = require("./spec/testData/simpleJsonData.js");
var d3 = require("d3");
var globals = require("./globals");

const performClick = (node) => {
  let me = document.createEvent("MouseEvent");
  me.initMouseEvent("click", true, true, window, 0,
  10,
  10,
  10,
  10,
  false, false, false, false, 1, node);
  node.dispatchEvent(me);
};

/**
 * Performs a drag operation on the given node
 * @param {HTMLElement} node The node to drag
 * @param {number} finalX The final X position
 * @param {number} finalY The final Y position
 * @returns {void}
 */
const performDrag = (node, finalX, finalY) => {
  let me = document.createEvent("MouseEvent");
  me.initMouseEvent("mousedown", true, true, window, 0,
  10,
  10,
  10,
  10,
  false, false, false, false, 1, node);
  node.dispatchEvent(me);

  me = document.createEvent("MouseEvent");
  me.initMouseEvent("mousemove", true, true, window, 0,
  finalX,
  finalY,
  finalX,
  finalY,
  false, false, false, false, 1, node);
  window.dispatchEvent(me);

  me = document.createEvent("MouseEvent");
  me.initMouseEvent("mouseup", true, true, window, 0,
  finalX,
  finalY,
  finalX,
  finalY,
  false, false, false, false, 1, node);
  window.dispatchEvent(me);
};

function getAnnotationPosition(parentEle, annotationIdx) {
  const annotationsSel = d3.select(parentEle).selectAll(".annotation_drag_area");
  const annotationEle = annotationsSel[0][annotationIdx];
  return [annotationEle.getAttribute("x"), annotationEle.getAttribute("y")];
}

function dragAnnotation(parentEle, idx, x, y) {
  // Drag the annotation somewhere
  let annotationsSel = d3.select(parentEle).selectAll(".annotation_drag_area");
  let annotationEle = annotationsSel[0][idx];
  performDrag(annotationEle, x, y);

// Store the position of the annotation after the first drag for use in making sure it restores the correct location later
  return [annotationEle.getAttribute("x"), annotationEle.getAttribute("y")];
}

function addAnnotationAndDrag(parentEle, eventItemElement, x, y) {
// Click on an event to show the annnotation
  performClick(eventItemElement);

  return dragAnnotation(parentEle, 0, x, y);
}

function recordScene(parentEle) {
  const parentSel = d3.select(parentEle);
  const recordSceneBtn = parentSel.select("#record_scene_btn");

  // Record scene
  performClick(recordSceneBtn[0][0]);
}

function nextScene(parentEle) {
  const parentSel = d3.select(parentEle);

  // Go back a scene so we can verify that the position is restored for the first scenes annotation
  performClick(parentSel.select("#next_scene_btn")[0][0]);
}

function prevScene(parentEle) {
  const parentSel = d3.select(parentEle);

  // Go back a scene so we can verify that the position is restored for the first scenes annotation
  performClick(parentSel.select("#prev_scene_btn")[0][0]);
}

describe("TimelineStoryteller", function () {
  var parentEle;
  beforeEach(() => {
    parentEle = document.createElement("div");
    document.body.appendChild(parentEle);

    // Across instances of timeline, the global state is shared
    globals.reset();
  });
  afterEach(() => {
    document.body.removeChild(parentEle);
    globals.reset();
  });

  function createInstance() {
    var teller = new TimelineStoryteller(true, false, parentEle);
    teller.setOptions({
      animations: false
    });
    return teller;
  }

  function createAndLoadWithAnnotations() {
    const instance = createInstance();
    const loadPromise = instance.load(sceneWithAnnotations(), true, true, 0);
    return {
      instance,
      loadPromise
    };
  }

  function createAndLoad() {
    const instance = createInstance();
    const loadPromise = instance.load(simpleJsonData(), false, true, 0);
    return {
      instance,
      loadPromise
    };
  }

  it("loads", function () {
    expect(TimelineStoryteller).to.not.be.undefined;
  });
  describe("playback", function () {
    it("should draw annotations with the z-index in which they were created", function () {
      const { loadPromise } = createAndLoadWithAnnotations();
      return loadPromise.then(function () {
        var labels = [];
        d3.selectAll(".event_annotation .event_label").each(function () { labels.push(d3.select(this).text()); });

        // Remove all spaces, we only care if it is in the right order.
        labels = labels.map(function (label) {
          return label.replace(/\s*/g, "");
        });

        // The order in which we pull these from the DOM indicates their "z-index"
        expect(labels).to.be.deep.equal(["AritomoYamagata", "KinmochiSaionji", "TaroKatsura"]);
      });
    });
    it("should draw annotations with the correct position if scenes are switched quickly");
    it("should not draw annotations on the wrong scene");
    it("should import and preprocess demo_json correctly");
    it("should import and preprocess json correctly");
    it("should import and preprocess json_parsed correctly");
    it("should import and preprocess csv correctly");
    it("should import and preprocess gdoc correctly");
    it("should allow for the configuration of the import data menu options");
    it("should hide the load data section if there are no data menu options");
    it("should allow for the configuration of the import data story options");
    it("should hide the load data section if there are no data story options");
    it("should import and preprocess data from given story correctly");
    it("should show the frame popup in the correct position");
    it("should show the frame popup on the screen, it should not overflow off the screen when the component is small");
    it("should properly parse dates from 270000 BC up to 270000 AD");
  });

  describe("recording", function () {
    it("should only create one annotation when an event is clicked on", function () {
      const { loadPromise } = createAndLoad();
      return loadPromise.then(() => {
        // The 3rd event item is arbitrary, just need something to click
        const eventItemElement = d3.select(parentEle).selectAll(".timeline_event_g")[0][3];

        // Click on an event to show the annnotation
        performClick(eventItemElement);

        let annotations = d3.selectAll(".event_annotation");

        // There should only be 1 annotations, since it is the only thing we clicked on
        expect(annotations[0].length).to.be.equal(1);
      });
    });
    it("should remove an annotation when the same event is clicked twice", function () {
      const { loadPromise } = createAndLoad();
      return loadPromise.then(() => {
        // The 3rd event item is arbitrary, just need something to click
        const eventItemElement = d3.select(parentEle).selectAll(".timeline_event_g")[0][3];

        // Click on an event to show the annnotation
        performClick(eventItemElement);

        // Click a second time to make sure it is removed
        performClick(eventItemElement);

        let annotations = d3.selectAll(".event_annotation");
        expect(annotations[0].length).to.be.equal(0);
      });
    });
    describe("annotations on the same event in two scenes will not interact with each other", function () {
      it("should not move the first annotation if the second one is moved", function (done) {
        const { loadPromise } = createAndLoad();
        loadPromise.then(() => {
          const parentSel = d3.select(parentEle);
          // The first event item is arbitrary, just need something to click
          const eventItemElement = parentSel.selectAll(".timeline_event_g")[0][0];

          // Add the annotation and drag it to 0, 0, and save the final position to make sure it is restored correctly
          const sceneOneAnnotationPosition = addAnnotationAndDrag(parentEle, eventItemElement, 0, 0);

          // Record the scene
          recordScene(parentEle);

          // Add the same event annotation and drag it somewhere else
          const sceneTwoAnnotationPosition = dragAnnotation(parentEle, 0, 100, 100);

          // Record the scene
          recordScene(parentEle);

          // Go back to the first scene
          prevScene(parentEle);

          // Give the annotations some time to re-render
          setTimeout(() => {
            // Make sure the first scenes position is correct
            let annotationPosition = getAnnotationPosition(parentEle, 0);
            expect(annotationPosition).to.be.deep.equal(sceneOneAnnotationPosition);

            // Go back to the next scene to make sure the annotation position is correct
            nextScene(parentEle);

            annotationPosition = getAnnotationPosition(parentEle, 0);
            expect(annotationPosition).to.be.deep.equal(sceneTwoAnnotationPosition);

            done();
          }, 500);
        });
      });
    });
  });
});
