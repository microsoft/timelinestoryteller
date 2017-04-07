var TimelineStoryteller = require("./main");
var expect = require("chai").expect;
var testData = require("./testData");
var d3 = require("d3");

describe("TimelineStoryteller", function() {
    function createInstance() {
        var teller = new TimelineStoryteller(true, false);
        teller.setOptions({
            animation: false
        });
    }

    function flushAllD3Transitions() {
        var now = Date.now;
        Date.now = function() { return Infinity; };
        d3.timer.flush();
        Date.now = now;
    }

    beforeEach(function () {
        document.body.innerHTML = "";
    });

    it("loads", function() {
        expect(TimelineStoryteller).to.not.be.undefined;
    });
    describe("playback", function() {
        it("should draw annotations with the z-index in which they were created", function(done) {
            var teller = createInstance();
            teller.loadStory(JSON.stringify(testData), 0);
            flushAllD3Transitions();

            setTimeout(function() {
                flushAllD3Transitions();
                setTimeout(function() {
                    flushAllD3Transitions();
                    var annos = document.querySelectorAll(".event_annotation");
                // console.log("Text", d3.selectAll(".event_annotation").text());
                // console.log(document.body.innerHTML);
                    console.log("Annos: ", annos.length);
                    done();
                }, 10);
            }, 100);
        });
    });
});