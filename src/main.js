    /**
 * Styles
 */
require("../assets/css/style.css");

/**
 * Libraries
 */
var d3 = require("d3");
var moment = require("moment");
var introJsLib = require("intro.js");
var introJs = typeof introJsLib === "function" ? introJsLib : introJsLib.introJs;

var configurableTL = require("./configurableTL");
var addCaption = require("./addCaption");
var addImage = require("./addImage");
var annotateEvent = require("./annotateEvent");
var colorSchemes = require("./colors");
var time = require("./lib/time.min");
var GIF = require("./lib/gif").GIF;
var gsheets = require("./lib/gsheets.min");
var svgImageUtils = require("./lib/saveSvgAsPng");
var imageUrls = require("./imageUrls");
var utils = require("./utils");
var selectWithParent = utils.selectWithParent;
var selectAllWithParent = utils.selectAllWithParent;
var setScaleValue = utils.setScaleValue;
var clone = utils.clone;
var debounce = utils.debounce;
var logEvent = utils.logEvent;
var onTransitionComplete = utils.onTransitionComplete;
var globals = require("./globals");
var gif = new GIF({
  workers: 2,
  quality: 10,
  background: "#fff",
  workerScript: URL.createObjectURL(new Blob([require("raw-loader!./lib/gif.worker.js")], { type: "text/javascript" })) // Creates a script url with the contents of "gif.worker.js"
});
var getNextZIndex = require("./annotations").getNextZIndex;
var log = require("debug")("TimelineStoryteller:main");

/**
 * Creates a new TimelineStoryteller component
 * @param isServerless True if the component is being run in a serverless environment (default false)
 * @param showDemo True if the demo code should be shown (default true)
 * @param parentElement The element in which the Timeline Storyteller is contained (default: body)
 */
function TimelineStoryteller(isServerless, showDemo, parentElement) {
  var instance = this;
  var timeline_vis = configurableTL(globals.unit_width, globals.padding);
  parentElement = parentElement || document.body;
  this.parentElement = parentElement;
  this._timeline_vis = timeline_vis;
  this._loaded = false;
  this.scale = 1;

  var timelineElement = document.createElement("div");
  timelineElement.className = "timeline_storyteller";
  parentElement.appendChild(timelineElement);

  this._colorPicker = require("./colorPickerPopup")(timelineElement);
  this._container =
    selectWithParent()
      .append("div")
      .attr("class", "timeline_storyteller-container");

  instance._component_width = parentElement.clientWidth;
  instance._component_height = parentElement.clientHeight;
  instance._render_width = instance._component_width;
  instance._render_height = instance._component_height;

  this.options = clone(TimelineStoryteller.DEFAULT_OPTIONS);

  globals.serverless = isServerless;
  if (typeof isServerless === "undefined" || isServerless === false) {
    globals.socket = require("socket.io")({ transports: ["websocket"] });
  }

  if (globals.socket) {
    globals.socket.on("hello_from_server", function (data) {
      log(data);
    });
  }

  /**
   * Creates the import panel
   * @returns {void}
   */
  function createImportPanel() {
    var element = selectWithParent()
      .append("div")
      .attr("id", "import_div")
      .attr("class", "control_div")
      .style("top", "25%");

    var panel = {
      visible: true,
      element: element,
      show: function () {
        panel.visible = true;
        element.style("top", "25%").style("display", "block");
      },
      hide: function() {
        panel.visible = false;
        element.style("top", "-210px");
      }
    };
    return panel;
  }

  function showDemoData() {
    return (typeof showDemo === "undefined" || showDemo) && window.timeline_story_demo_data !== undefined;
  }

  function showDemoStory() {
    return (typeof showDemo === "undefined" || showDemo) && window.timeline_story_demo_story !== undefined;
  }

  function adjustSvgSize() {
    main_svg.transition()
      .duration(instance.options.animations ? 1200 : 0)
      .attr("width", d3.max([globals.width, (instance._render_width - globals.margin.left - globals.margin.right - getScrollbarWidth())]))
      .attr("height", d3.max([globals.height, (instance._component_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth())]));
  }

  instance._adjustSvgSize = adjustSvgSize;

  Date.prototype.stdTimezoneOffset = function () {
    var jan = new Date(this.getFullYear(), 0, 1);
    var jul = new Date(this.getFullYear(), 6, 1);
    return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  };

  Date.prototype.dst = function () {
    return this.getTimezoneOffset() < this.stdTimezoneOffset();
  };

  window.onload = function () {
    logEvent("Initializing Timeline Storyteller");

    if (globals.socket) {
      globals.socket.emit("hello_from_client", { hello: "server" });
    }

    instance._onResized(false);
  };

  instance._container.on("scroll", function (e) {
    var axis = instance._container.select(".timeline_axis");
    axis
      .select(".domain")
      .attr("transform", function () {
        return "translate(0," + instance._container.node().scrollTop + ")";
      });

    axis
      .selectAll(".tick text")
      .attr("y", instance._container.node().scrollTop - 6);
  });

  var legendDrag = d3.behavior.drag()
    .origin(function () {
      var t = d3.select(this);

      return {
        x: t.attr("x"),
        y: t.attr("y")
      };
    })
    .on("drag", function () {
      var x_pos = d3.event.x;
      var y_pos = d3.event.y;

      if (x_pos < 0) {
        x_pos = 0;
      } else if (x_pos > (globals.width - globals.margin.right)) {
        x_pos = globals.width - globals.margin.right;
      }

      if (y_pos < 0) {
        y_pos = 0;
      }

      d3.select(this)
        .attr("x", x_pos)
        .attr("y", y_pos);
    })
    .on("dragend", function () {
      globals.legend_x = d3.select(this).attr("x");
      globals.legend_y = d3.select(this).attr("y");

      logEvent("legend moved to: " + globals.legend_x + ", " + globals.legend_y, "legend");
    });

  var filterDrag = d3.behavior.drag()
    .origin(function () {
      var t = selectWithParent("#filter_div");

      return {
        x: parseInt(t.style("left")),
        y: parseInt(t.style("top"))
      };
    })
    .on("drag", function () {
      var x_pos = d3.event.x;
      var y_pos = d3.event.y;

      if (x_pos < (10 + parseInt(selectWithParent("#menu_div").style("width")) + 10)) {
        x_pos = (10 + parseInt(selectWithParent("#menu_div").style("width")) + 10);
      } else if (x_pos >= globals.effective_filter_width) {
        x_pos = globals.effective_filter_width - 10;
      }

      if (y_pos < (180 + parseInt(selectWithParent("#option_div").style("height")) + 20)) {
        y_pos = (180 + parseInt(selectWithParent("#option_div").style("height")) + 20);
      } else if (y_pos >= globals.effective_filter_height + 155) {
        y_pos = globals.effective_filter_height + 155;
      }

      selectWithParent("#filter_div")
        .style("left", x_pos + "px")
        .style("top", y_pos + "px");
    })
    .on("dragend", function () {
      var filter_x = selectWithParent("#filter_div").style("left");
      var filter_y = selectWithParent("#filter_div").style("top");

      logEvent("filter options moved to: " + filter_x + ", " + filter_y, "filter");
    });

  /**
  --------------------------------------------------------------------------------------
  KEY PRESS EVENTS
  --------------------------------------------------------------------------------------
  **/

  selectWithParent().on("keydown", function () {
    if (d3.event.keyCode === 76 && d3.event.altKey) {
      // recover legend
      selectWithParent(".legend")
        .transition()
        .duration(instance.options.animations ? 1200 : 0)
        .attr("x", 0)
        .attr("y", 0);

      globals.legend_x = 0;
      globals.legend_y = 0;
    }
    if (d3.event.keyCode === 82 && d3.event.altKey) {
      // recover legend
      if (!globals.playback_mode) {
        recordScene();
      }
    } else if (globals.playback_mode && d3.event.keyCode === 39) {
      goNextScene();
    } else if (globals.playback_mode && d3.event.keyCode === 37) {
      goPreviousScene();
    } else if (d3.event.keyCode === 80 && d3.event.altKey) {
      instance.setPlaybackMode(!globals.playback_mode);
    } else if (d3.event.keyCode === 46 && selectWithParent("#caption_div").style("display") === "none" && selectWithParent("#image_div").style("display") === "none" && !instance.importPanel.visible) {
      globals.deleteScene();
    }
  });

  function goNextScene() {
    if (globals.scenes.length < 2) {
      return;
    } else if (globals.current_scene_index < globals.scenes.length - 1) {
      globals.current_scene_index++;
    } else {
      globals.current_scene_index = 0;
    }
    logEvent("scene: " + (globals.current_scene_index + 1) + " of " + globals.scenes.length, "playback");

    changeScene(globals.current_scene_index);
  }

  function goPreviousScene() {
    if (globals.scenes.length < 2) {
      return;
    }
    if (globals.current_scene_index > 0) {
      globals.current_scene_index--;
    } else {
      globals.current_scene_index = globals.scenes.length - 1;
    }
    logEvent("scene: " + globals.current_scene_index + " of " + globals.scenes.length, "playback");

    changeScene(globals.current_scene_index);
  }

  // initialize main visualization containers
  var main_svg,
    export_div,
    option_div,
    menu_div,
    caption_div,
    image_div,
    filter_div,
    navigation_div;

  gif.on("finished", function (blob) {
    var saveLink = document.createElement("a");
    var downloadSupported = "download" in saveLink;
    if (downloadSupported) {
      saveLink.download = "timeline_story.gif";
      saveLink.href = URL.createObjectURL(blob);
      saveLink.style.display = "none";
      document.querySelector(".timeline_storyteller").appendChild(saveLink);
      saveLink.click();
      document.querySelector(".timeline_storyteller").removeChild(saveLink);
    } else {
      window.open(URL.createObjectURL(blob), "_temp", "menubar=no,toolbar=no,status=no");
    }

    var reader = new window.FileReader(),
      base64data = "";
    reader.readAsDataURL(blob);
    reader.onloadend = function () {
      base64data = reader.result;
      var research_copy = {};
      if (!globals.opt_out) {
        research_copy = {
          "timeline_json_data": globals.timeline_json_data,
          "name": "timeline_story.gif",
          "usage_log": globals.usage_log,
          "image": base64data,
          "email_address": globals.email_address,
          "timestamp": new Date().valueOf()
        };
      } else {
        research_copy = {
          "usage_log": globals.usage_log,
          "email_address": globals.email_address,
          "timestamp": new Date().valueOf()
        };
      }
      var research_copy_json = JSON.stringify(research_copy);
      var research_blob = new Blob([research_copy_json], { type: "application/json" });

      log(research_copy);

      if (globals.socket) {
        globals.socket.emit("export_event", research_copy_json); // raise an event on the server
      }
    };

    gif.running = false;
  });

  this.onIntro = true;

  instance.importPanel = createImportPanel();

  export_div = selectWithParent()
    .append("div")
    .attr("id", "export_div")
    .attr("class", "control_div")
    .style("top", -185 + "px");

  menu_div = selectWithParent()
    .append("div")
    .attr("id", "menu_div")
    .attr("class", "control_div");

  var control_panel = instance._control_panel = menu_div.append("g");

  var menuItems = instance.options.menu;
  instance._initializeMenu(menuItems);

  /**
  ---------------------------------------------------------------------------------------
  EXPORT OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  selectWithParent("#export_div").append("input")
    .attr({
      type: "image",
      name: "Hide export panel",
      id: "export_close_btn",
      class: "img_btn_enabled",
      src: imageUrls("close.png"),
      height: 15,
      width: 15,
      title: "Hide export panel"
    })
    .style("margin-top", "5px")
    .on("click", function () {
      selectWithParent("#export_div").style("top", -185 + "px");

      logEvent("hide export panel", "export");
    });

  export_div.append("div")
    .attr("id", "export_boilerplate")
    .style("height", "120px")
    .html("<span class='boilerplate_title'>Export options</span><hr>" +
    "<span class='disclaimer_text'>By providing an email address you agree that <a title='Microsoft' href='http://microsoft.com'>Microsoft</a> may contact you to request feedback and for user research.<br>" +
    "You may withdraw this consent at any time.</span><hr>");

  var export_formats = export_div.append("div")
    .attr("id", "export_formats");

  export_formats.append("input")
    .attr({
      type: "text",
      placeholder: "email address",
      class: "text_input",
      id: "email_input"
    })
    .on("input", function () {
      var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
      if (re.test(selectWithParent("#email_input").property("value"))) {
        globals.email_address = selectWithParent("#email_input").property("value");
        export_formats.selectAll(".img_btn_disabled")
          .attr("class", "img_btn_enabled");

        logEvent("valid email address: " + globals.email_address, "export");
      } else {
        export_formats.selectAll(".img_btn_enabled")
          .attr("class", "img_btn_disabled");
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export PNG",
      class: "img_btn_disabled",
      src: imageUrls("png.png"),
      height: 30,
      width: 30,
      title: "Export PNG"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        logEvent("exporting main_svg as PNG", "export");

        svgImageUtils.saveSvgAsPng(document.querySelector(".timeline_storyteller #main_svg"), "timeline_image.png", { backgroundColor: "white" });
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export SVG",
      class: "img_btn_disabled",
      src: imageUrls("svg.png"),
      height: 30,
      width: 30,
      title: "Export SVG"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        logEvent("exporting main_svg as SVG", "export");

        svgImageUtils.saveSvg(document.querySelector(".timeline_storyteller #main_svg"), "timeline_image.svg", { backgroundColor: "white" });
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export animated GIF",
      class: "img_btn_disabled",
      src: imageUrls("gif.png"),
      height: 30,
      width: 30,
      title: "Export animated GIF"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        gif.frames = [];
        var gif_scenes = globals.scenes;
        if (gif_scenes.length > 0) {
          logEvent("exporting story as animated GIF", "export");

          gif_scenes.sort(function (a, b) {
            return parseFloat(a.s_order) - parseFloat(b.s_order);
          });
          gif_scenes.forEach(function (d, i) {
            var img = document.createElement("img");
            img.style.display = "none";
            img.id = "gif_frame" + i;
            img.src = d.s_src;
            document.querySelector(".timeline_storyteller").appendChild(img);
            selectWithParent("#gif_frame" + i).attr("class", "gif_frame");
            setTimeout(function () {
              gif.addFrame(document.getElementById("gif_frame" + i), { delay: 1500 });
            }, 150);
          });
        } else {
          logEvent("exporting main_svg as GIF", "export");

          svgImageUtils.svgAsPNG(document.querySelector(".timeline_storyteller #main_svg"), -1, { backgroundColor: "white" });

          setTimeout(function () {
            gif.addFrame(document.getElementById("gif_frame-1"));
          }, 150);
        }
        setTimeout(function () {
          gif.render();
          selectAllWithParent(".gif_frame").remove();
        }, 150 + 150 * gif.frames.length);
        gif_scenes = [];
      }
    });

  export_formats.append("input")
    .attr({
      type: "image",
      name: "Export story",
      class: "img_btn_disabled",
      src: imageUrls("story.png"),
      height: 30,
      width: 30,
      title: "Export story"
    })
    .on("click", function () {
      if (globals.opt_out || globals.email_address !== "") {
        selectAllWithParent("foreignObject").remove();

        logEvent("exporting story as .cdc", "export");

        globals.timeline_story = {
          "timeline_json_data": globals.timeline_json_data,
          "name": "timeline_story.cdc",
          "scenes": globals.scenes,
          "width": instance._component_width,
          "height": instance._component_height,
          "color_palette": globals.categories.range(),
          "usage_log": globals.usage_log,
          "caption_list": globals.caption_list,
          "annotation_list": globals.annotation_list,
          "image_list": globals.image_list,
          "author": globals.email_address,
          "tz_offset": new Date().getTimezoneOffset(),
          "timestamp": new Date().valueOf()
        };

        var story_json = JSON.stringify(globals.timeline_story);
        var blob = new Blob([story_json], { type: "application/json" });
        var url = URL.createObjectURL(blob);

        var a = document.createElement("a");
        a.download = "timeline_story.cdc";
        a.href = url;
        a.textContent = "Download timeline_story.cdc";
        document.querySelector(".timeline_storyteller").appendChild(a);
        a.click();
        document.querySelector(".timeline_storyteller").removeChild(a);

        if (globals.opt_out) {
          globals.timeline_story = {
            "usage_log": globals.usage_log,
            "author": globals.email_address,
            "timestamp": new Date().valueOf()
          };
        }

        story_json = JSON.stringify(globals.timeline_story);

        log(story_json);

        if (globals.socket) {
          globals.socket.emit("export_event", story_json); // raise an event on the server
        }
      }
    });

  var out_out_cb = export_formats.append("div")
    .attr("id", "opt_out_div");

  out_out_cb.append("input")
    .attr({
      type: "checkbox",
      name: "opt_out_cb",
      value: globals.opt_out
    })
    .property("checked", false)
    .on("change", function () {
      if (!globals.opt_out) {
        logEvent("opting out of sharing content", "export");

        globals.opt_out = true;
        export_formats.selectAll(".img_btn_disabled")
          .attr("class", "img_btn_enabled");
      } else {
        globals.opt_out = false;

        logEvent("opting into sharing content", "export");

        export_formats.selectAll(".img_btn_enabled")
          .attr("class", "img_btn_disabled");
      }
    });

  out_out_cb.append("label")
    .attr("class", "menu_label")
    .attr("for", "opt_out_cb")
    .style("vertical-align", "text-top")
    .text(" Don't share content with Microsoft");


  /**
  ---------------------------------------------------------------------------------------
  OPTIONS DIV
  ---------------------------------------------------------------------------------------
  **/

  option_div = selectWithParent()
    .append("div")
    .attr("id", "option_div")
    .attr("class", "control_div");

  /**
  ---------------------------------------------------------------------------------------
  CAPTION OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  caption_div = selectWithParent()
    .append("div")
    .attr("id", "caption_div")
    .attr("class", "annotation_div control_div")
    .style("display", "none");

  /**
  ---------------------------------------------------------------------------------------
  IMAGE OPTIONS
  ---------------------------------------------------------------------------------------
  **/

  image_div = selectWithParent()
    .append("div")
    .attr("id", "image_div")
    .attr("class", "annotation_div control_div")
    .style("display", "none");

  /**
  --------------------------------------------------------------------------------------
  DATASETS
  --------------------------------------------------------------------------------------
  **/

  selectWithParent().append("div")
    .attr("id", "logo_div")
    .html("<a href='https://microsoft.com'><img class='ms-logo' src='" + imageUrls("ms-logo.svg") + "'></a>");

  var footer = selectWithParent().append("div")
    .attr("id", "footer");

  footer.append("div")
    .attr("id", "footer_left")
    .html("<span class='footer_text_left'><a title=About & getting started' href='../../' target='_blank'>About & getting started</a></span> <span class='footer_text_left'><a title='Contact the project team' href='mailto:timelinestoryteller@microsoft.com' target='_top'>Contact the project team</a>");

  footer.append("div")
    .attr("id", "footer_right")
    .html("<span class='footer_text'><a title='Privacy & cookies' href='https://go.microsoft.com/fwlink/?LinkId=521839' target='_blank'>Privacy & cookies</a></span><span class='footer_text'><a title='Terms of use' href='https://go.microsoft.com/fwlink/?LinkID=760869' target='_blank'>Terms of use</a></span><span class='footer_text'><a title='Trademarks' href='http://go.microsoft.com/fwlink/?LinkId=506942' target='_blank'>Trademarks</a></span><span class='footer_text'><a title='About our ads' href='http://choice.microsoft.com/' target='_blank'>About our ads</a></span><span class='footer_text'>© 2017 Microsoft</span>");

  var boilerplate = instance.importPanel.element.append("div")
    .attr("id", "boilerplate")
    .html("<span class='boilerplate_title'>Timeline Storyteller (Alpha)</span>");

  boilerplate.append("input")
    .attr({
      type: "image",
      name: "Hide import panel",
      id: "import_close_btn",
      class: "img_btn_enabled",
      src: imageUrls("close.png"),
      height: 15,
      width: 15,
      title: "Hide import panel"
    })
    .style("margin-top", "5px")
    .on("click", function () {
      logEvent("hiding import panel", "load");

      instance.importPanel.hide();

      selectWithParent("#gdocs_info").style("height", 0 + "px");
      selectAllWithParent(".gdocs_info_element").style("display", "none");
    });

  var data_picker = instance.importPanel.element.append("div")
    .attr("id", "data_picker");

  if (instance.options.showImportLoadDataOptions) {
    var dataset_picker = selectWithParent("#data_picker").append("div")
      .attr("class", "data_story_picker import-load-data-option");

    dataset_picker.append("text")
      .attr("class", "ui_label")
      .text("Load timeline data");

    if (showDemoData()) {
      var demo_dataset_picker_label = dataset_picker.append("label")
        .attr("class", "import_label demo_dataset_label");

      var showDropdown = function (element) {
        var event = document.createEvent("MouseEvents");
        event.initMouseEvent("mousedown", true, true, window);
        element.dispatchEvent(event);
      };

      demo_dataset_picker_label.append("select")
        .attr("id", "demo_dataset_picker")
        .attr("title", "Load demo dataset")
        .on("change", function () {
          globals.source = d3.select(this).property("value");
          if (globals.source !== "") {
            globals.source_format = "demo_json";
            setTimeout(function () {
              logEvent("loading " + globals.source + " (" + globals.source_format + ")", "load");

              loadTimeline();
            }, 500);
          }
        })
        .selectAll("option")
        .data([
          { "path": "", "tl_name": "" },
          { "path": "priestley", "tl_name": "Priestley's Chart of Biography (faceted by occupation)" },
          { "path": "philosophers", "tl_name": "Great Philosophers since the 8th Century BC (faceted by region)" },
          { "path": "empires", "tl_name": "History's Largest Empires (faceted by region)" },
          { "path": "ch_jp_ko", "tl_name": "East Asian Dynasties (faceted by region)" },
          { "path": "epidemics", "tl_name": "Epidemics since the 14th Century (faceted by region)" },
          { "path": "hurricanes50y", "tl_name": "C4-5 Hurricanes: 1960-2010" },
          { "path": "prime_ministers", "tl_name": "Prime Ministers of Canada" },
          { "path": "france_presidents", "tl_name": "Presidents of France" },
          { "path": "germany_chancellors", "tl_name": "Chancellors of Germany" },
          { "path": "italy_presidents", "tl_name": "Presidents of Italy" },
          { "path": "japan_prime_ministers", "tl_name": "Prime Ministers of Japan" },
          { "path": "uk_prime_ministers", "tl_name": "Prime Ministers of the UK" },
          { "path": "presidents", "tl_name": "Presidents of the USA" },
          { "path": "heads_of_state_since_1940", "tl_name": "G7 Heads of State since 1940 (faceted by country)" },
          { "path": "dailyroutines", "tl_name": "Podio's 'Daily Routines of Famous Creative People' (faceted by person)" },
          { "path": "painters", "tl_name": "Accurat's 'Visualizing painters' lives' (faceted by painter)" },
          { "path": "authors", "tl_name": "Accurat's 'From first published to masterpieces' (faceted by author)" },
          { "path": "singularity", "tl_name": "Kurzweil's 'Countdown to Singularity' (4 billion years)" },
          { "path": "perspective_on_time", "tl_name": "Wait But Why's 'A Perspective on Time' (14 billion years)" },
          { "path": "typical_american", "tl_name": "Wait But Why's 'Life of a Typical American'" }
        ])
        .enter()
        .append("option")
        .attr("value", function (d) { return d.path; })
        .text(function (d) { return d.tl_name; });

      demo_dataset_picker_label.append("img")
        .style("border", "0px solid transparent")
        .style("margin", "0px")
        .attr({
          name: "Load Demo Data",
          id: "demo_dataset_picker_label",
          height: 40,
          width: 40,
          title: "Load Demo Data",
          src: imageUrls("demo.png")
        })
        .on("click", function () {
          var se = document.getElementById("demo_dataset_picker");
          showDropdown(se);
        });
    }

    dataset_picker.append("input")
      .attr({
        type: "file",
        id: "json_uploader",
        class: "inputfile",
        accept: ".json"
      })
      .on("change", function () {
        var file = this.files[0];
        globals.reader.readAsText(file);

        globals.reader.onload = function (e) {
          var contents = e.target.result;
          var blob = new Blob([contents], { type: "application/json" });
          globals.source = URL.createObjectURL(blob);
          globals.source_format = "json";
          setTimeout(function () {
            logEvent("loading " + globals.source + " (" + globals.source_format + ")", "load");
            loadTimeline();
          }, 500);
        };
      });

    dataset_picker.append("label")
      .attr("for", "json_uploader")
      .attr("class", "import_label")
      .append("img")
      .attr({
        name: "Load from JSON",
        id: "json_picker_label",
        class: "img_btn_enabled import_label",
        height: 40,
        width: 40,
        title: "Load from JSON",
        src: imageUrls("json.png")
      });

    dataset_picker.append("input")
      .attr({
        type: "file",
        id: "csv_uploader",
        class: "inputfile",
        accept: ".csv"
      })
      .on("change", function () {
        var file = this.files[0];
        globals.reader.readAsText(file);

        globals.reader.onload = function (e) {
          var contents = e.target.result;
          var blob = new Blob([contents], { type: "application/csv" });
          globals.source = URL.createObjectURL(blob);
          globals.source_format = "csv";
          setTimeout(function () {
            logEvent("loading " + globals.source + " (" + globals.source_format + ")", "load");
            loadTimeline();
          }, 500);
        };
      });

    dataset_picker.append("label")
      .attr("for", "csv_uploader")
      .attr("class", "import_label")
      .append("img")
      .attr({
        name: "Load from CSV",
        id: "csv_picker_label",
        class: "img_btn_enabled import_label",
        height: 40,
        width: 40,
        title: "Load from CSV",
        src: imageUrls("csv.png")
      });

    dataset_picker.append("input")
      .attr({
        id: "gdocs_uploader",
        class: "inputfile"
      })
      .on("click", function () {
        if (selectAllWithParent(".gdocs_info_element").style("display") !== "none") {
          selectWithParent("#gdocs_info").style("height", 0 + "px");
          selectAllWithParent(".gdocs_info_element").style("display", "none");
        } else {
          selectWithParent("#gdocs_info").style("height", 27 + "px");
          setTimeout(function () {
            selectAllWithParent(".gdocs_info_element").style("display", "inline");
          }, 500);
        }
      });

    dataset_picker.append("label")
      .attr("for", "gdocs_uploader")
      .attr("class", "import_label")
      .append("img")
      .attr({
        name: "Load from Google Spreadsheet",
        id: "gdocs_picker_label",
        class: "img_btn_enabled import_label",
        height: 40,
        width: 40,
        title: "Load from Google Spreadsheet",
        src: imageUrls("gdocs.png")
      });
  }

  var story_picker = selectWithParent("#data_picker").append("div")
    .attr("class", "data_story_picker")
    .style("border-right", "1px solid transparent");

  story_picker.append("text")
    .attr("class", "ui_label")
    .text("Load timeline story");

  if (showDemoStory()) {
    story_picker.append("input")
      .attr({
        id: "story_demo",
        class: "inputfile"
      })
      .on("click", function () {
        globals.source = "demoStory";

        logEvent("demo story source", "load");

        globals.source_format = "demo_story";
        selectWithParent("#timeline_metadata").style("display", "none");
        selectAllWithParent(".gdocs_info_element").style("display", "none");
        instance.importPanel.hide();

        selectWithParent("#gdocs_info").style("height", 0 + "px");
        selectWithParent("#gdoc_spreadsheet_key_input").property("value", "");
        selectWithParent("#gdoc_worksheet_title_input").property("value", "");

        setTimeout(function () {
          loadTimeline();
        }, 500);
      });

    story_picker.append("label")
      .attr("for", "story_demo")
      .attr("class", "import_label")
      .append("img")
      .attr({
        name: "Load Demo Story",
        id: "story_demo_label",
        class: "img_btn_enabled import_label",
        height: 40,
        width: 40,
        title: "Load Demo Story",
        src: imageUrls("demo_story.png")
      });
  }

  story_picker.append("input")
    .attr({
      type: "file",
      id: "story_uploader",
      class: "inputfile",
      accept: ".cdc"
    })
    .on("change", function () {
      var file = this.files[0];
      globals.reader.readAsText(file);

      globals.reader.onload = function (e) {
        var contents = e.target.result;
        instance.loadStory(contents);
      };
    });

  story_picker.append("label")
    .attr("for", "story_uploader")
    .attr("class", "import_label")
    .append("img")
    .attr({
      name: "Load Saved Story",
      id: "story_picker_label",
      class: "img_btn_enabled import_label",
      height: 40,
      width: 40,
      title: "Load Saved Story",
      src: imageUrls("story.png")
    });

  var gdocs_info = instance.importPanel.element.append("div")
    .attr("id", "gdocs_info");

  gdocs_info.append("div")
    .attr("id", "gdoc_spreadsheet_key_div")
    .attr("class", "gdocs_info_element")
    .append("input")
    .attr({
      type: "text",
      placeholder: "Published spreadsheet URL",
      class: "text_input",
      id: "gdoc_spreadsheet_key_input"
    });

  gdocs_info.append("div")
    .attr("id", "gdoc_spreadsheet_title_div")
    .attr("class", "gdocs_info_element")
    .append("input")
    .attr({
      type: "text",
      placeholder: "OPTIONAL: Worksheet title (tab name)",
      class: "text_input",
      id: "gdoc_worksheet_title_input"
    });

  gdocs_info.append("div")
    .attr("id", "gdoc_spreadsheet_confirm_div")
    .attr("class", "gdocs_info_element")
    .style("width", "20px")
    .append("input")
    .attr({
      type: "image",
      name: "Confirm Google Spreadsheet Data",
      id: "confirm_gdocs_btn",
      class: "img_btn_enabled",
      src: imageUrls("check.png"),
      height: 20,
      width: 20,
      title: "Confirm Google Spreadsheet Data"
    })
    .on("click", function () {
      globals.gdoc_key = selectWithParent("#gdoc_spreadsheet_key_input").property("value");
      globals.gdoc_key = globals.gdoc_key.replace(/.*\/d\//g, "");
      globals.gdoc_key = globals.gdoc_key.replace(/\/.*$/g, "");
      globals.gdoc_worksheet = selectWithParent("#gdoc_worksheet_title_input").property("value");
      logEvent("gdoc spreadsheet " + globals.gdoc_worksheet + " added using key \"" + globals.gdoc_key + "\"", "load");

      globals.source_format = "gdoc";

      if (globals.gdoc_worksheet !== "") {
        gsheets.getWorksheet(globals.gdoc_key, globals.gdoc_worksheet, function (err, sheet) {
          if (err !== null) {
            alert(err);
            return true;
          }

          globals.timeline_json_data = sheet.data;
          globals.source_format = "gdoc";
          setTimeout(function () {
            loadTimeline();
          }, 500);
        });
      } else {
        var worksheet_id;

        gsheets.getSpreadsheet(globals.gdoc_key, function (err, sheet) {
          if (err !== null) {
            alert(err);
            return true;
          }

          log("worksheet id: " + sheet.worksheets[0].id);

          setTimeout(function () {
            worksheet_id = sheet.worksheets[0].id;
            gsheets.getWorksheetById(globals.gdoc_key, worksheet_id, function (err, sheet) {
              if (err !== null) {
                alert(err);
                return true;
              }

              globals.timeline_json_data = sheet.data;
              globals.source_format = "gdoc";
              setTimeout(function () {
                loadTimeline();
              }, 500);
            });
          }, 500);
        });
      }
    });

  instance.importPanel.element.append("div")
    .attr("class", "loading_data_indicator")
    .style("display", "none")
    .html("<span>Loading data...</span>");

  instance.importPanel.element.append("div")
    .attr("id", "disclaimer")
    .html("<span class='disclaimer_title'style='clear:both'>An expressive visual storytelling environment for presenting timelines.</span><span class='disclaimer_text'><br><strong>A note about privacy</strong>: </span>" +
    "<span class='disclaimer_text'>Your data remains on your machine and is not shared with <a title='Microsoft' href='http://microsoft.com'>Microsoft</a> unless you export the content you create and provide your email address. If you share your content with <a title='Microsoft' href='http://microsoft.com'>Microsoft</a>, we will use it for research and to improve our products and services. We may also include it in a future research publication. " +
    "By using this service, you agree to <a title='Microsoft' href='http://microsoft.com'>Microsoft</a>'s <a title='Privacy' href='https://go.microsoft.com/fwlink/?LinkId=521839'>Privacy Statement</a> and <a title='Terms of Use' href='https://go.microsoft.com/fwlink/?LinkID=760869'>Terms of Use</a>.</span>");

  var timeline_metadata = instance.importPanel.element.append("div")
    .attr("id", "timeline_metadata")
    .style("display", "none");

  timeline_metadata.append("div")
    .attr("id", "timeline_metadata_contents");

  timeline_metadata.append("div")
    .attr({
      id: "draw_timeline",
      class: "img_btn_enabled import_label",
      title: "Draw Timeline"
    })
    .on("click", function () {
      selectWithParent("#gdocs_info").style("height", 0 + "px");
      selectWithParent("#gdoc_spreadsheet_key_input").property("value", "");
      selectWithParent("#gdoc_worksheet_title_input").property("value", "");
      selectAllWithParent(".gdocs_info_element").style("display", "none");

      drawTimeline(globals.active_data);
      updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
    })
    .append("text")
    .attr("class", "boilerplate_title")
    .style("color", "white")
    .style("cursor", "pointer")
    .style("position", "relative")
    .text("Draw this timeline");

  /**
  --------------------------------------------------------------------------------------
  TIMELINE CONFIG OPTIONS UI
  --------------------------------------------------------------------------------------
  **/

  var option_picker = selectWithParent("#option_div");

  // representation options
  var representation_picker = option_picker.append("div")
    .attr("class", "option_picker")
    .attr("id", "representation_picker");

  representation_picker.append("text")
    .attr("class", "ui_label")
    .text("Timeline representation");

  var representation_rb = representation_picker.selectAll("div")
    .data(globals.representations)
    .enter();

  var representation_rb_label = representation_rb.append("label")
    .attr("class", "option_rb")
    .on("mouseover", function (d) {
      var rb_hint = representation_picker.append("div")
        .attr("id", "rb_hint")
        .html(d.hint);
    })
    .on("mouseout", function (d) {
      selectWithParent("#rb_hint").remove();
    });

  representation_rb_label.append("input")
    .attr({
      type: "radio",
      name: "representation_rb",
      value: function (d) {
        return d.name;
      }
    })
    .property("checked", function (d) {
      return d.name === timeline_vis.tl_representation();
    })
    .property("disabled", true);

  representation_rb_label.append("img")
    .attr({
      height: 40,
      width: 40,
      class: "img_btn_disabled",
      src: function (d) {
        return d.icon;
      }
    });

  representation_rb_label.append("span")
    .attr("class", "option_rb_label")
    .text(function (d) {
      return d.name;
    });

  // scale options
  var scale_picker = option_picker.append("div")
    .attr("class", "option_picker")
    .attr("id", "scale_picker");

  scale_picker.append("text")
    .attr("class", "ui_label")
    .text("Scale");

  var scale_rb = scale_picker.selectAll("div")
    .data(globals.scales)
    .enter();

  var scale_rb_label = scale_rb.append("label")
    .attr("class", "option_rb")
    .on("mouseover", function (d) {
      scale_picker.append("div")
        .attr("id", "rb_hint")
        .html(d.hint);
    })
    .on("mouseout", function (d) {
      selectWithParent("#rb_hint").remove();
    });

  scale_rb_label.append("input")
    .attr({
      type: "radio",
      name: "scale_rb",
      value: function (d) {
        return d.name;
      }
    })
    .property("checked", function (d) {
      return d.name === timeline_vis.tl_scale();
    })
    .property("disabled", true);

  scale_rb_label.append("img")
    .attr({
      height: 40,
      width: 40,
      class: "img_btn_disabled",
      src: function (d) {
        return d.icon;
      }
    });

  scale_rb_label.append("span")
    .attr("class", "option_rb_label")
    .text(function (d) {
      return d.name;
    });

  // layout options
  var layout_picker = option_picker.append("div")
    .attr("class", "option_picker")
    .style("border-right", "none")
    .attr("id", "layout_picker");

  layout_picker.append("text")
    .attr("class", "ui_label")
    .text("Layout");

  var layout_rb = layout_picker.selectAll("div")
    .data(globals.layouts)
    .enter();

  var layout_rb_label = layout_rb.append("label")
    .attr("class", "option_rb")
    .on("mouseover", function (d) {
      layout_picker.append("div")
        .attr("id", "rb_hint")
        .html(d.hint);
    })
    .on("mouseout", function () {
      selectWithParent("#rb_hint").remove();
    });

  layout_rb_label.append("input")
    .attr({
      type: "radio",
      name: "layout_rb",
      value: function (d) {
        return d.name;
      }
    })
    .property("checked", function (d) {
      return d.name === timeline_vis.tl_layout();
    })
    .property("disabled", true);

  layout_rb_label.append("img")
    .attr({
      height: 40,
      width: 40,
      class: "img_btn_disabled",
      src: function (d) {
        return d.icon;
      }
    });

  layout_rb_label.append("span")
    .attr("class", "option_rb_label")
    .text(function (d) {
      return d.name;
    });

  selectWithParent("#caption_div").append("textarea")
    .attr({
      cols: 37,
      rows: 5,
      placeholder: "Caption text",
      class: "text_input",
      maxlength: 140,
      id: "add_caption_text_input"
    });

  selectWithParent("#caption_div").append("input")
    .attr({
      type: "image",
      name: "Add Caption",
      id: "add_caption_btn",
      class: "img_btn_enabled",
      src: imageUrls("check.png"),
      height: 20,
      width: 20,
      title: "Add Caption"
    })
    .on("click", function () {
      selectWithParent("#caption_div").style("display", "none");
      var caption = selectWithParent("#add_caption_text_input").property("value");
      logEvent("caption added: \"" + caption + "\"", "annotation");

      var caption_list_item = {
        id: "caption" + globals.caption_index,
        c_index: globals.caption_index,
        caption_text: caption,
        x_rel_pos: 0.5,
        y_rel_pos: 0.25,
        caption_width: d3.min([caption.length * 10, 100]),
        z_index: getNextZIndex()
      };

      globals.caption_list.push(caption_list_item);

      addCaption(caption, d3.min([caption.length * 10, 100]), 0.5, 0.25, globals.caption_index);
      globals.caption_index++;
      selectWithParent("#add_caption_text_input").property("value", "");
    });

  selectWithParent("#image_div").append("input")
    .attr({
      type: "text",
      placeholder: "Image URL",
      class: "text_input",
      id: "add_image_link"
    });

  selectWithParent("#image_div").append("input")
    .attr({
      type: "image",
      name: "Add Image",
      id: "add_image_btn",
      class: "img_btn_enabled",
      src: imageUrls("check.png"),
      height: 20,
      width: 20,
      title: "Add Image"
    })
    .on("click", function () {
      selectWithParent("#image_div").style("display", "none");
      var image_url = selectWithParent("#add_image_link").property("value");
      logEvent("image " + globals.image_index + " added: <<" + image_url + ">>", "annotation");

      var new_image = new Image();
      new_image.name = image_url;
      new_image.onload = getWidthAndHeight;
      new_image.onerror = loadFailure;
      new_image.src = image_url;

      function loadFailure() {
        logEvent("'" + this.name + "' failed to load.", "annotation");

        return true;
      }

      function getWidthAndHeight() {
        logEvent("image " + globals.image_index + " is " + this.width + " by " + this.height + " pixels in size.", "annotation");

        var image_width = this.width,
          image_height = this.height,
          scaling_ratio = 1;

        // reduce size of large images
        if (image_width >= globals.width * 0.5) {
          image_width = globals.width * 0.5;
          scaling_ratio = image_width / this.width;
          image_height = this.height * scaling_ratio;
        }
        if (image_height >= globals.height * 0.5) {
          image_height = globals.height * 0.5;
          scaling_ratio = image_height / this.height;
          image_width = this.width * scaling_ratio;
        }

        var image_list_item = {
          id: "image" + globals.image_index,
          i_index: globals.image_index,
          i_url: image_url,
          i_width: image_width,
          i_height: image_height,
          x_rel_pos: 0.5,
          y_rel_pos: 0.25,
          z_index: getNextZIndex()
        };

        globals.image_list.push(image_list_item);
        addImage(timeline_vis, image_url, 0.5, 0.25, image_width, image_height, globals.image_index);
        globals.image_index++;
      }
      selectWithParent("#add_image_link").property("value", "");
    });

  /**
  --------------------------------------------------------------------------------------
  MAIN PREPROCESSING
  --------------------------------------------------------------------------------------
  **/

  function loadTimeline(skipConfig) {
    instance._loaded = false;

    var loadDataIndicator = selectWithParent(".loading_data_indicator");
    loadDataIndicator.style("display", "block");

    // Allow the user to configure the timeline first
    if (!skipConfig) {
      instance.importPanel.show();
    } else {
      instance.importPanel.hide();
    }

    instance._component_width = parentElement.clientWidth;
    instance._component_height = parentElement.clientHeight;

    instance.onIntro = false;

    // Give it some time to render the "load data" indicator
    setTimeout(function () {
      try {
        selectWithParent("#disclaimer").style("display", "none");
        selectWithParent("#timeline_metadata_contents").html("");
        control_panel.selectAll("input").attr("class", "img_btn_disabled");
        selectWithParent("#filter_type_picker").selectAll("input").property("disabled", true);
        selectWithParent("#filter_type_picker").selectAll("img").attr("class", "img_btn_disabled");
        selectWithParent("#playback_bar").selectAll("img").attr("class", "img_btn_disabled");
        selectAllWithParent(".option_rb").select("input").property("disabled", "true");
        selectAllWithParent(".option_rb").select("img").attr("class", "img_btn_disabled");
        selectAllWithParent(".option_rb img").style("border", "2px solid transparent");
        selectWithParent("#menu_div").style("left", -50 + "px");
        selectWithParent("#navigation_div").style("bottom", -100 + "px");
        globals.use_custom_palette = false;

        if (main_svg !== undefined) {
          console.clear();
          main_svg.remove();
          filter_div.remove();
          navigation_div.remove();
          timeline_vis.prev_tl_representation("None");

          if (!isStory(globals.source_format)) {
            globals.caption_index = 0;
            globals.image_index = 0;
            globals.scenes = [];
            globals.caption_list = [];
            globals.image_list = [];
            globals.annotation_list = [];
            timeline_vis.tl_scale("Chronological")
              .tl_layout("Unified")
              .tl_representation("Linear");
            selectAllWithParent(".gif_frame").remove();
            timeline_vis.resetCurve();
          }
        }

        if (globals.legend_panel !== undefined) {
          globals.legend_panel.remove();
        }

        filter_div = selectWithParent()
          .append("div")
          .attr("id", "filter_div")
          .attr("class", "control_div")
          .style("display", "none")
          .style("transition", "all 0.05s ease")
          .style("-webkit-transition", "all 0.05s ease");

        // initialize global variables accessed by multiple visualziations
        globals.date_granularity = "years";
        globals.max_num_tracks = 0;
        globals.max_end_age = 0;
        globals.max_num_seq_tracks = 0;
        globals.legend_rect_size = globals.unit_width;
        globals.legend_spacing = 5;
        globals.categories = undefined;
        globals.categories = d3.scale.ordinal(); // scale for event types
        if (globals.color_palette !== undefined) {
          globals.categories.range(globals.color_palette);
        }
        globals.facets = d3.scale.ordinal(); // scale for facets (timelines)
        globals.segments = d3.scale.ordinal(); // scale for segments
        globals.present_segments = d3.scale.ordinal();
        globals.num_categories = 0;
        globals.num_facets = 0;
        globals.timeline_facets = [];

        instance._main_svg = main_svg = instance._container
          .append("svg")
          .attr("id", "main_svg");

        navigation_div = selectWithParent()
          .append("div")
          .attr("id", "navigation_div")
          .attr("class", "control_div");

        var playback_bar = navigation_div.append("div")
          .attr("id", "playback_bar");

        playback_bar.append("div")
          .attr("id", "record_scene_div")
          .attr("class", "nav_bttn")
          .append("img")
          .attr({
            id: "record_scene_btn",
            class: "img_btn_disabled",
            src: imageUrls("record.png"),
            height: 20,
            width: 20,
            title: "Record Scene"
          })
          .on("click", function () {
            if (!globals.playback_mode) {
              recordScene();
            }
          });

        playback_bar.append("div")
          .attr("id", "prev_scene_div")
          .attr("class", "nav_bttn")
          .append("img")
          .attr("id", "prev_scene_btn")
          .attr("height", 20)
          .attr("width", 20)
          .attr("src", imageUrls("prev.png"))
          .attr("class", "img_btn_disabled")
          .attr("title", "Previous Scene")
          .on("click", function () {
            goPreviousScene();
          });

        playback_bar.append("div")
          .attr("id", "next_scene_div")
          .attr("class", "nav_bttn")
          .append("img")
          .attr("height", 20)
          .attr("width", 20)
          .attr("class", "img_btn_disabled")
          .attr("id", "next_scene_btn")
          .attr("src", imageUrls("next.png"))
          .attr("title", "Next Scene")
          .on("click", function () {
            goNextScene();
          });

        var playback_cb = playback_bar.append("div")
          .attr("id", "playback_div")
          .attr("class", "nav_bttn");

        var playback_cb_label = playback_cb.append("label")
          .attr("class", "nav_cb");

        playback_cb_label.append("input")
          .attr({
            type: "checkbox",
            name: "playback_cb",
            value: globals.playback_mode
          })
          .property("checked", false)
          .on("change", function () {
            instance.setPlaybackMode(!globals.playback_mode);
          });

        playback_cb_label.append("img")
          .attr({
            id: "play_scene_btn",
            class: "img_btn_disabled",
            src: imageUrls("play.png"),
            height: 20,
            width: 20,
            title: "Toggle Playback Mode"
          });

        playback_bar.append("div")
          .attr("id", "stepper_container")
          // .style('width', function () {
          //   return (globals.window_width * 0.9 - 120 - 12) + 'px';
          // })
          .append("svg")
          .attr("id", "stepper_svg")
          .append("text")
          .attr("id", "stepper_svg_placeholder")
          .attr("y", 25)
          .attr("dy", "0.25em")
          .text("Recorded timeline scenes will appear here.");

        window.addEventListener("resize", function () {
          selectWithParent("#stepper_container").style("width", function () {
            return (instance._render_width * 0.9 - 120 - 12 - 5) + "px";
          });
          instance._onResized();
        });

        var defs = main_svg.append("defs");

        var filter = defs.append("filter")
          .attr("id", "drop-shadow")
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", "200%")
          .attr("height", "200%");

        // translate output of Gaussian blur to the right and downwards with 2px
        // store result in offsetBlur
        filter.append("feOffset")
          .attr("in", "SourceAlpha")
          .attr("dx", 2.5)
          .attr("dy", 2.5)
          .attr("result", "offOut");

        filter.append("feGaussianBlur")
          .attr("in", "offOut")
          .attr("stdDeviation", 2.5)
          .attr("result", "blurOut");

        filter.append("feBlend")
          .attr("in", "SourceGraphic")
          .attr("in2", "blurOut")
          .attr("mode", "normal");

        defs.append("filter")
          .attr("id", "greyscale")
          .append("feColorMatrix")
          .attr("type", "matrix")
          .attr("dur", "0.5s")
          .attr("values", "0.4444 0.4444 0.4444 0 0 0.4444 0.4444 0.4444 0 0 0.4444 0.4444 0.4444 0 0 0 0 0 1 0");

        /**
        ---------------------------------------------------------------------------------------
        LOAD DATA
        ---------------------------------------------------------------------------------------
        **/

        var unique_values = d3.map([]);
        var unique_data = [];

        if (globals.source_format === "demo_json") {
          var data = window.timeline_story_demo_data[globals.source];
          initTimelineData(data);
        } else if (globals.source_format === "json") {
          var data = d3.json(globals.source, function (error, data) {
            initTimelineData(data);
          });
        } else if (globals.source_format === "json_parsed") {
          initTimelineData(global.source);
        } else if (globals.source_format === "csv") {
          var data = d3.csv(globals.source, function (error, data) {
            initTimelineData(data);
          });
        } else if (globals.source_format === "gdoc") {
          var data = globals.timeline_json_data;
          initTimelineData(data);
        } else if (isStory(globals.source_format)) {
          globals.playback_mode = true;

          selectWithParent("#stepper_svg_placeholder").remove();

          if (globals.source_format === "story") {
            d3.json(globals.source, function (error, story) {
              instance._loadDataFromStory(story, instance._component_height, unique_data, unique_values);
            });
          } else if (globals.source_format === "demo_story") {
            instance._loadDataFromStory(window.timeline_story_demo_story, instance._render_height, unique_data, unique_values);
          }
        }
      } finally {

        // Reapply the UI scale to new elements
        instance.setUIScale(instance.scale);

        loadDataIndicator.style("display", "none");
        instance.applyOptions();

        if (skipConfig) {
          drawTimeline(globals.active_data);
        }

        instance._loaded = true;
      }
    }, 10);
  }

  instance._loadTimeline = loadTimeline;

  /**
   * Preprocess data after loading
   * @param {object} data The data to preprocess
   * @returns {void}
   */
  function initTimelineData(data) {
    globals.timeline_json_data = data;

    data.forEach(function (d) {
        unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
    });
    // find unique values
    unique_values.forEach(function (d) {
        unique_data.push(unique_values.get(d));
    });
    logEvent(unique_data.length + " unique events", "preprocessing");

    processTimeline(unique_data);
  }

  function processTimeline(data) {
    // check for earliest and latest numerical dates before parsing
    globals.earliest_date = d3.min(data, function (d) {
      if (d.start_date instanceof Date) {
        return d.start_date;
      }
      return +d.start_date;
    });

    globals.latest_start_date = d3.max(data, function (d) {
      if (d.start_date instanceof Date) {
        return d.start_date;
      }
      return +d.start_date;
    });

    globals.latest_end_date = d3.max(data, function (d) {
      if (d.end_date instanceof Date) {
        return d.end_date;
      }
      return +d.end_date;
    });

    // set flag for really epic time scales
    if (globals.isNumber(globals.earliest_date)) {
      if (globals.earliest_date < -9999 || d3.max([globals.latest_start_date, globals.latest_end_date]) > 10000) {
        globals.date_granularity = "epochs";
      }
    }

    log("date_granularity after: " + globals.date_granularity);

    parseDates(data); // parse all the date values, replace blank end_date values

    // set annotation counter for each item
    data.forEach(function (item) {
      item.annotation_count = 0;
    });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS CATEGORIES OF EVENTS
    ---------------------------------------------------------------------------------------
    **/

    // determine event categories from data
    globals.categories.domain(data.map(function (d) {
      return d.category;
    }));

    globals.num_categories = globals.categories.domain().length;

    globals.max_legend_item_width = 0;

    globals.categories.domain().sort().forEach(function (item) {
      var legend_dummy = document.createElement("span");
      legend_dummy.id = "legend_dummy";
      legend_dummy.style.fontSize = "12px";
      legend_dummy.style.fill = "#fff";
      legend_dummy.style.fontFamily = "Century Gothic";
      legend_dummy.innerHTML = item;
      document.querySelector(".timeline_storyteller").appendChild(legend_dummy);
      var legend_dummy_width = legend_dummy.offsetWidth;
      document.querySelector(".timeline_storyteller").removeChild(legend_dummy);

      if (legend_dummy_width > globals.max_legend_item_width) {
        globals.max_legend_item_width = legend_dummy_width;
      }
    });

    logEvent("# categories: " + globals.num_categories, "preprocessing");

    // assign colour labels to categories if # categories < 12
    if (globals.num_categories <= 20 && globals.num_categories >= 11) {
      var temp_palette = colorSchemes.schema5();
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    } else if (globals.num_categories <= 10 && globals.num_categories >= 3) {
      var temp_palette = colorSchemes.schema2();
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    } else if (globals.num_categories === 2) {
      var temp_palette = ["#E45641", "#44B3C2"];
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    } else {
      var temp_palette = ["#E45641"];
      globals.categories.range(temp_palette);
      temp_palette = undefined;
    }
    if (globals.use_custom_palette) {
      globals.categories.range(globals.color_palette);
      logEvent("custom palette: " + globals.categories.range(), "color palette");
    }

    filter_div.append("input")
      .attr({
        type: "image",
        name: "Hide filter panel",
        id: "export_close_btn",
        class: "img_btn_enabled",
        src: imageUrls("close.png"),
        height: 15,
        width: 15,
        title: "Hide filter panel"
      })
      .style("position", "absolute")
      .style("top", "0px")
      .style("left", "5px")
      .style("margin-top", "5px")
      .on("click", function () {
        selectWithParent("#filter_div").style("display", "none");

        logEvent("hide filter panel", "export");
      });

    filter_div.append("text")
      .attr("class", "menu_label filter_label")
      .style("margin-right", "auto")
      .text("Filter Options")
      .style("cursor", "move")
      .call(filterDrag);

    filter_div.append("hr")
      .attr("class", "menu_hr");

    // filter type options
    var filter_type_picker = filter_div.append("div")
      .attr("id", "filter_type_picker")
      .attr("class", "filter_div_section");

    filter_type_picker.append("div")
      .attr("class", "filter_div_header")
      .append("text")
      .attr("class", "menu_label filter_label")
      .text("Filter Mode:");

    var filter_type_rb = filter_type_picker.selectAll("g")
      .data(["Emphasize", "Hide"])
      .enter();

    var filter_type_rb_label = filter_type_rb.append("label")
      .attr("class", "menu_rb");

    filter_type_rb_label.append("input")
      .attr({
        type: "radio",
        name: "filter_type_rb",
        value: function (d) {
          return d;
        }
      })
      .property("disabled", false)
      .property("checked", function (d) {
        return d === "Emphasize";
      });

    filter_type_rb_label.append("img")
      .attr({
        class: "img_btn_enabled",
        height: 30,
        width: 30,
        title: function (d) {
          return d;
        },
        src: function (d) {
          return imageUrls(d === "Emphasize" ? "highlight.png" : "hide.png");
        }
      })
      .style("margin-bottom", "0px");

    filter_type_rb_label.append("span")
      .attr("class", "option_rb_label")
      .html(function (d) {
        return d;
      });

    selectAllWithParent("#filter_type_picker input[name=filter_type_rb]").on("change", function () {
      selectWithParent("#filter_div").style("display", "inline");

      logEvent("filter type changed: " + this.value, "filter");

      globals.filter_type = this.value;
      if (globals.filter_type === "Hide") {
        var trigger_remove_filter = false;
        if (globals.selected_categories[0].length !== 1 || globals.selected_categories[0][0].value !== "( All )") {
          trigger_remove_filter = true;
        } else if (globals.selected_facets[0].length !== 1 || globals.selected_facets[0][0].value !== "( All )") {
          trigger_remove_filter = true;
        } else if (globals.selected_segments[0].length !== 1 || globals.selected_segments[0][0].value !== "( All )") {
          trigger_remove_filter = true;
        }

        if (trigger_remove_filter) {
          globals.dispatch.Emphasize(selectWithParent("#category_picker").select("option"), selectWithParent("#facet_picker").select("option"), selectWithParent("#segment_picker").select("option"));
          globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        }
      } else if (globals.filter_type === "Emphasize") {
        globals.active_data = globals.all_data;
        var trigger_remove_filter = false;
        if (globals.selected_categories[0].length !== 1 || globals.selected_categories[0][0].value !== "( All )") {
          trigger_remove_filter = true;
        } else if (globals.selected_facets[0].length !== 1 || globals.selected_facets[0][0].value !== "( All )") {
          trigger_remove_filter = true;
        } else if (globals.selected_segments[0].length !== 1 || globals.selected_segments[0][0].value !== "( All )") {
          trigger_remove_filter = true;
        }
        if (trigger_remove_filter) {
          globals.dispatch.remove(selectWithParent("#category_picker").select("option"), selectWithParent("#facet_picker").select("option"), selectWithParent("#segment_picker").select("option"));
          globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        }
      }
    });

    var category_filter = filter_div.append("div")
      .attr("class", "filter_div_section");

    var category_filter_header = category_filter.append("div")
      .attr("class", "filter_div_header");

    category_filter_header.append("text")
      .attr("class", "menu_label filter_label")
      .text("Category");

    category_filter_header.append("label")
      .attr("for", "category_picker")
      .style("display", "block")
      .style("margin-right", "100%")
      .attr("id", "category_picker_label")
      .append("img")
      .attr({
        name: "Filter by event category",
        class: "filter_header_icon",
        height: 30,
        width: 30,
        title: "Filter by event category",
        src: imageUrls("categories.png")
      });

    var all_categories = ["( All )"];

    category_filter.append("select")
      .attr("class", "filter_select")
      .attr("size", 8)
      .attr("id", "category_picker")
      .attr({
        multiple: true
      })
      .on("change", function () {
        globals.selected_categories = d3.select(this)
          .selectAll("option")
          .filter(function (d, i) {
            return this.selected;
          });
        if (globals.filter_type === "Hide") {
          globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        } else if (globals.filter_type === "Emphasize") {
          globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        }
      })
      .selectAll("option")
      .data(all_categories.concat(globals.categories.domain().sort()))
      .enter()
      .append("option")
      .text(function (d) { return d; })
      .property("selected", function (d, i) {
        return d === "( All )";
      });

    globals.selected_categories = selectWithParent("#category_picker")
      .selectAll("option")
      .filter(function (d, i) {
        return this.selected;
      });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS FACETS
    ---------------------------------------------------------------------------------------
    **/

    // determine facets (separate timelines) from data
    globals.facets.domain(data.map(function (d) {
      return d.facet;
    }));

    globals.facets.domain().sort();

    globals.num_facets = globals.facets.domain().length;
    globals.total_num_facets = globals.num_facets;
    globals.num_facet_cols = Math.ceil(Math.sqrt(globals.num_facets));
    globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

    logEvent("# facets: " + globals.num_facets, "preprocessing");

    var facet_filter = filter_div.append("div")
      .attr("class", "filter_div_section");

    var facet_filter_header = facet_filter.append("div")
      .attr("class", "filter_div_header");

    facet_filter_header.append("text")
      .attr("class", "menu_label filter_label")
      .text("Facet");

    facet_filter_header.append("label")
      .attr("for", "facet_picker")
      .style("display", "block")
      .style("margin-right", "100%")
      .attr("id", "facet_picker_label")
      .append("img")
      .attr({
        name: "Filter by event facet",
        class: "filter_header_icon",
        height: 30,
        width: 30,
        title: "Filter by event facet",
        src: imageUrls("facets.png")
      });

    var all_facets = ["( All )"];

    var facet_picker = facet_filter.append("select")
      .attr("class", "filter_select")
      .attr("size", 8)
      .attr("id", "facet_picker")
      .attr({
        multiple: true
      })
      .on("change", function () {
        globals.selected_facets = d3.select(this)
          .selectAll("option")
          .filter(function (d, i) {
            return this.selected;
          });
        if (globals.filter_type === "Hide") {
          globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        } else if (globals.filter_type === "Emphasize") {
          globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        }
      })
      .selectAll("option")
      .data(all_facets.concat(globals.facets.domain().sort()))
      .enter()
      .append("option")
      .text(function (d) { return d; })
      .property("selected", function (d, i) {
        return d === "( All )";
      });

    globals.selected_facets = selectWithParent("#facet_picker")
      .selectAll("option")
      .filter(function (d, i) {
        return this.selected;
      });

    /**
    ---------------------------------------------------------------------------------------
    PROCESS SEGMENTS
    ---------------------------------------------------------------------------------------
    **/

    // event sorting function
    data.sort(compareAscending);

    if (globals.date_granularity === "epochs") {
      data.min_start_date = globals.earliest_date;
      data.max_start_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
      data.max_end_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
    } else {
      // determine the time domain of the data along a linear quantitative scale
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });
    }

    // determine the granularity of segments
    globals.segment_granularity = getSegmentGranularity(data.min_start_date, data.max_end_date);

    data.forEach(function (item) {
      item.segment = getSegment(item.start_date);
    });

    var segment_list = getSegmentList(data.min_start_date, data.max_end_date);

    globals.present_segments.domain(segment_list.map(function (d) {
      return d;
    }));

    var segment_filter = filter_div.append("div")
      .attr("class", "filter_div_section");

    var segment_filter_header = segment_filter.append("div")
      .attr("class", "filter_div_header");

    segment_filter_header.append("text")
      .attr("class", "menu_label filter_label")
      .text("Segment");

    segment_filter_header.append("label")
      .attr("for", "segment_picker")
      .style("display", "block")
      .style("margin-right", "100%")
      .attr("id", "segment_picker_label")
      .append("img")
      .attr({
        name: "Filter by chronological segment",
        class: "filter_header_icon",
        height: 30,
        width: 30,
        title: "Filter by chronological segment",
        src: imageUrls("segments.png")
      });

    var all_segments = ["( All )"];

    segment_filter.append("select")
      .attr("id", "segment_picker")
      .attr("class", "filter_select")
      .attr("size", 8)
      .attr({
        multiple: true
      })
      .on("change", function () {
        globals.selected_segments = d3.select(this)
          .selectAll("option")
          .filter(function (d, i) {
            return this.selected;
          });
        if (globals.filter_type === "Hide") {
          globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        } else if (globals.filter_type === "Emphasize") {
          globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
        }
      })
      .selectAll("option")
      .data(all_segments.concat(globals.present_segments.domain().sort()))
      .enter()
      .append("option")
      .text(function (d) { return d; })
      .property("selected", function (d) {
        return d === "( All )";
      });

    globals.selected_segments = selectWithParent("#segment_picker")
      .selectAll("option")
      .filter(function () {
        return this.selected;
      });

    globals.all_data = data;
    globals.active_data = globals.all_data;

    measureTimeline(globals.active_data);

    if (isStory(globals.source_format)) {
      instance.setPlaybackMode(true, false);
      drawTimeline(globals.active_data);
    } else {
      selectWithParent("#timeline_metadata_contents")
        .append("span")
        .attr("class", "metadata_title")
        .style("text-decoration", "underline")
        .text("About this data:");

      selectWithParent("#timeline_metadata_contents")
        .append("div")
        .attr("class", "timeline_metadata_contents_div")
        .html("<p class='metadata_content'><img src='" + imageUrls("timeline.png") + "' width='36px' style='float: left; padding-right: 5px;'/><strong>Cardinality & extent</strong>: " +
        globals.active_data.length + " unique events spanning " + globals.range_text + " <br><strong>Granularity</strong>: " + globals.segment_granularity + "</p>");

      var category_metadata = selectWithParent("#timeline_metadata_contents")
        .append("div")
        .attr("class", "timeline_metadata_contents_div")
        .style("border-top", "1px dashed #999");

      var category_metadata_p = category_metadata
        .append("p")
        .attr("class", "metadata_content")
        .html("<img src='" + imageUrls("categories.png") + "' width='36px' style='float: left; padding-right: 5px;'/><strong>Event categories</strong>: ( " + globals.num_categories + " ) <em><strong>Note</strong>: click on the swatches to assign custom colors to categories.</em><br>");

      var category_metadata_element = category_metadata_p.selectAll(".category_element")
        .data(globals.categories.domain().sort())
        .enter()
        .append("g")
        .attr("class", "category_element");

      category_metadata_element.append("div")
        .attr("class", "colorpicker_wrapper")
        .attr("filter", "url(#drop-shadow)")
        .style("background-color", globals.categories)
        .on("click", function (d, i) {
          var colorEle = this;
          instance._colorPicker.show(this, globals.categories(d), function (value) {
            // Update the display
            d3.select(colorEle).style("background-color", value);

            instance.setCategoryColor(d, i, value);
          });
        });
      //   .append("input")
      //   .attr("type", "color")
      //   .attr("class", "colorpicker")
      //   .attr("value", globals.categories)
      //   .on("change", function (d, i) {

      //   });

      category_metadata_element.append("span")
        .attr("class", "metadata_content")
        .style("float", "left")
        .text(function (d) {
          return " " + d + " ..";
        });

      category_metadata.append("p")
        .html("<br>");

      selectWithParent("#timeline_metadata_contents")
        .append("div")
        .attr("class", "timeline_metadata_contents_div")
        .style("border-top", "1px dashed #999")
        .html(
        "<p class='metadata_content'><img src='" + imageUrls("facets.png") + "' width='36px' style='float: left; padding-right: 5px;'/><strong>Timeline facets</strong>: " +
        ((globals.facets.domain().length > 1) ? ("( " + globals.num_facets + " ) " + globals.facets.domain().slice(0, 30).join(" .. ")) : "(none)") + "</p>");


      timeline_metadata.style("display", "inline");
    }
  }

  /**
  ---------------------------------------------------------------------------------------
  SELECT SCALE
  ---------------------------------------------------------------------------------------
  **/

  selectAllWithParent("#scale_picker input[name=scale_rb]").on("change", function () {
    instance.clearCanvas();

    logEvent("scale change: " + this.value, "scale_change");

    determineSize(globals.active_data, this.value, timeline_vis.tl_layout(), timeline_vis.tl_representation());

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance.options.animations ? 1200 : 0)
      .tl_scale(this.value)
      .height(globals.height)
      .width(globals.width));

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SELECT LAYOUT
  ---------------------------------------------------------------------------------------
  **/

  selectAllWithParent("#layout_picker input[name=layout_rb]").on("change", function () {
    instance.clearCanvas();

    logEvent("layout change: " + this.value, "layout_change");

    determineSize(globals.active_data, timeline_vis.tl_scale(), this.value, timeline_vis.tl_representation());

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance.options.animations ? 1200 : 0)
      .tl_layout(this.value)
      .height(globals.height)
      .width(globals.width));

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SELECT REPRESENTATION
  ---------------------------------------------------------------------------------------
  **/

  selectAllWithParent("#representation_picker input[name=representation_rb]").on("change", function () {
    instance.clearCanvas();

    logEvent("representation change: " + this.value, "representation_change");

    if (timeline_vis.tl_layout() === "Segmented") {
      if (this.value === "Grid") {
        globals.segment_granularity = "centuries";
      } else if (this.value === "Calendar") {
        globals.segment_granularity = "weeks";
      } else {
        globals.segment_granularity = getSegmentGranularity(globals.global_min_start_date, globals.global_max_end_date);
      }
    }

    determineSize(globals.active_data, timeline_vis.tl_scale(), timeline_vis.tl_layout(), this.value);

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance.options.animations ? 1200 : 0)
      .tl_representation(this.value)
      .height(globals.height)
      .width(globals.width));

    if (timeline_vis.tl_representation() === "Curve" && !globals.dirty_curve) {
      selectWithParent(".timeline_frame").style("cursor", "crosshair");
    } else {
      selectWithParent(".timeline_frame").style("cursor", "auto");
    }

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());
  });

  /**
  ---------------------------------------------------------------------------------------
  SCENE transitions
  ---------------------------------------------------------------------------------------
  **/

  function recordScene() {
    selectAllWithParent("foreignObject").remove();

    selectWithParent("#stepper_svg_placeholder").remove();

    globals.record_width = globals.width;
    globals.record_height = globals.height;

    logEvent("scene " + (globals.current_scene_index + 2) + " recorded: " + timeline_vis.tl_representation() + " / " + timeline_vis.tl_scale() + " / " + timeline_vis.tl_layout(), "record");

    var scene_captions = [];
    var scene_images = [];
    var scene_annotations = [];
    var scene_selections = [];

    main_svg.selectAll(".timeline_caption")[0].forEach(function (caption) {
      var scene_caption = {
        caption_id: caption.id
      };
      scene_captions.push(scene_caption);
    });

    main_svg.selectAll(".timeline_image")[0].forEach(function (image) {
      var scene_image = {
        image_id: image.id
      };
      scene_images.push(scene_image);
    });

    main_svg.selectAll(".event_annotation")[0].forEach(function (annotation) {
      var scene_annotation = {
        annotation_id: annotation.id
      };
      scene_annotations.push(scene_annotation);
    });

    main_svg.selectAll(".timeline_event_g")[0].forEach(function (event) {
      if (event.__data__.selected === true) {
        scene_selections.push(event.__data__.event_id);
      }
    });

    for (var i = 0; i < globals.scenes.length; i++) {
      if (globals.scenes[i].s_order > globals.current_scene_index) {
        globals.scenes[i].s_order++;
      }
    }

    var scene = {
      s_width: globals.width,
      s_height: globals.height,
      s_scale: timeline_vis.tl_scale(),
      s_layout: timeline_vis.tl_layout(),
      s_representation: timeline_vis.tl_representation(),
      s_categories: globals.selected_categories,
      s_facets: globals.selected_facets,
      s_segments: globals.selected_segments,
      s_filter_type: globals.filter_type,
      s_legend_x: globals.legend_x,
      s_legend_y: globals.legend_y,
      s_legend_expanded: globals.legend_expanded,
      s_captions: scene_captions,
      s_images: scene_images,
      s_annotations: scene_annotations,
      s_selections: scene_selections,
      s_timecurve: selectWithParent("#timecurve").attr("d"),
      s_order: globals.current_scene_index + 1
    };
    globals.scenes.push(scene);

    globals.current_scene_index++;

    svgImageUtils.svgAsPNG(document.querySelector(".timeline_storyteller #main_svg"), globals.gif_index, { backgroundColor: "white" });

    var checkExist = setInterval(function () {
      if (document.getElementById("gif_frame" + globals.gif_index) !== null) {
        log("gif_frame" + globals.gif_index + " Exists!");
        globals.scenes[globals.scenes.length - 1].s_src = document.getElementById("gif_frame" + globals.gif_index).src;
        document.getElementById("gif_frame" + globals.gif_index).remove();
        globals.gif_index++;
        updateNavigationStepper();
        clearInterval(checkExist);
      }
    }, 100); // check every 100ms

    return true;
  }

  function updateNavigationStepper() {
    var STEPPER_STEP_WIDTH = 50;

    var navigation_step_svg = selectWithParent("#stepper_svg");

    var navigation_step = navigation_step_svg.selectAll(".framePoint")
      .data(globals.scenes);

    navigation_step.exit().transition()
      .delay(1000)
      .remove();

    var navigation_step_update = navigation_step.transition()
      .duration(instance.options.animations ? 1000 : 0);

    var navigation_step_enter = navigation_step.enter()
      .append("g")
      .attr("class", "framePoint")
      .attr("id", function (d) {
        return "frame" + d.s_order;
      })
      .attr("transform", function (d) {
        return "translate(" + (d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5) + ",0)";
      })
      .style("cursor", "pointer");

    navigation_step_update.attr("transform", function (d, i) {
      return "translate(" + (d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5) + ",0)";
    })
      .attr("id", function (d) {
        return "frame" + d.s_order;
      });

    navigation_step_enter.append("title")
      .text(function (d) {
        return "Scene " + (d.s_order + 1);
      });

    navigation_step_update.select("title")
      .text(function (d) {
        return "Scene " + (d.s_order + 1);
      });

    navigation_step_enter.append("rect")
      .attr("fill", "white")
      .attr("width", STEPPER_STEP_WIDTH)
      .attr("height", STEPPER_STEP_WIDTH)
      .style("stroke", function (d) {
        return d.s_order === globals.current_scene_index ? "#f00" : "#ccc";
      })
      .style("stroke-width", "3px");

    navigation_step_update.select("rect")
      .style("stroke", function (d) {
        return d.s_order === globals.current_scene_index ? "#f00" : "#ccc";
      });

    navigation_step_enter.append("svg:image")
      .attr("xlink:href", function (d) {
        return d.s_src;
      })
      .attr("x", 2)
      .attr("y", 2)
      .attr("width", STEPPER_STEP_WIDTH - 4)
      .attr("height", STEPPER_STEP_WIDTH - 4)
      .on("click", function (d) {
        globals.current_scene_index = +d3.select(this.parentNode).attr("id").substr(5);
        changeScene(globals.current_scene_index);
      });

    var navigation_step_delete = navigation_step_enter.append("g")
      .attr("class", "scene_delete")
      .style("opacity", 0);

    navigation_step_delete.append("svg:image")
      .attr("class", "annotation_control annotation_delete")

      .attr("title", "Delete Scene")
      .attr("x", STEPPER_STEP_WIDTH - 17)
      .attr("y", 2)
      .attr("width", 15)
      .attr("height", 15)
      .attr("xlink:href", imageUrls("delete.png", true));

    navigation_step_delete.append("rect")
      .attr("title", "Delete Scene")
      .attr("x", STEPPER_STEP_WIDTH - 17)
      .attr("y", 2)
      .attr("width", 15)
      .attr("height", 15)
      .on("mouseover", function () {
        d3.select(this).style("stroke", "#f00");
      })
      .on("mouseout", function () {
        d3.select(this).style("stroke", "#ccc");
      })
      .on("click", function (d) {
        selectWithParent("#frame" + d.s_order).remove();
        selectAllWithParent(".frame_hover").remove();
        // delete current scene unless image or caption div is open
        logEvent("scene " + (d.s_order + 1) + " deleted.", "deletion");

        for (var j = 0; j < globals.scenes.length; j++) {
          if (globals.scenes[j].s_order === d.s_order) {
            globals.scenes.splice(j, 1);
          }
        }

        for (var j = 0; j < globals.scenes.length; j++) {
          if (globals.scenes[j].s_order > d.s_order) {
            globals.scenes[j].s_order--;
          }
        }

        if (globals.current_scene_index > d.s_order) {
          globals.current_scene_index--;
        }

        updateNavigationStepper();

        if (globals.current_scene_index === d.s_order) { // is current scene to be deleted?
          if (globals.current_scene_index === globals.scenes.length - 1) { // is it the final scene?
            globals.current_scene_index = 0; // set current scene to first scene
          } else { // current scene is not the last scene
            globals.current_scene_index--; // set current scene to previous scene
            if (globals.current_scene_index < 0) { // did you delete the first scene?
              globals.current_scene_index = globals.scenes.length - 1; // set current to last scene
            }
          }

          if (globals.scenes.length === 0) { // are there no more scenes left?
            globals.current_scene_index = -1; // set current scene to -1
          } else {
            changeScene(globals.current_scene_index);
          }
        }
      })
      .append("title")
      .text("Delete Scene");

    navigation_step_svg.selectAll(".framePoint")
      .on("mouseover", function (d, i) {
        var x_pos = d3.min([(d.s_order * STEPPER_STEP_WIDTH + d.s_order * 5) + 100, instance._component_width - globals.margin.right - globals.margin.left - getScrollbarWidth() - 300]);

        var img_src = d3.select(this).select("image").attr("href");

        d3.select(this).select("rect")
          .style("stroke", "#666");

        d3.select(this).select(".scene_delete")
          .style("opacity", 1);

        selectWithParent().append("div")
          .attr("class", "frame_hover")
          .style("left", x_pos + "px")
          .style("top", (instance._component_height - globals.margin.bottom - 300 + window.scrollY) + "px")
          .append("svg")
          .style("padding", "0px")
          .style("width", "300px")
          .style("height", "300px")
          .append("svg:image")
          .attr("xlink:href", img_src)
          .attr("x", 2)
          .attr("y", 2)
          .attr("width", 296)
          .attr("height", 296);
      })
      .on("mouseout", function (d, i) {
        d3.select(this).select(".scene_delete")
          .style("opacity", 0);

        if (d.s_order === globals.current_scene_index) {
          d3.select(this).select("rect")
            .style("stroke", function () {
              return "#f00";
            });
        } else {
          d3.select(this).select("rect")
            .style("stroke", function () {
              return "#ccc";
            });
        }

        selectAllWithParent(".frame_hover").remove();
      });

    navigation_step_svg.attr("width", (globals.scenes.length + 1) * (STEPPER_STEP_WIDTH + 5));
  }

  var prevTransitioning = false;
  function changeScene(scene_index) {

    // Assume we are waiting for transitions if there is already one going.
    var waitForTransitions = prevTransitioning;

    updateNavigationStepper();

    var scene_found = false,
      i = 0,
      scene = globals.scenes[0];

    while (!scene_found && i < globals.scenes.length) {
      if (globals.scenes[i].s_order === scene_index) {
        scene_found = true;
        scene = globals.scenes[i];
      }
      i++;
    }

    selectWithParent("#timecurve").style("visibility", "hidden");

    if (scene.s_representation === "Curve") {
      selectWithParent("#timecurve").attr("d", globals.scenes[scene_index].s_timecurve);
      timeline_vis.render_path(globals.scenes[scene_index].s_timecurve);
      timeline_vis.reproduceCurve();
    }

    // is the new scene a segmented grid or calendar? if so, re-segment the events
    if (scene.s_layout === "Segmented") {
      if (scene.s_representation === "Grid") {
        globals.segment_granularity = "centuries";
      } else if (scene.s_representation === "Calendar") {
        globals.segment_granularity = "weeks";
      } else {
        globals.segment_granularity = getSegmentGranularity(globals.global_min_start_date, globals.global_max_end_date);
      }
    }

    // set a delay for annotations and captions based on whether the scale, layout, or representation changes
    if (timeline_vis.tl_scale() !== scene.s_scale || timeline_vis.tl_layout() !== scene.s_layout || timeline_vis.tl_representation() !== scene.s_representation) {
      waitForTransitions = true;
      prevTransitioning = true;

      // how big is the new scene?
      determineSize(globals.active_data, scene.s_scale, scene.s_layout, scene.s_representation);

      // resize the main svg to accommodate the scene
      adjustSvgSize();

      // set the scene's scale, layout, representation
      timeline_vis.tl_scale(scene.s_scale)
        .tl_layout(scene.s_layout)
        .tl_representation(scene.s_representation)

        // Uses EFFECTIVE_HEIGHT
        .height(d3.max([globals.height, scene.s_height, (instance._render_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth())]))
        .width(d3.max([globals.width, scene.s_width]));
    }

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    // initilaize scene filter settings
    var scene_category_values = [],
      scene_facet_values = [],
      scene_segment_values = [];

    // which categories are shown in the scene?
    scene.s_categories[0].forEach(function (item) {
      scene_category_values.push(item.__data__);
    });

    // update the category picker
    selectWithParent("#category_picker")
      .selectAll("option")
      .property("selected", function (d) {
        return scene_category_values.indexOf(d) !== -1;
      });

    // which facets are shown in the scene?
    scene.s_facets[0].forEach(function (item) {
      scene_facet_values.push(item.__data__);
    });

    // update the facet picker
    selectWithParent("#facet_picker")
      .selectAll("option")
      .property("selected", function (d) {
        return scene_facet_values.indexOf(d) !== -1;
      });

    // which segments are shown in the scene?
    scene.s_segments[0].forEach(function (item) {
      scene_segment_values.push(item.__data__);
    });

    // update the segment picker
    selectWithParent("#segment_picker")
      .selectAll("option")
      .property("selected", function (d) {
        return scene_segment_values.indexOf(d) !== -1;
      });

    // if filters change in "remove" mode, delay annoations and captions until after transition
    var scene_filter_set_length = scene_category_values.length + scene_facet_values.length + scene_segment_values.length;

    if (scene.s_filter_type === "Hide") {
      scene_filter_set_length += 1;
    }

    if (scene_filter_set_length !== globals.filter_set_length) {
      globals.filter_set_length = scene_filter_set_length;
      waitForTransitions = true;
      prevTransitioning = true;
    }

    globals.selected_categories = scene.s_categories;
    globals.selected_facets = scene.s_facets;
    globals.selected_segments = scene.s_segments;

    // what type of filtering is used in the scene?
    if (scene.s_filter_type === "Hide") {
      selectAllWithParent("#filter_type_picker input[name=filter_type_rb]")
        .property("checked", function (d) {
          return d === "Hide";
        });
      if (globals.filter_type === "Emphasize") {
        globals.dispatch.Emphasize(selectWithParent("#category_picker").select("option"), selectWithParent("#facet_picker").select("option"), selectWithParent("#segment_picker").select("option"));
      }
      globals.filter_type = "Hide";
      globals.dispatch.remove(globals.selected_categories, globals.selected_facets, globals.selected_segments);
    } else if (scene.s_filter_type === "Emphasize") {
      selectAllWithParent("#filter_type_picker input[name=filter_type_rb]")
        .property("checked", function (d) {
          return d === "Emphasize";
        });
      if (globals.filter_type === "Hide") {
        globals.active_data = globals.all_data;
        globals.dispatch.remove(selectWithParent("#category_picker").select("option"), selectWithParent("#facet_picker").select("option"), selectWithParent("#segment_picker").select("option"));
      }
      globals.filter_type = "Emphasize";
      globals.dispatch.Emphasize(globals.selected_categories, globals.selected_facets, globals.selected_segments);
    }

    // where is the legend in the scene?
    selectWithParent(".legend")
      .transition()
      .duration(instance.options.animations ? 1200 : 0)
      .style("z-index", 1)
      .attr("x", scene.s_legend_x)
      .attr("y", scene.s_legend_y);

    globals.legend_x = scene.s_legend_x;
    globals.legend_y = scene.s_legend_y;

    main_svg.selectAll(".timeline_caption").remove();

    main_svg.selectAll(".timeline_image").remove();

    main_svg.selectAll(".event_annotation").remove();

    selectAllWithParent(".timeline_event_g").each(function () {
      this.__data__.selected = false;
    });

    selectAllWithParent(".event_span")
      .attr("filter", "none")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");

    selectAllWithParent(".event_span_component")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");

    function loadAnnotations() {
      prevTransitioning = false;

      log("Loading Annotations");
      if (globals.current_scene_index !== scene_index) {
        return;
      }

      // is the legend expanded in this scene?
      globals.legend_expanded = scene.s_legend_expanded;
      if (scene.s_legend_expanded) {
        expandLegend();
      } else {
        collapseLegend();
      }

      /**
       * Creates a mapper, that adds a type property
       * @param {string} type The type of the item
       * @returns {object}
       */
      function mapWithType(type) {
        return function (item) {
          return {
            type: type,
            item: item
          };
        };
      }

      var captionAnnos = globals.caption_list.map(mapWithType("caption"));
      var imageAnnos = globals.image_list.map(mapWithType("image"));
      var textAnnos = globals.annotation_list.map(mapWithType("annotation"));

      // TODO: this would be better if the scenes had a more generic property called "annotations", that have a list of all the
      // annotations that had a "type" property

      // These are are technically annotations, just different types, so concat them all together
      captionAnnos.concat(imageAnnos).concat(textAnnos)
        .filter(function (anno) { // Filter out annotations not on this scene
          // Basically maps the type to scene.s_images or scene.s_annotations or scene.s_captions
          var sceneList = scene["s_" + anno.type + "s"];

          for (var i = 0; i < sceneList.length; i++) {
            // Basically the id property in the scene, so image_id or caption_id or annotation_id
            if (sceneList[i][anno.type + "_id"] === anno.item.id) {
              return true;
            }
          }
        })

        // We sort the annotations by z-order, and add the annotations in that order
        // this is important cause with svgs, the order in which elements are added dictates their z-index
        .sort(function (a, b) { return (a.item.z_index || 0) - (b.item.z_index || 0); })

        // Iterate through all of our annotations
        .forEach(function (anno) {
          var item = anno.item;
          if (anno.type === "caption") {
            addCaption(item.caption_text, item.caption_width * 1.1, item.x_rel_pos, item.y_rel_pos, item.c_index);
          } else if (anno.type === "image") {
            addImage(timeline_vis, item.i_url, item.x_rel_pos, item.y_rel_pos, item.i_width, item.i_height, item.i_index);
          } else {
            var itemSel = selectWithParent("#event_g" + item.item_index).select("rect.event_span");
            var itemEle = itemSel[0][0].__data__,
              item_x_pos = 0,
              item_y_pos = 0;

            if (scene.s_representation !== "Radial") {
              item_x_pos = itemEle.rect_x_pos + itemEle.rect_offset_x + globals.padding.left + globals.unit_width * 0.5;
              item_y_pos = itemEle.rect_y_pos + itemEle.rect_offset_y + globals.padding.top + globals.unit_width * 0.5;
            } else {
              item_x_pos = itemEle.path_x_pos + itemEle.path_offset_x + globals.padding.left;
              item_y_pos = itemEle.path_y_pos + itemEle.path_offset_y + globals.padding.top;
            }

            annotateEvent(timeline_vis, item.content_text, item_x_pos, item_y_pos, item.x_offset, item.y_offset, item.x_anno_offset, item.y_anno_offset, item.label_width, item.item_index, item.count);
            selectWithParent("#event" + item.item_index + "_" + item.count)
              .transition()
              .duration(instance.options.animations ? 50 : 0)
                .style("opacity", 1)
                .each(function () {
                  // If after running the transition, the scene has changed, then hide this annotation.
                  if (globals.current_scene_index !== scene_index) {
                    this.style.opacity = 0;
                  }
                });
          }
        });

      // toggle selected events in the scene
      main_svg.selectAll(".timeline_event_g")[0].forEach(function (event) {
        if (scene.s_selections.indexOf(event.__data__.event_id) !== -1) {
          event.__data__.selected = true;
          selectWithParent("#event_g" + event.__data__.event_id)
            .selectAll(".event_span")
            .attr("filter", "url(#drop-shadow)")
            .style("z-index", 1)
            .style("stroke", "#f00")
            .style("stroke-width", "1.25px");
          selectWithParent("#event_g" + event.__data__.event_id)
            .selectAll(".event_span_component")
            .style("z-index", 1)
            .style("stroke", "#f00")
            .style("stroke-width", "1px");
        } else {
          event.__data__.selected = false;
          selectWithParent("#event_g" + event.__data__.event_id)
            .selectAll(".event_span")
            .attr("filter", "none")
            .style("stroke", "#fff")
            .style("stroke-width", "0.25px");
          selectWithParent("#event_g" + event.__data__.event_id)
            .selectAll(".event_span_component")
            .style("stroke", "#fff")
            .style("stroke-width", "0.25px");
        }
      });

      if (timeline_vis.tl_representation() !== "Curve") {
        selectWithParent("#timecurve").style("visibility", "hidden");
      } else {
        selectWithParent("#timecurve").style("visibility", "visible");
      }

      main_svg.style("visibility", "visible");
    }

    // delay the appearance of captions and annotations if the scale, layout, or representation changes relative to the previous scene
    if (waitForTransitions && timeline_vis.currentTransition) {
      log("Waiting for transitions");
      onTransitionComplete(timeline_vis.currentTransition, loadAnnotations);
    } else {
      loadAnnotations();
    }
  }

  function measureTimeline(data) {
    /**
    ---------------------------------------------------------------------------------------
    SORT AND NEST THE EVENTS
    ---------------------------------------------------------------------------------------
    **/

    // event sorting function
    data.sort(compareAscending);

    if (globals.date_granularity === "epochs") {
      data.min_start_date = globals.earliest_date;
      data.max_start_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
      data.max_end_date = d3.max([globals.latest_start_date, globals.latest_end_date]);
    } else {
      // determine the time domain of the data along a linear quantitative scale
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return time.minute.floor(d.end_date);
      });
    }

    if (globals.date_granularity === "epochs") {
      var format = function (d) {
        return globals.formatAbbreviation(d);
      };
      globals.range_text = format(data.max_end_date.valueOf() - data.min_start_date.valueOf()) + " years" +
        ": " + data.min_start_date.valueOf() + " - " + data.max_end_date.valueOf();
    } else {
      globals.range_text = moment(data.min_start_date).from(moment(data.max_end_date), true) +
        ": " + moment(data.min_start_date).format("YYYY-MM-DD") + " - " + moment(data.max_end_date).format("YYYY-MM-DD");
    }

    logEvent("range: " + globals.range_text, "preprocessing");

    // create a nested data structure to contain faceted data
    globals.timeline_facets = d3.nest()
      .key(function (d) {
        return d.facet;
      })
      .sortKeys(d3.ascending)
      .entries(data);

    // get event durations
    data.forEach(function (item) {
      if (globals.date_granularity === "days") {
        item.duration = d3.time.days(item.start_date, item.end_date).length;
      } else if (globals.date_granularity === "years") {
        item.duration = item.end_date.getUTCFullYear() - item.start_date.getUTCFullYear();
      } else if (globals.date_granularity === "epochs") {
        item.duration = item.end_date.valueOf() - item.start_date.valueOf();
      }
    });

    data.max_duration = d3.max(data, function (d) {
      return d.duration;
    });

    data.min_duration = d3.min(data, function (d) {
      return d.duration;
    });

    logEvent("max event duration: " + data.max_duration + " " + globals.date_granularity, "preprocessing");

    logEvent("min event duration: " + data.min_duration + " " + globals.date_granularity, "preprocessing");

    // determine the granularity of segments
    globals.segment_granularity = getSegmentGranularity(data.min_start_date, data.max_end_date);

    logEvent("segment granularity: " + globals.segment_granularity, "preprocessing");

    var segment_list = getSegmentList(data.min_start_date, data.max_end_date);

    globals.segments.domain(segment_list.map(function (d) {
      return d;
    }));

    logEvent("segments (" + globals.segments.domain().length + "): " + globals.segments.domain(), "preprocessing");

    globals.num_segments = globals.segments.domain().length;
    globals.num_segment_cols = Math.ceil(Math.sqrt(globals.num_segments));
    globals.num_segment_rows = Math.ceil(globals.num_segments / globals.num_segment_cols);
  }

  function isStory(sf) {
    return sf.indexOf("story") >= 0;
  }

  /**
   * Renders the timeline
   * @param {object[]} data The data to render
   */
  function drawTimeline(data) {
    selectWithParent("#timeline_metadata").style("display", "none");
    selectWithParent("#timeline_metadata_contents").html("");
    instance.importPanel.hide();

    /**
    ---------------------------------------------------------------------------------------
    CALL STANDALONE TIMELINE VISUALIZATIONS
    ---------------------------------------------------------------------------------------
    **/

    control_panel.selectAll("input").attr("class", "img_btn_enabled");
    selectWithParent("#navigation_div").style("bottom", (instance.options.showAbout === false || globals.playback_mode) ? "20px" : "50px");
    selectWithParent("#filter_type_picker").selectAll("input").property("disabled", false);
    selectWithParent("#filter_type_picker").selectAll("img").attr("class", "img_btn_enabled");
    selectWithParent("#playback_bar").selectAll("img").attr("class", "img_btn_enabled");

    if (isStory(globals.source_format)) {
      selectWithParent("#record_scene_btn").attr("class", "img_btn_disabled");
      timeline_vis.tl_scale(globals.scenes[0].s_scale)
        .tl_layout(globals.scenes[0].s_layout)
        .tl_representation(globals.scenes[0].s_representation);
    } else {
      selectWithParent("#menu_div").style("left", 10 + "px");
    }

    updateRadioBttns(timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    determineSize(data, timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    adjustSvgSize();

    globals.global_min_start_date = data.min_start_date;
    globals.global_max_end_date = data.max_end_date;

    main_svg.datum(data)
      .call(timeline_vis.duration(instance.options.animations ? 1200 : 0).height(globals.height).width(globals.width));

    if (isStory(globals.source_format)) {
      globals.current_scene_index = 0;
      changeScene(0);
    }

    if (globals.legend_panel) {
      globals.legend_panel.remove();
      globals.legend_panel = undefined;
    }

    if (globals.num_categories <= 12 && globals.num_categories > 1) {
      // setup legend
      globals.legend_panel = main_svg.append("svg")
        .attr("height", 35 + globals.track_height * (globals.num_categories + 1) + 5)
        .attr("width", globals.max_legend_item_width + 10 + globals.unit_width + 10 + 20)
        .attr("id", "legend_panel")
        .attr("class", "legend")
        .on("mouseover", function () {
          // if (selectAllWithParent("foreignObject")[0].length === 0) {
          //   addLegendColorPicker();
          // }
          d3.select(this).select(".legend_rect").attr("filter", "url(#drop-shadow)");
          d3.select(this).select("#legend_expand_btn").style("opacity", 1);
        })
        .on("mouseout", function () {
          d3.select(this).select(".legend_rect").attr("filter", "none");
          d3.select(this).select("#legend_expand_btn").style("opacity", 0.1);
        })
        .call(legendDrag);

      globals.legend_panel.append("rect")
        .attr("class", "legend_rect")
        .attr("height", globals.track_height * (globals.num_categories + 1))
        .attr("width", globals.max_legend_item_width + 5 + globals.unit_width + 10)
        .append("title")
        .text("Click on a color swatch to select a custom color for that category.");

      globals.legend_panel.append("svg:image")
        .attr("id", "legend_expand_btn")
        .attr("x", globals.max_legend_item_width + 5 + globals.unit_width - 10)
        .attr("y", 0)
        .attr("width", 20)
        .attr("height", 20)
        .attr("xlink:href", imageUrls("min.png", true))
        .style("cursor", "pointer")
        .style("opacity", 0.1)
        .on("click", function () {
          if (globals.legend_expanded) {
            logEvent("legend minimized", "legend");

            globals.legend_expanded = false;
            collapseLegend();
          } else {
            logEvent("legend expanded", "legend");

            globals.legend_expanded = true;
            expandLegend();
          }
        })
        .append("title")
        .text("Expand / collapse legend.");

      var legendElementContainer = globals.legend_panel.selectAll(".legend_element_g").data(globals.categories.domain().sort());
      globals.legend = legendElementContainer
        .enter()
        .append("g")
        .attr("class", "legend_element_g");

      // Remove the element when not data bound.
      legendElementContainer.exit().remove();

      globals.legend.append("title")
        .text(function (d) {
          return d;
        });

      globals.legend.attr("transform", function (d, i) {
        return ("translate(0," + (35 + (i + 1) * globals.track_height) + ")");
      });

      globals.legend.on("mouseover", function (d) {
        var hovered_legend_element = d;

        logEvent("legend hover: " + hovered_legend_element, "legend");

        d3.select(this).select("rect").style("stroke", "#f00");
        d3.select(this).select("text").style("font-weight", "bolder")
          .style("fill", "#f00");
        selectAllWithParent(".timeline_event_g").each(function (d) {
          if (d.category === hovered_legend_element || d.selected) {
            d3.select(this).selectAll(".event_span")
              .style("stroke", "#f00")
              .style("stroke-width", "1.25px")
              .attr("filter", "url(#drop-shadow)");
            d3.select(this).selectAll(".event_span_component")
              .style("stroke", "#f00")
              .style("stroke-width", "1px");
          } else {
            d3.select(this).selectAll(".event_span")
              .attr("filter", "url(#greyscale)");
            d3.select(this).selectAll(".event_span_component")
              .attr("filter", "url(#greyscale)");
          }
        });
      });

      globals.legend.on("mouseout", function (d) {
        d3.select(this).select("rect").style("stroke", "#fff");
        d3.select(this).select("text").style("font-weight", "normal")
          .style("fill", "#666");
        selectAllWithParent(".timeline_event_g").each(function (d) {
          d3.select(this).selectAll(".event_span")
            .style("stroke", "#fff")
            .style("stroke-width", "0.25px")
            .attr("filter", "none");
          d3.select(this).selectAll(".event_span_component")
            .style("stroke", "#fff")
            .style("stroke-width", "0.25px")
            .attr("filter", "none");
          if (d.selected) {
            d3.select(this)
              .selectAll(".event_span")
              .attr("filter", "url(#drop-shadow)")
              .style("stroke", "#f00")
              .style("stroke-width", "1.25px");
            d3.select(this)
              .selectAll(".event_span_component")
              .style("stroke", "#f00")
              .style("stroke-width", "1px");
          }
        });
      });

      globals.legend.append("rect")
        .attr("class", "legend_element")
        .attr("x", globals.legend_spacing)
        .attr("y", 2)
        .attr("width", globals.legend_rect_size)
        .attr("height", globals.legend_rect_size)
        .attr("transform", "translate(0,-35)")
        .style("fill", globals.categories)
        .on("click", function (d, i) {
          var colorEle = this;
          instance._colorPicker.show(this, globals.categories(d), function (value) {

            // Update the display
            selectWithParent(".legend").selectAll(".legend_element_g rect").each(function () {
              if (this.__data__ === d) {
                d3.select(colorEle).style("fill", value);
              }
            });

            instance.setCategoryColor(d, i, value);

            if (main_svg && timeline_vis) {
              main_svg.call(timeline_vis.duration(instance.options.animations ? 1200 : 0));
            }
          });
        })
        .append("title");

      globals.legend.append("text")
        .attr("class", "legend_element")
        .attr("x", globals.legend_rect_size + 2 * globals.legend_spacing)
        .attr("y", globals.legend_rect_size - globals.legend_spacing)
        .attr("dy", 3)
        .style("fill-opacity", "1")
        .style("display", "inline")
        .attr("transform", "translate(0,-35)")
        .text(function (d) {
          return d;
        });

      globals.legend_panel.append("text")
        .text("LEGEND")
        .attr("class", "legend_title")
        .attr("dy", "1.4em")
        .attr("dx", "0em")
        .attr("transform", "translate(5,0)rotate(0)");
    }
  }

  instance._drawTimeline = drawTimeline;

  function expandLegend() {
    selectWithParent(".legend")
      .transition()
      .duration(instance.options.animations ? 500 : 0);
    selectWithParent(".legend").select(".legend_rect")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("height", globals.track_height * (globals.num_categories + 1))
      .attr("width", globals.max_legend_item_width + 5 + globals.unit_width + 10);
    selectWithParent(".legend").select("#legend_expand_btn")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("x", globals.max_legend_item_width + 5 + globals.unit_width - 10);
    selectWithParent(".legend").select(".legend_title")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("dx", "0em")
      .attr("transform", "translate(5,0)rotate(0)");
    selectWithParent(".legend").selectAll(".legend_element_g text")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .style("fill-opacity", "1")
      .style("display", "inline")
      .attr("transform", "translate(0,-35)");
    selectWithParent(".legend").selectAll(".legend_element_g rect")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("transform", "translate(0,-35)");
    selectWithParent(".legend").selectAll(".legend_element_g foreignObject")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("transform", "translate(" + globals.legend_spacing + ",-35)");
  }

  function collapseLegend() {
    selectWithParent(".legend")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .style("z-index", 1);
    selectWithParent(".legend").select(".legend_rect")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("height", 35 + globals.track_height * (globals.num_categories + 1))
      .attr("width", 25);
    selectWithParent(".legend").select("#legend_expand_btn")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("x", 25);
    selectWithParent(".legend").select(".legend_title")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("dx", "-4.3em")
      .attr("transform", "translate(0,0)rotate(270)");
    selectWithParent(".legend").selectAll(".legend_element_g text")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .style("fill-opacity", "0")
      .style("display", "none")
      .attr("transform", "translate(0,0)");
    selectWithParent(".legend").selectAll(".legend_element_g rect")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("transform", "translate(0,0)");
    selectWithParent(".legend").selectAll(".legend_element_g foreignObject")
      .transition()
      .duration(instance.options.animations ? 500 : 0)
      .attr("transform", "translate(" + globals.legend_spacing + ",0)");
  }

  /**

  --------------------------------------------------------------------------------------
  TIMELINE DATA PROCESSING UTILITY FUNCTIONS
  --------------------------------------------------------------------------------------
  **/

  function parseDates(data) {
    var i = 0;

    // parse the event dates
    // assign an end date if none is provided
    data.forEach(function (item) {
      if (item.end_date === "" || item.end_date === null) { // if end_date is empty, set it to equal start_date
        item.end_date = item.start_date;
      }

      // if there are numerical dates before -9999 or after 10000, don't attempt to parse them
      if (globals.date_granularity === "epochs") {
        item.event_id = i;
        globals.active_event_list.push(i);
        i++;
        return;
      }

      // watch out for dates that start/end in BC
      var bc_start;
      var bc_end;

      // is start date a numeric year?
      if (globals.isNumber(item.start_date)) {
        if (item.start_date < 1) {// is start_date is before 1 AD?
          bc_start = item.start_date;
        }

        if (item.end_date < 1) {// is end_date is before 1 AD?
          bc_end = item.end_date;
        }

        // convert start_date to date object
        item.start_date = moment((new Date(item.start_date))).toDate();

        if (isStory(globals.source_format)) {
          item.start_date = new Date(item.start_date.valueOf() + (globals.story_tz_offset * 60000));
        } else {
          item.start_date = new Date(item.start_date.valueOf() + item.start_date.getTimezoneOffset() * 60000);
        }

        // convert end_date to date object
        item.end_date = moment((new Date(item.end_date))).toDate();

        if (isStory(globals.source_format)) {
          item.end_date = new Date(item.end_date.valueOf() + (globals.story_tz_offset * 60000));
        } else {
          item.end_date = new Date(item.end_date.valueOf() + item.end_date.getTimezoneOffset() * 60000);
        }

        item.event_id = i;
        globals.active_event_list.push(i);
        i++;

        // is end_date = start_date?
        if (item.end_date === item.start_date) {
          // if yes, set end_date to end of year
          item.end_date = moment(item.end_date).endOf("year").toDate();
        } else { // if end year given, set end_date to end of that year as date object
          item.end_date = moment(item.end_date).endOf("year").toDate();
        }

        // if start_date before 1 AD, set year manually
        if (bc_start) {
          item.start_date.setUTCFullYear(("0000" + bc_start).slice(-4) * -1);
        }

        // if end_date before 1 AD, set year manually
        if (bc_end) {
          item.end_date.setUTCFullYear(("0000" + bc_end).slice(-4) * -1);
        }
      } else { // start date is not a numeric year
        globals.date_granularity = "days";

        // check for start_date string validity
        if (moment(item.start_date).isValid()) {
          item.start_date = moment(item.start_date).startOf("hour").toDate(); // account for UTC offset
          if (isStory(globals.source_format)) {
            item.start_date = new Date(item.start_date.valueOf() + (globals.story_tz_offset * 60000));
          } else {
            item.start_date = new Date(item.start_date.valueOf() + item.start_date.getTimezoneOffset() * 60000);
          }
          item.event_id = i;
          globals.active_event_list.push(i);
          i++;
        } else {
          item.start_date = undefined;
        }

        // check for end_date string validity
        if (moment(item.end_date).isValid()) {
          item.end_date = moment(item.end_date).endOf("hour").toDate(); // account for UTC offset
          if (isStory(globals.source_format)) {
            item.end_date = new Date(item.end_date.valueOf() + (globals.story_tz_offset * 60000));
          } else {
            item.end_date = new Date(item.end_date.valueOf() + item.end_date.getTimezoneOffset() * 60000);
          }
        } else {
          item.end_date = undefined;
        }
      }

      globals.active_event_list.push(item.event_id);
      globals.prev_active_event_list.push(item.event_id);
      globals.all_event_ids.push(item.event_id);
    });
  }

  // sort events according to start / end dates
  function compareAscending(item1, item2) {
    // Every item must have two fields: 'start_date' and 'end_date'.
    var result = item1.start_date - item2.start_date;

    // later first
    if (result < 0) {
      return -1;
    }
    if (result > 0) {
      return 1;
    }

    // shorter first
    result = item2.end_date - item1.end_date;
    if (result < 0) {
      return -1;
    }
    if (result > 0) {
      return 1;
    }

    // categorical tie-breaker
    if (item1.category < item2.category) {
      return -1;
    }
    if (item1.category > item2.category) {
      return 1;
    }

    // facet tie-breaker
    if (item1.facet < item2.facet) {
      return -1;
    }
    if (item1.facet > item2.facet) {
      return 1;
    }
    return 0;
  }

  // assign a track to each event item to prevent event overlap
  function assignTracks(data, tracks, layout) {
    // reset tracks first
    data.forEach(function (item) {
      item.track = 0;
    });

    var i, track, min_width, effective_width;

    if (globals.date_granularity !== "epochs") {
      data.min_start_date = d3.min(data, function (d) {
        return d.start_date;
      });
      data.max_start_date = d3.max(data, function (d) {
        return d.start_date;
      });
      data.max_end_date = d3.max(data, function (d) {
        return d.end_date;
      });

      if (globals.width > (instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth())) {
        effective_width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
      } else {
        effective_width = globals.width;
      }


      var w = (effective_width - globals.padding.left - globals.padding.right - globals.unit_width),
        d = (data.max_end_date.getTime() - data.min_start_date.getTime());

      if (globals.segment_granularity === "days") {
        min_width = 0;
      } else if (layout === "Segmented") {
        min_width = 0;
      } else {
        min_width = (d / w * globals.unit_width);
      }
    }

    // older items end deeper
    data.forEach(function (item) {
      if (globals.date_granularity === "epochs") {
        item.track = 0;
      } else {
        for (i = 0, track = 0; i < tracks.length; i++, track++) {
          if (globals.segment_granularity === "days") {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (globals.segment_granularity === "weeks") {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (globals.segment_granularity === "months") {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (globals.segment_granularity === "years") {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (globals.segment_granularity === "decades" && globals.date_granularity === "days" && data.max_duration < 31) {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (globals.segment_granularity === "centuries" && globals.date_granularity === "days" && data.max_duration < 31) {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (globals.segment_granularity === "millenia") {
            if (item.start_date.getTime() > tracks[i].getTime()) {
              break;
            }
          } else if (item.start_date.getTime() > tracks[i].getTime()) {
            break;
          }
        }
        item.track = track;

        if (min_width > item.end_date.getTime() - item.start_date.getTime()) {
          tracks[track] = moment(item.end_date.getTime() + min_width).toDate();
        } else {
          tracks[track] = item.end_date;
        }
      }
    });

    globals.num_tracks = d3.max(data, function (d) {
      return d.track;
    });
  }

  // assign a track to each event item to prevent event overlap
  function assignSequenceTracks(data) {
    var angle = 0,
      j = 0;

    // reset tracks and indices first, assign spiral coordinates
    data.forEach(function (item) {
      item.item_index = j;
      if (!globals.dirty_curve) {
        item.curve_x = (j * globals.spiral_padding) % (globals.width - globals.margin.left - globals.margin.right - globals.spiral_padding - globals.unit_width);
        item.curve_y = Math.floor((j * globals.spiral_padding) / (globals.width - globals.margin.left - globals.margin.right - globals.spiral_padding - globals.unit_width)) * globals.spiral_padding;
      }
      item.seq_track = 0;
      item.seq_index = 0;
      var radius = Math.sqrt(j + 1);
      angle += Math.asin(1 / radius);
      j++;
      item.spiral_index = j;
      item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
      item.spiral_y = Math.sin(angle) * (radius * globals.spiral_padding);
    });

    globals.max_item_index = d3.max(data, function (d) { return d.item_index; });

    var index = 0;
    if (globals.date_granularity !== "epochs") {
      latest_start_date = data[0].start_date.getTime();
    }

    // older items end deeper
    data.forEach(function (item) {
      item.seq_index = index;
      item.seq_track = 0;
      index++;
    });

    globals.num_seq_tracks = d3.max(data, function (d) {
      return d.seq_track;
    });
  }

  // analyze each facet individually and assign within-facet tracks and relative start and end dates
  function processFacets() {
    globals.max_end_age = 0;
    globals.max_num_tracks = 0;
    globals.max_num_seq_tracks = 0;

    // calculate derived age measure for each event in each timeline
    globals.timeline_facets.forEach(function (timeline) {
      // determine maximum number of tracks for chronological and sequential scales
      assignTracks(timeline.values, [], "Faceted");
      assignSequenceTracks(timeline.values, []);
      timeline.values.num_tracks = d3.max(timeline.values, function (d) {
        return d.track;
      });
      timeline.values.num_seq_tracks = d3.max(timeline.values, function (d) {
        return d.seq_track;
      });

      if (timeline.values.num_tracks > globals.max_num_tracks) {
        globals.max_num_tracks = timeline.values.num_tracks + 1;
      }

      if (timeline.values.num_seq_tracks > globals.max_num_seq_tracks) {
        globals.max_num_seq_tracks = timeline.values.num_seq_tracks + 1;
      }

      timeline.values.min_start_date = d3.min(timeline.values, function (d) {
        return d.start_date;
      });

      var angle = 0;
      var i = 0;

      timeline.values.forEach(function (item) {
        // assign spiral coordinates
        var radius = Math.sqrt(i + 1);
        angle += Math.asin(1 / radius);
        i++;
        item.spiral_index = i;
        item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
        item.spiral_x = Math.sin(angle) * (radius * globals.spiral_padding);

        if (globals.date_granularity === "epochs") {
          item.start_age = item.start_date - timeline.values.min_start_date;
          item.start_age_label = "";
          item.end_age = item.end_date - timeline.values.min_start_date;
          item.end_age_label = "";
        } else {
          item.start_age = item.start_date - timeline.values.min_start_date;
          item.start_age_label = moment(timeline.values.min_start_date).from(moment(item.start_date), true);
          item.end_age = item.end_date - timeline.values.min_start_date;
          item.end_age_label = moment(timeline.values.min_start_date).from(moment(item.end_date), true);
        }
      });
      timeline.values.max_end_age = d3.max(timeline.values, function (d) {
        return d.end_age;
      });

      if (timeline.values.max_end_age > globals.max_end_age) {
        globals.max_end_age = timeline.values.max_end_age;
      }
    });
  }

  function getSegmentGranularity(min_date, max_date) {
    if (min_date === undefined || max_date === undefined) {
      return "";
    }

    var timeline_range,  // limit the number of facets to less than 20, rounding up / down to nearest natural temporal boundary
      days_to_years; // flag for transitioning to granularities of years or longer

    if (globals.date_granularity === "days") {
      timeline_range = time.day.count(time.day.floor(min_date), time.day.floor(max_date));

      if (timeline_range <= 7) {
        return "days";
      } else if (timeline_range > 7 && timeline_range <= 42) {
        return "weeks";
      } else if (timeline_range > 42 && timeline_range <= 732) {
        return "months";
      }
      days_to_years = true;
    }
    if (globals.date_granularity === "years" || days_to_years) {
      timeline_range = max_date.getUTCFullYear() - min_date.getUTCFullYear();

      if (timeline_range <= 10) {
        return "years";
      } else if (timeline_range > 10 && timeline_range <= 100) {
        return "decades";
      } else if (timeline_range > 100 && timeline_range <= 1000) {
        return "centuries";
      }
      return "millenia";
    } else if (globals.date_granularity === "epochs") {
      return "epochs";
    }
  }

  function getSegment(item) {
    var segment = "";

    switch (globals.segment_granularity) {
    case "days":
      segment = moment(item.end_date).format("MMM Do");
      break;
    case "weeks":
      segment = moment(item).format("WW / YY");
      break;
    case "months":
      segment = moment(item).format("MM-YY (MMM)");
      break;
    case "years":
      segment = moment(item).format("YYYY");
      break;
    case "decades":
      segment = (Math.floor(item.getUTCFullYear() / 10) * 10).toString() + "s";
      break;
    case "centuries":
      segment = (Math.floor(item.getUTCFullYear() / 100) * 100).toString() + "s";
      break;
    case "millenia":
      segment = (Math.floor(item.getUTCFullYear() / 1000) * 1000).toString() + " - " + (Math.ceil((item.getUTCFullYear() + 1) / 1000) * 1000).toString();
      break;
    case "epochs":
      segment = "";
      break;
    }
    return segment;
  }

  function getSegmentList(start_date, end_date) {
    var segments_domain = [];
    switch (globals.segment_granularity) {

    case "days":
      var day_array = d3.time.days(start_date, end_date);
      day_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "weeks":
      var week_array = d3.time.weeks(d3.time.week.floor(start_date), d3.time.week.ceil(end_date));
      week_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "months":
      var month_array = d3.time.months(d3.time.month.floor(start_date), d3.time.month.ceil(end_date));
      month_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "years":
      var year_array = d3.time.years(d3.time.year.floor(start_date), d3.time.year.ceil(end_date));
      year_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "decades":
      var min_decade_start_date = d3.time.year.floor(start_date);
      var min_decade_offset = start_date.getUTCFullYear() % 10;
      if (min_decade_offset < 0) {
        min_decade_offset += 10;
      }
      min_decade_start_date.setUTCFullYear(start_date.getUTCFullYear() - min_decade_offset);
      var decade_array = d3.time.years(d3.time.year.floor(min_decade_start_date), d3.time.year.ceil(end_date), 10);
      decade_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "centuries":
      var min_century_start_date = d3.time.year.floor(start_date);
      var min_century_offset = start_date.getUTCFullYear() % 100;
      if (min_century_offset < 0) {
        min_century_offset += 100;
      }
      min_century_start_date.setUTCFullYear(start_date.getUTCFullYear() - min_century_offset);
      var century_array = d3.time.years(d3.time.year.floor(min_century_start_date), d3.time.year.ceil(end_date), 100);
      century_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "millenia":
      var min_millenia_start_date = d3.time.year.floor(start_date);
      var min_millenia_offset = start_date.getUTCFullYear() % 1000;
      if (min_millenia_offset < 0) {
        min_millenia_offset += 1000;
      }
      min_millenia_start_date.setUTCFullYear(start_date.getUTCFullYear() - min_millenia_offset);
      var millenia_array = d3.time.years(d3.time.year.floor(min_millenia_start_date), d3.time.year.ceil(end_date), 1000);
      millenia_array.forEach(function (d) {
        segments_domain.push(getSegment(d));
      });
      break;

    case "epochs":
      segments_domain = [""];
      break;
    }
    return segments_domain;
  }

  // resizes the timeline container based on combination of scale, layout, representation
  function determineSize(data, scale, layout, representation) {
    logEvent("timeline: " + scale + " - " + layout + " - " + representation, "sizing");

    switch (representation) {

    case "Linear":
      switch (scale) {

      case "Chronological":
        switch (layout) {

        case "Unified":
            // justifiable
          assignTracks(data, [], layout);
          logEvent("# tracks: " + globals.num_tracks, "sizing");

          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = globals.num_tracks * globals.track_height + 1.5 * globals.track_height + globals.margin.top + globals.margin.bottom;
          break;

        case "Faceted":
            // justifiable
          processFacets(data);
          logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = (globals.max_num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
          break;

        case "Segmented":
            // justifiable
          assignTracks(data, [], layout);
          logEvent("# tracks: " + globals.num_tracks, "sizing");

          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = (globals.num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_segments + globals.margin.top + globals.margin.bottom;
          break;
        }
        break;

      case "Relative":
        if (layout === "Faceted") {
          // justifiable
          processFacets(data);
          logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = (globals.max_num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
        } else {
          // not justifiable
          logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Log":
        if (layout === "Unified") {
          // justifiable
          assignTracks(data, [], layout);
          logEvent("# tracks: " + globals.num_tracks, "sizing");

          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = globals.num_tracks * globals.track_height + 1.5 * globals.track_height + globals.margin.top + globals.margin.bottom;
        } else if (layout === "Faceted") {
          // justifiable
          processFacets(data);
          logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

          globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
          globals.height = (globals.max_num_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
        } else {
          // not justifiable
          logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Collapsed":
        if (layout === "Unified") {
          // justifiable
          assignSequenceTracks(data, []);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
          var bar_chart_height = (4 * globals.unit_width);
          globals.width = globals.max_seq_index * 1.5 * globals.unit_width + globals.margin.left + 3 * globals.margin.right;
          globals.height = (globals.num_seq_tracks * globals.track_height + 1.5 * globals.track_height) + bar_chart_height + globals.margin.top + globals.margin.bottom;
        } else {
          // not justifiable
          logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Sequential":
        if (layout === "Unified") {
          // justifiable
          assignSequenceTracks(data, []);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
          globals.width = d3.max([
            globals.max_seq_index * 1.5 * globals.unit_width + globals.margin.left + globals.margin.right,
            instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
          ]);
          globals.height = globals.num_seq_tracks * globals.track_height + 1.5 * globals.track_height + globals.margin.top + globals.margin.bottom;
        } else if (layout === "Faceted") {
          // justifiable
          processFacets(data);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
          globals.width = d3.max([
            globals.max_seq_index * 1.5 * globals.unit_width + globals.margin.left + globals.margin.right,
            instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
          ]);
          globals.height = (globals.max_num_seq_tracks * globals.track_height + 1.5 * globals.track_height) * globals.num_facets + globals.margin.top + globals.margin.bottom;
        } else {
          // not justifiable
          logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;
      }
      break;

    case "Radial":

      globals.centre_radius = 50;

      var effective_size = instance._render_width - globals.margin.right - globals.padding.right - globals.margin.left - globals.padding.left - getScrollbarWidth();

      switch (scale) {

      case "Chronological":

        switch (layout) {

        case "Unified":
          // justifiable
          assignTracks(data, [], layout);
          logEvent("# tracks: " + globals.num_tracks, "sizing");

          globals.centre_radius = d3.max([50, (effective_size - ((globals.num_tracks + 2) * 2 * globals.track_height)) / 2]);
          globals.width = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) + globals.margin.left + globals.margin.right;
          if (globals.centre_radius > 200)          { globals.centre_radius = 200; }
          globals.height = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) + globals.margin.top + globals.margin.bottom;
          break;

        case "Faceted":
          // justifiable
          processFacets(data);

          globals.centre_radius = 50;
          var estimated_facet_width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height);

          globals.num_facet_cols = d3.max([1, d3.min([globals.num_facet_cols, Math.floor(effective_size / estimated_facet_width)])]);
          globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

          globals.centre_radius = d3.max([50, (effective_size / globals.num_facet_cols - ((globals.max_num_tracks + 2) * 2 * globals.track_height)) / 2]);
          globals.width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_cols + globals.margin.left + globals.margin.right;
          if (globals.centre_radius > 200)          { globals.centre_radius = 200; }
          globals.height = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_rows + globals.margin.top + globals.margin.bottom + globals.num_facet_rows * globals.buffer;
          break;

        case "Segmented":
          // justifiable
          assignTracks(data, [], layout);
          logEvent("# tracks: " + globals.num_tracks, "sizing");

          globals.centre_radius = 50;
          var estimated_segment_width = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height);

          globals.num_segment_cols = d3.max([1, d3.min([globals.num_segment_cols, Math.floor(effective_size / estimated_segment_width)])]);
          globals.num_segment_rows = Math.ceil(globals.num_segments / globals.num_segment_cols);

          globals.centre_radius = d3.max([50, (effective_size / globals.num_segment_cols - ((globals.num_tracks + 2) * 2 * globals.track_height)) / 2]);
          globals.width = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) * globals.num_segment_cols + globals.margin.left + globals.margin.right;
          if (globals.centre_radius > 200) {
            globals.centre_radius = 200;
          }
          globals.height = (2 * globals.centre_radius + (globals.num_tracks + 2) * 2 * globals.track_height) * globals.num_segment_rows + globals.margin.top + globals.margin.bottom + globals.num_segment_rows * globals.buffer;
          break;
        }
        break;

      case "Relative":
        if (layout === "Faceted") {
          // justifiable
          processFacets(data);
          logEvent("# within-facet tracks: " + (globals.max_num_tracks + 1), "sizing");

          globals.centre_radius = 50;
          var estimated_facet_width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height);

          globals.num_facet_cols = d3.min([globals.num_facet_cols, Math.floor(effective_size / estimated_facet_width)]);
          globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

          globals.centre_radius = d3.max([50, (effective_size / globals.num_facet_cols - ((globals.max_num_tracks + 2) * 2 * globals.track_height)) / 2]);
          globals.width = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_cols + globals.margin.left + globals.margin.right;
          if (globals.centre_radius > 200) {
            globals.centre_radius = 200;
          }
          globals.height = (2 * globals.centre_radius + (globals.max_num_tracks + 2) * 2 * globals.track_height) * globals.num_facet_rows + globals.margin.top + globals.margin.bottom + globals.num_facet_rows * globals.buffer;
        } else {
          // not justifiable
          logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;

      case "Sequential":
        if (layout === "Unified") {
          // justifiable
          assignSequenceTracks(data, []);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
          globals.centre_radius = (effective_size - (4 * globals.track_height)) / 2;
          globals.width = (2 * globals.centre_radius + 4 * globals.track_height) + globals.margin.left + globals.margin.right;
          if (globals.centre_radius > 200) {
            globals.centre_radius = 200;
          }
          globals.height = (2 * globals.centre_radius + 4 * globals.track_height) + globals.margin.top + globals.margin.bottom;
        } else if (layout === "Faceted") {
          // justifiable

          processFacets(data);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;

          globals.centre_radius = 50;
          var estimated_facet_width = (2 * globals.centre_radius + (4 * globals.track_height));

          globals.num_facet_cols = d3.min([globals.num_facet_cols, Math.floor(effective_size / estimated_facet_width)]);
          globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

          globals.centre_radius = d3.max([50, (effective_size / globals.num_facet_cols - (4 * globals.track_height)) / 2]);
          globals.width = (2 * globals.centre_radius + 4 * globals.track_height) * globals.num_facet_cols + globals.margin.left + globals.margin.right;
          if (globals.centre_radius > 200) {
            globals.centre_radius = 200;
          }
          globals.height = (2 * globals.centre_radius + 4 * globals.track_height) * globals.num_facet_rows + globals.margin.top + globals.margin.bottom + globals.num_facet_rows * globals.buffer;
        } else {
          // not justifiable
          logEvent("scale-layout-representation combination not possible/justifiable", "error");

          globals.width = 0;
          globals.height = 0;
        }
        break;
      }
      break;

    case "Grid":

      if (scale === "Chronological" && layout === "Segmented") {
        // justifiable

        assignTracks(data, [], layout);

        var cell_size = 50,
          century_height = cell_size * globals.unit_width,
          century_width = cell_size * 10;

        // determine the range, round to whole centuries
        var range_floor = Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100,
          range_ceil = Math.ceil((data.max_end_date.getUTCFullYear() + 1) / 100) * 100;

        // determine the time domain of the data along a linear quantitative scale
        var year_range = d3.range(range_floor, range_ceil);

        // determine maximum number of centuries given year_range
        var num_centuries = (Math.ceil(year_range.length / 100));

        globals.width = century_width + globals.margin.left + globals.margin.right;
        globals.height = num_centuries * century_height + num_centuries * cell_size + globals.margin.top + globals.margin.bottom - cell_size;
      } else {
        // not justifiable
        logEvent("scale-layout-representation combination not possible/justifiable", "error");

        globals.width = 0;
        globals.height = 0;
      }
      break;

    case "Calendar":

      if (scale === "Chronological" && layout === "Segmented") {
        // justifiable

        assignTracks(data, [], layout);

        var cell_size = 20,
          year_height = cell_size * 8, // 7 days of week + buffer
          year_width = cell_size * 53; // 53 weeks of the year + buffer

        // determine the range, round to whole centuries
        var range_floor = data.min_start_date.getUTCFullYear(),
          range_ceil = data.max_end_date.getUTCFullYear();

        // determine the time domain of the data along a linear quantitative scale
        var year_range = d3.range(range_floor, range_ceil + 1);

        globals.width = year_width + globals.margin.left + globals.margin.right;
        globals.height = year_range.length * year_height + globals.margin.top + globals.margin.bottom - cell_size;
      } else {
        // not justifiable
        logEvent("scale-layout-representation combination not possible/justifiable", "error");

        globals.width = 0;
        globals.height = 0;
      }
      break;

    case "Spiral":

      if (scale === "Sequential") {
        if (layout === "Unified") {
          // justifiable

          assignSequenceTracks(data, []);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
          var angle = 0,
            i = 0;

          data.forEach(function (item) {
            var radius = Math.sqrt(i + 1);
            angle += Math.asin(1 / radius);
            i++;
            item.spiral_index = i;
            item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
            item.spiral_y = Math.sin(angle) * (radius * globals.spiral_padding);
          });

          var max_x = d3.max(data, function (d) { return d.spiral_x; });
          var max_y = d3.max(data, function (d) { return d.spiral_y; });
          var min_x = d3.min(data, function (d) { return d.spiral_x; });
          var min_y = d3.min(data, function (d) { return d.spiral_y; });

          globals.spiral_dim = d3.max([(max_x + 2 * globals.spiral_padding) - (min_x - 2 * globals.spiral_padding), (max_y + 2 * globals.spiral_padding) - (min_y - 2 * globals.spiral_padding)]);

          globals.width = d3.max([
            globals.spiral_dim + globals.spiral_padding + globals.margin.right + globals.margin.left,
            instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
          ]);

          // USES EFFECTIVE_HEIGHT
          globals.height = d3.max([
            globals.spiral_dim + globals.spiral_padding + globals.margin.top + globals.margin.bottom,
            instance._render_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth()
          ]);
        } else if (layout === "Faceted") {
          // justifiable
          processFacets(data);
          globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;

          globals.timeline_facets.forEach(function (timeline) {
            var angle = 0,
              i = 0;

            timeline.values.forEach(function (item) {
              var radius = Math.sqrt(i + 1);
              angle += Math.asin(1 / radius);
              i++;
              item.spiral_index = i;
              item.spiral_x = Math.cos(angle) * (radius * globals.spiral_padding);
              item.spiral_y = Math.sin(angle) * (radius * globals.spiral_padding);
            });
          });

          var max_x = d3.max(data, function (d) { return d.spiral_x; });
          var max_y = d3.max(data, function (d) { return d.spiral_y; });
          var min_x = d3.min(data, function (d) { return d.spiral_x; });
          var min_y = d3.min(data, function (d) { return d.spiral_y; });

          globals.spiral_dim = d3.max([(max_x + 2 * globals.spiral_padding) - (min_x - 2 * globals.spiral_padding), (max_y + 2 * globals.spiral_padding) - (min_y - 2 * globals.spiral_padding)]);

          var facet_number = 0,
            effective_size = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();

          globals.num_facet_cols = d3.min([globals.num_facet_cols, Math.floor(effective_size / globals.spiral_dim)]);
          globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

          globals.width = d3.max([
            globals.num_facet_cols * globals.spiral_dim + globals.margin.right + globals.margin.left,
            instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth()
          ]);
          globals.height = globals.num_facet_rows * globals.spiral_dim + globals.margin.top + globals.margin.bottom;
        } else {
          // not justifiable
          globals.width = 0;
          globals.height = 0;
        }
      } else {
        // not justifiable
        logEvent("scale-layout-representation combination not possible/justifiable", "error");

        globals.width = 0;
        globals.height = 0;
      }
      break;

    case "Curve":
      if (scale === "Sequential" && layout === "Unified") {
        // justifiable
        assignSequenceTracks(data, []);
        globals.max_seq_index = d3.max(data, function (d) { return d.seq_index; }) + 1;
        globals.width = instance._render_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
        globals.height = instance._render_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth();
      } else {
        // not justifiable
        logEvent("scale-layout-representation combination not possible/justifiable", "error");

        globals.width = 0;
        globals.height = 0;
      }
      break;
    }
    logEvent("dimensions: " + globals.width + " (W) x " + globals.height + " (H)", "sizing");
  }

  instance._determineSize = determineSize;

  function updateRadioBttns(scale, layout, representation) {
    // update the control radio buttons
    selectAllWithParent("#scale_picker input[name=scale_rb]").property("checked", function (d, i) {
      return d === scale;
    });
    selectAllWithParent("#layout_picker input[name=layout_rb]").property("checked", function (d, i) {
      return d === layout;
    });
    selectAllWithParent("#representation_picker input[name=representation_rb]").property("checked", function (d, i) {
      return d === representation;
    });

    selectAllWithParent("#scale_picker img")
      .style("border-bottom", function (d) {
        if (d.name === scale) { return "2px solid #f00"; }
      })
      .style("border-right", function (d) {
        if (d.name === scale) { return "2px solid #f00"; }
      });
    selectAllWithParent("#layout_picker img")
      .style("border-bottom", function (d) {
        if (d.name === layout) { return "2px solid #f00"; }
      })
      .style("border-right", function (d) {
        if (d.name === layout) { return "2px solid #f00"; }
      });
    selectAllWithParent("#representation_picker img")
      .style("border-bottom", function (d) {
        if (d.name === representation) { return "2px solid #f00"; }
      })
      .style("border-right", function (d) {
        if (d.name === representation) { return "2px solid #f00"; }
      });

    selectAllWithParent(".option_rb").select("input").property("disabled", function (d) {
      switch (d.name) {

      case "Chronological":
        return !(representation !== "Spiral" && representation !== "Curve");

      case "Relative":
        return !(layout === "Faceted" && (representation === "Linear" || representation === "Radial"));

      case "Log":
        return !(representation === "Linear" && layout !== "Segmented");

      case "Collapsed":
        return !(representation === "Linear" && layout === "Unified");

      case "Sequential":
        return !((representation !== "Grid" && representation !== "Calendar") && layout !== "Segmented");

      case "Unified":
        return !(scale !== "Relative" && representation !== "Grid" && representation !== "Calendar");

      case "Faceted":
        return !(scale !== "Collapsed" && representation !== "Grid" && representation !== "Calendar" && representation !== "Curve" && globals.total_num_facets > 1);

      case "Segmented":
        return !(scale === "Chronological" && representation !== "Spiral" && representation !== "Curve");

      case "Linear":
        return false;

      case "Calendar":
        return !(scale === "Chronological" && layout === "Segmented" && (["weeks", "months", "years", "decades"].indexOf(globals.segment_granularity) !== -1));

      case "Grid":
        return !(scale === "Chronological" && layout === "Segmented" && (["decades", "centuries", "millenia"].indexOf(globals.segment_granularity) !== -1));

      case "Radial":
        return !(scale !== "Log" && scale !== "Collapsed");

      case "Spiral":
        return !(scale === "Sequential" && (layout === "Unified" || layout === "Faceted"));

      case "Curve":
        return !(scale === "Sequential" && layout === "Unified");
      }
    });

    selectAllWithParent(".option_rb").select("img").attr("class", function (d) {
      switch (d.name) {
      case "Chronological":
        return (representation !== "Spiral" && representation !== "Curve") ? "img_btn_enabled" : "img_btn_disabled";
      case "Relative":
        return (layout === "Faceted" && (representation === "Linear" || representation === "Radial")) ? "img_btn_enabled" : "img_btn_disabled";
      case "Log":
        return (representation === "Linear" && layout !== "Segmented") ? "img_btn_enabled" : "img_btn_disabled";
      case "Collapsed":
        return (representation === "Linear" && layout === "Unified") ? "img_btn_enabled" : "img_btn_disabled";
      case "Sequential":
        return ((representation !== "Grid" && representation !== "Calendar") && layout !== "Segmented") ? "img_btn_enabled" : "img_btn_disabled";
      case "Unified":
        return (scale !== "Relative" && representation !== "Grid" && representation !== "Calendar") ? "img_btn_enabled" : "img_btn_disabled";
      case "Faceted":
        return (scale !== "Collapsed" && representation !== "Grid" && representation !== "Calendar" && representation !== "Curve" && globals.total_num_facets > 1) ? "img_btn_enabled" : "img_btn_disabled";
      case "Segmented":
        return (scale === "Chronological" && representation !== "Spiral" && representation !== "Curve") ? "img_btn_enabled" : "img_btn_disabled";
      case "Linear":
        return "img_btn_enabled";
      case "Calendar":
        return (scale === "Chronological" && layout === "Segmented" && (["weeks", "months", "years", "decades"].indexOf(globals.segment_granularity) !== -1)) ? "img_btn_enabled" : "img_btn_disabled";
      case "Grid":
        return (scale === "Chronological" && layout === "Segmented" && (["decades", "centuries", "millenia"].indexOf(globals.segment_granularity) !== -1)) ? "img_btn_enabled" : "img_btn_disabled";
      case "Radial":
        return (scale !== "Log" && scale !== "Collapsed") ? "img_btn_enabled" : "img_btn_disabled";
      case "Spiral":
        return (scale === "Sequential" && (layout === "Unified" || layout === "Faceted")) ? "img_btn_enabled" : "img_btn_disabled";
      case "Curve":
        return (scale === "Sequential" && layout === "Unified") ? "img_btn_enabled" :  "img_btn_disabled";
      }
    });
  }

  // highlight matches and de-emphasize (grey-out) mismatches
  globals.dispatch.on("Emphasize", function (selected_categories, selected_facets, selected_segments) {
    var timeline_events = selectAllWithParent(".timeline_event_g");
    var matches, mismatches,
      selected_category_values = [],
      selected_facet_values = [],
      selected_segment_values = [];

    globals.prev_active_event_list = globals.active_event_list;

    globals.active_event_list = [];

    selected_categories[0].forEach(function (item) {
      selected_category_values.push(item.__data__);
    });

    selected_facets[0].forEach(function (item) {
      selected_facet_values.push(item.__data__);
    });

    selected_segments[0].forEach(function (item) {
      selected_segment_values.push(item.__data__);
    });

    mismatches = timeline_events.filter(function (d) {
      return (selected_category_values.indexOf("( All )") === -1 && selected_category_values.indexOf(d.category) === -1) ||
        (selected_facet_values.indexOf("( All )") === -1 && selected_facet_values.indexOf(d.facet) === -1) ||
        (selected_segment_values.indexOf("( All )") === -1 && selected_segment_values.indexOf(d.segment) === -1);
    });

    matches = timeline_events.filter(function (d) {
      return (selected_category_values.indexOf("( All )") !== -1 || selected_category_values.indexOf(d.category) !== -1) &&
        (selected_facet_values.indexOf("( All )") !== -1 || selected_facet_values.indexOf(d.facet) !== -1) &&
        (selected_segment_values.indexOf("( All )") !== -1 || selected_segment_values.indexOf(d.segment) !== -1);
    });

    if (mismatches[0].length !== 0) {
      logEvent(matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events", "Emphasize");
    } else {
      logEvent(matches[0].length + " events", "Emphasize");
    }

    globals.all_data.forEach(function (item) {
      if ((selected_category_values.indexOf("( All )") !== -1 || selected_category_values.indexOf(item.category) !== -1) &&
        (selected_facet_values.indexOf("( All )") !== -1 || selected_facet_values.indexOf(item.facet) !== -1) &&
        (selected_segment_values.indexOf("( All )") !== -1 || selected_segment_values.indexOf(item.segment) !== -1)) {
        globals.active_event_list.push(item.event_id);
      }
    });

    main_svg.call(timeline_vis.duration(instance.options.animations ? 1200 : 0));

    globals.prev_active_event_list = globals.active_event_list;
  });

  // remove mismatches
  globals.dispatch.on("remove", function (selected_categories, selected_facets, selected_segments) {
    instance.clearCanvas();

    globals.prev_active_event_list = globals.active_event_list;
    globals.active_event_list = [];

    var matches, mismatches,
      selected_category_values = [],
      selected_facet_values = [],
      selected_segment_values = [],
      reset_segmented_layout = false;

    selected_categories[0].forEach(function (item) {
      selected_category_values.push(item.__data__);
    });

    selected_facets[0].forEach(function (item) {
      selected_facet_values.push(item.__data__);
    });

    selected_segments[0].forEach(function (item) {
      selected_segment_values.push(item.__data__);
    });

    globals.all_data.forEach(function (item) {
      if ((selected_category_values.indexOf("( All )") !== -1 || selected_category_values.indexOf(item.category) !== -1) &&
        (selected_facet_values.indexOf("( All )") !== -1 || selected_facet_values.indexOf(item.facet) !== -1) &&
        (selected_segment_values.indexOf("( All )") !== -1 || selected_segment_values.indexOf(item.segment) !== -1)) {
        globals.active_event_list.push(item.event_id);
      }
    });

    mismatches = selectAllWithParent(".timeline_event_g").filter(function (d) {
      return globals.active_event_list.indexOf(d.event_id) === -1;
    });

    matches = selectAllWithParent(".timeline_event_g").filter(function (d) {
      return globals.active_event_list.indexOf(d.event_id) !== -1;
    });

    globals.active_data = globals.all_data.filter(function (d) {
      return globals.active_event_list.indexOf(d.event_id) !== -1;
    });

    if (mismatches[0].length !== 0) {
      logEvent(matches[0].length + " out of " + (matches[0].length + mismatches[0].length) + " events", "remove");
    } else {
      logEvent(matches[0].length + " events", "remove");
    }

    measureTimeline(globals.active_data);

    globals.active_data.min_start_date = d3.min(globals.active_data, function (d) {
      return d.start_date;
    });
    globals.active_data.max_start_date = d3.max(globals.active_data, function (d) {
      return d.start_date;
    });
    globals.active_data.max_end_date = d3.max(globals.active_data, function (d) {
      return time.minute.floor(d.end_date);
    });

    globals.all_data.min_start_date = globals.active_data.min_start_date;
    globals.all_data.max_end_date = globals.active_data.max_end_date;

    globals.max_end_age = 0;

    // determine facets (separate timelines) from data
    globals.facets.domain(globals.active_data.map(function (d) {
      return d.facet;
    }));

    globals.facets.domain().sort();

    globals.num_facets = globals.facets.domain().length;
    globals.num_facet_cols = Math.ceil(Math.sqrt(globals.num_facets));
    globals.num_facet_rows = Math.ceil(globals.num_facets / globals.num_facet_cols);

    logEvent("num facets: " + globals.num_facet_cols, "remove");

    if (timeline_vis.tl_layout() === "Segmented") {
      if (timeline_vis.tl_representation() === "Grid") {
        globals.segment_granularity = "centuries";
      } else if (timeline_vis.tl_representation() === "Calendar") {
        globals.segment_granularity = "weeks";
      } else {
        globals.segment_granularity = getSegmentGranularity(globals.global_min_start_date, globals.global_max_end_date);
      }
    }

    var segment_list = getSegmentList(globals.active_data.min_start_date, globals.active_data.max_end_date);

    globals.segments.domain(segment_list.map(function (d) {
      return d;
    }));

    logEvent("segments (" + globals.segments.domain().length + "): " + globals.segments.domain(), "preprocessing");

    globals.num_segments = globals.segments.domain().length;
    globals.num_segment_cols = Math.ceil(Math.sqrt(globals.num_segments));
    globals.num_segment_rows = Math.ceil(globals.num_segments / globals.num_segment_cols);

    determineSize(globals.active_data, timeline_vis.tl_scale(), timeline_vis.tl_layout(), timeline_vis.tl_representation());

    logEvent("num facets after sizing: " + globals.num_facet_cols, "remove");

    adjustSvgSize();

    main_svg.call(timeline_vis.duration(instance.options.animations ? 1200 : 0)
      .height(globals.height)
      .width(globals.width));

    if (reset_segmented_layout) {
      mismatches = selectAllWithParent(".timeline_event_g").filter(function (d) {
        return globals.active_event_list.indexOf(d.event_id) === -1;
      });

      matches = selectAllWithParent(".timeline_event_g").filter(function (d) {
        return globals.active_event_list.indexOf(d.event_id) !== -1;
      });
    }

    globals.prev_active_event_list = globals.active_event_list;
  });

  function importIntro() {
    var import_intro = introJs();
    var steps = [
      {
        intro: "This tour will describe the types of data that the tool can ingest."
      }
    ];

    if (showDemoData()) {
      steps.push({
        element: ".timeline_storyteller #demo_dataset_picker_label",
        intro: "Load one of several demonstration timeline datasets, featuring timelines that span astronomical epochs or just a single day.",
        position: "right"
      });
    }

    if (instance.options.showImportLoadDataOptions) {
      steps = steps.concat([
        {
          element: ".timeline_storyteller #json_picker_label",
          intro: "Load a timeline dataset in JSON format, where each event is specified by at least a start_date (in either YYYY, YYYY-MM, YYYY-MM-DD, or YYYY-MM-DD HH:MM format); optionally, events can also be specified by end_date, content_text (a text string that describes the event), category, and facet (a second categorical attribute used for distinguishing between multiple timelines).",
          position: "right"
        },
        {
          element: ".timeline_storyteller #csv_picker_label",
          intro: "Load a timeline dataset in CSV format; ensure that the header row contains at least a start_date column; as with JSON datasets, end_date, content_text, category, and facet columns are optional.",
          position: "right"
        },
        {
          element: ".timeline_storyteller #gdocs_picker_label",
          intro: "Load a timeline dataset from a published Google Spreadsheet; you will need to provide the spreadsheet key and worksheet title; the worksheet columns must be formatted as text.",
          position: "right"
        }
      ]);
    }

    if (showDemoData()) {
      steps.push({
        element: ".timeline_storyteller #story_demo_label",
        intro: "Load a demonstration timeline story.",
        position: "right"
      });
    }
    steps.push(
      {
        element: ".timeline_storyteller #story_picker_label",
        intro: "Load a previously saved timeline story in .cdc format.",
        position: "right"
      }
    );

    import_intro.setOptions({
      steps: steps
    });
    import_intro.start();
  }

  function mainIntro() {
    var main_intro = introJs();
    var steps = [
      {
        intro: "This tour will introduce the timeline story authoring features."
      }
    ];

    if (instance.options.showViewOptions !== false) {
      steps = steps.concat([
        {
          element: "#representation_picker",
          intro: "Select the visual representation of the timeline or timelines here. Note that some representations are incompatible with some combinations of scales and layouts.",
          position: "bottom"
        },
        {
          element: "#scale_picker",
          intro: "Select the scale of the timeline or timelines here. Note that some scales are incompatible with some combinations of representations and layouts.",
          position: "bottom"
        },
        {
          element: "#layout_picker",
          intro: "Select the layout of the timeline or timelines here. Note that some layouts are incompatible with some combinations of representations and scales.",
          position: "bottom"
        }
      ]);
    }

    if (instance.options.showImportOptions !== false) {
      steps.push(
        {
          element: "#import_visible_btn",
          intro: "This button toggles the import panel, allowing you to open a different timeline dataset or story.",
          position: "right"
        });
    }

    steps = steps.concat([
      {
        element: "#control_panel",
        intro: "This panel contains controls for adding text or image annotations to a timeline, for highlighting and filtering events, and for exporting the timeline or timeline story.",
        position: "right"
      },
      {
        element: "#record_scene_btn",
        intro: "This button records the current canvas of timeline or timelines, labels, and annotations as a scene in a story.",
        position: "top"
      }]);

    main_intro.setOptions({
      steps: steps
    });

    main_intro.start();
  }

  function playbackIntro() {
    var playback_intro = introJs();
    playback_intro.setOptions({
      steps: [
        {
          intro: "This tour will introduce timeline story plaback features."
        },
        {
          element: "#play_scene_btn",
          intro: "You are now in story playback mode. Click this button to leave playback mode and restore the story editing tool panels.",
          position: "top"
        },
        {
          element: "#stepper_container",
          intro: "Scenes in the story appear in this panel. Click on any scene thumbnail to jump to the corresponding scene.",
          position: "top"
        },
        {
          element: "#next_scene_btn",
          intro: "Advance to the next scene by clicking this button.",
          position: "top"
        },
        {
          element: "#prev_scene_btn",
          intro: "Return to the previous scene by clicking this button.",
          position: "top"
        }
      ]
    });
    playback_intro.start();
  }


  selectWithParent()
    .append("div")
    .attr("id", "hint_div")
    .attr("data-hint", "Click on the [TOUR] button for a tour of the interface.")
    .attr("data-hintPosition", "bottom-left")
    .attr("data-position", "bottom-left-aligned")
    .attr("class", "control_div");

  var intro_div = selectWithParent("#hint_div")
    .append("div")
    .attr("id", "intro_div");

  // Give it some time to load, then initialize the hints, otherwise the positioning is wierd
  setTimeout(function () {
    introJs().addHints();
  }, 100);

  intro_div.append("input")
    .attr({
      type: "image",
      name: "Start tour",
      id: "start_intro_btn",
      class: "img_btn_enabled",
      src: imageUrls("info.png"),
      height: 30,
      width: 30,
      title: "Start tour"
    })
    .on("click", function () {
      if (instance.importPanel.visible) {
        importIntro();
      } else if (!globals.playback_mode) {
        mainIntro();
      } else {
        playbackIntro();
      }
    });

  intro_div.append("div")
    .attr("class", "intro_btn")
    .html("<a title='About & getting started' href='../../' target='_blank'><img src='" + imageUrls("q.png") + "' width=30 height=30 class='img_btn_enabled'></img></a>");

  intro_div.append("div")
    .attr("class", "intro_btn")
    .html("<a title='Contact the project team' href='mailto:timelinestoryteller@microsoft.com' target='_top'><img src='" + imageUrls("mail.png") + "' width=30 height=30 class='img_btn_enabled'></img></a>");

  /**
   * Loads a story json object
   * @param {string} story The json stroy object
   * @param {number} [delay=500] The default delay for loading timeline storyteller
   * @returns {void}
   */
  this._loadStoryInternal = function (story, delay) {
    var blob = new Blob([story], { type: "application/json" });
    globals.source = URL.createObjectURL(blob);
    logEvent("story source: " + globals.source, "load");

    globals.source_format = "story";
    selectWithParent("#timeline_metadata").style("display", "none");
    selectAllWithParent(".gdocs_info_element").style("display", "none");
    instance.importPanel.hide();

    selectWithParent("#gdocs_info").style("height", 0 + "px");
    selectWithParent("#gdoc_spreadsheet_key_input").property("value", "");
    selectWithParent("#gdoc_worksheet_title_input").property("value", "");

    delay = typeof delay === "undefined" ? 500 : delay;
    if (delay > 0) {
      setTimeout(function () {
        loadTimeline();
      }, delay);
    } else {
      loadTimeline();
    }
  };

  /**
   * Sets the color for the given category
   * @param {string} category The category to change
   * @param {number} categoryIndex The index of the category
   * @param {string} value The category color
   * @returns {void}
   */
  this._setCategoryColor = function(category, categoryIndex, value) {
    globals.color_swap_target = globals.categories.range().indexOf(globals.categories(category));
    log("category " + categoryIndex + ": " + category + " / " + value + " (index # " + globals.color_swap_target + ")");

    setScaleValue(globals.categories, category, value);

    globals.use_custom_palette = true;
  };

  /**
   * Loads the data from the given story
   * @param {object} story The story to load data from
   * @param {number} min_story_height The minimum height to show the story
   * @param {object[]} unique_data The unique data
   * @param {object[]} unique_values The unique values
   */
  this._loadDataFromStory = function(story, min_story_height, unique_data, unique_values) {
    var timelineData = globals.timeline_json_data;

    // The original format
    if (!story.version) {
      timelineData = story.timeline_json_data;
    }

    globals.timeline_json_data = timelineData;

    if (story.color_palette !== undefined) {
      globals.color_palette = story.color_palette;
      globals.use_custom_palette = true;
    }
    globals.scenes = story.scenes;
    globals.caption_list = story.caption_list;
    globals.image_list = story.image_list;
    globals.annotation_list = story.annotation_list;
    globals.caption_index = story.caption_list.length - 1;
    globals.image_index = story.image_list.length - 1;

    if (story.tz_offset !== undefined) {
      globals.story_tz_offset = new Date().getTimezoneOffset() - story.tz_offset;
    } else {
      globals.story_tz_offset = new Date().getTimezoneOffset() - 480;
    }

    if (new Date().dst() && !(new Date(story.timestamp).dst())) {
      globals.story_tz_offset += 60;
    } else if (!(new Date().dst()) && new Date(story.timestamp).dst()) {
      globals.story_tz_offset -= 60;
    }

    var min_story_width = instance._render_width,
      max_story_width = instance._render_width;

    globals.scenes.forEach(function (d, i) {
      if (d.s_order === undefined) {
        d.s_order = i;
      }
      if ((d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth()) < min_story_width) {
        min_story_width = (d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth());
      }
      if ((d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth()) > max_story_width) {
        max_story_width = (d.s_width + globals.margin.left + globals.margin.right + getScrollbarWidth());
      }
      if ((d.s_height + globals.margin.top + globals.margin.bottom + getScrollbarWidth()) < min_story_height) {
        min_story_height = (d.s_height + globals.margin.top + globals.margin.bottom + getScrollbarWidth());
      }
    });

    if (story.width === undefined) {
      if (max_story_width > instance._render_width) {
        story.width = max_story_width;
      } else {
        story.width = min_story_width;
      }
    }
    if (story.height === undefined) {
      story.height = min_story_height;
    }

    log("s_width: " + story.width + "; window_width: " + instance._render_width);
    instance._render_width = story.width;
    instance._render_height = story.height;

    timelineData.forEach(function (d) {
      unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
    });

    unique_values.forEach(function (d) {
      unique_data.push(unique_values.get(d));
    });
    logEvent(unique_data.length + " unique events", "preprocessing");

    updateNavigationStepper();
    processTimeline(unique_data);
  };
}

/**
 * The default set of options
 */
TimelineStoryteller.DEFAULT_OPTIONS = Object.freeze({
  showAbout: true,
  showLogo: true,
  showViewOptions: true,
  showIntro: true,
  showImportOptions: true,
  showImportLoadDataOptions: true,
  animations: true,
  menu: {
    open: {
      label: "Open",
      items: [{
        name: "Load timeline data",
        image: imageUrls("open.png"),
        id: "import_visible_btn",
        click: function (instance) {
          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#caption_div").style("display", "none");
          selectWithParent("#image_div").style("display", "none");
          selectWithParent("#export_div").style("top", -185 + "px");

          logEvent("open import panel", "load");

          if (instance.importPanel.visible) {
            instance.importPanel.hide();
            selectWithParent("#gdocs_info").style("height", 0 + "px");
            selectAllWithParent(".gdocs_info_element").style("display", "none");
          } else {
            instance.importPanel.show();
          }
        }
      }]
    },
    annotate: {
      label: "Annotate",
      items: [{
        name: "Add caption",
        image: imageUrls("caption.png"),
        click: function () {
          logEvent("open caption dialog", "annotation");

          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#image_div").style("display", "none");
          if (selectWithParent("#caption_div").style("display") !== "none") {
            selectWithParent("#caption_div").style("display", "none");
          } else {
            selectWithParent("#caption_div").style("display", "inline");
          }
        }
      }, {
        name: "Add image",
        image: imageUrls("image.png"),
        click: function () {
          logEvent("open image dialog", "annotation");

          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#caption_div").style("display", "none");
          if (selectWithParent("#image_div").style("display") !== "none") {
            selectWithParent("#image_div").style("display", "none");
          } else {
            selectWithParent("#image_div").style("display", "inline");
          }
        }
      }, {
        name: "Clear annotations, captions, & images",
        image: imageUrls("clear.png"),
        click: function(instance) {
          instance.clearCanvas();
        }
      }]
    },
    filter: {
      label: "Filter",
      items: [{
        text: "Export",
        image: imageUrls("filter.png"),
        click: function(instance) {
          logEvent("open filter dialog", "filter");

          if (d3.select(this).attr("class") === "img_btn_enabled") {
            selectWithParent("#caption_div").style("display", "none");
            selectWithParent("#image_div").style("display", "none");
            if (selectWithParent("#filter_div").style("display") === "none") {
              selectWithParent("#filter_div").style("display", "inline");
              globals.effective_filter_width = instance._component_width - parseInt(selectWithParent("#filter_div").style("width")) - getScrollbarWidth() - 10;
              globals.effective_filter_height = instance._component_height - parseInt(selectWithParent("#filter_div").style("height")) - 25 - getScrollbarWidth() - parseInt(selectWithParent("#navigation_div").style("height")) - 10;
            } else {
              selectWithParent("#filter_div").style("display", "none");
            }
          }
        } // The click handler
      }]
    },
    export: {
      label: "Export",
      items: [{
        text: "Export",
        image: imageUrls("export.png"),
        click: function(instance) {
          selectWithParent("#filter_div").style("display", "none");
          selectWithParent("#caption_div").style("display", "none");
          selectWithParent("#image_div").style("display", "none");

          instance.importPanel.hide();

          logEvent("show export panel", "export");

          if (selectWithParent("#export_div").style("top") !== -185 + "px") {
            selectWithParent("#export_div").style("top", -185 + "px");
          } else {
            selectWithParent("#export_div").style("top", "25%");
          }
        } // The click handler
      }]
    }
  }
});

/**
 * Initializes the popup menu
 * @param {object} menu The JSON object representing the menu
 * @returns {void}
 * {
 *    export: {
 *      label: "Export",
 *      items: [{
 *         text: "Export",
 *         image: "http://image.com/img.jpg",
 *         height: 30,// optional,
 *         width: 30, // optional
 *         class: "custom" // The custom class to bind to this item,
 *         click: function() { } // The click handler
 *      }]
 *    },
 *    annotate: {
 *      label: "Annotate"
 *    }
 * }
 */
TimelineStoryteller.prototype._initializeMenu = function (menu) {
  var that = this;
  var sectionNames = Object.keys(menu);

  // Clear it out first
  this._control_panel.selectAll("*").remove();

  sectionNames.forEach(function (name, i) {
    var section = menu[name];
    // No need for an HR if it is the first item
    if (i > 0) {
      that._control_panel.append("hr")
        .style("margin-bottom", "0px")
        .attr("class", "menu_hr");
    }

    that._control_panel.append("text")
      .attr("class", "menu_label")
      .text(section.label);

    (section.items || []).forEach(function(item) {
      var itemEle =
        that._control_panel.append("input")
          .attr({
            type: "image",
            name: item.text,
            class: "img_btn_disabled" + (" " + (item.class || "")),
            src: item.image,
            title: item.text
          });
        itemEle.style({
          height: (item.height || 30) + "px",
          width: (item.width || 30) + "px"
        });
        if (item.id) {
          itemEle.attr("id", item.id);
        }
        if (item.click) {
          itemEle.on("click", function() {
            item.click.call(this, that);
          });
        }
    });
  });

  selectAllWithParent("#menu_div").style("display", sectionNames.length > 0 ? "block" : "none");
};

/**
 * Event listener for when the TimelineStoryteller is resized
 */
TimelineStoryteller.prototype._onResized = debounce(function(updateVis) {
  // Only tweak the size if we are not playing back
  if (!globals.playback_mode) {
    this._component_width = this.parentElement.clientWidth;
    this._component_height = this.parentElement.clientHeight;

    // EFFECTIVE_HEIGHT
    globals.width = this._component_width - globals.margin.right - globals.margin.left - getScrollbarWidth();
    globals.height = this._component_height - globals.margin.top - globals.margin.bottom - getScrollbarWidth();

    this._render_width = this._component_width;
    this._render_height = this._component_height;

    var vis = this._timeline_vis;
    if (typeof updateVis === "undefined" && (updateVis !== false) && vis) {
      var scale = vis.tl_scale();
      this._determineSize(globals.active_data, scale, vis.tl_layout(), vis.tl_representation());

      this._adjustSvgSize();

      this._main_svg.call(vis.duration(this.options.animations ? 1200 : 0)
        .tl_scale(scale)
        .height(globals.height)
        .width(globals.width));
    }
  }
}, 500);

/**
 * Scales the UI
 * @param {number} [scale=1] The scale of the UI
 * @returns {void}
 */
TimelineStoryteller.prototype.setUIScale = function (scale) {
  scale = typeof scale === "undefined" ? 1 : scale;
  this.scale = scale;
  selectWithParent("#footer").style("transform", "scale(" + scale + ")");
  selectWithParent("#logo_div").style("transform", "scale(" + scale + ")");
  selectWithParent("#option_div").style("transform", "scale(" + scale + ")");
  this.importPanel.element.style("transform", "scale(" + scale + ")");
  selectWithParent("#navigation_div").style("transform", "scale(" + scale + ")");
  selectWithParent("#menu_div").style("transform", "scale(" + scale + ")");
  selectWithParent("#hint_div").style("transform", "scale(" + scale + ")");
};

/**
 * Applies the current options to the elements on the page
 * @param {boolean} [updateMenu=false] Whether or not to update the menu
 * @returns {void}
 */
TimelineStoryteller.prototype.applyOptions = function (updateMenu) {
  var options = this.options;
  selectWithParent("#footer").style("display", options.showAbout === false ? "none" : null);
  selectWithParent("#logo_div").style("display", options.showLogo === false ? "none" : null);
  selectWithParent("#option_div").style("display", options.showViewOptions === false ? "none" : null);
  this.importPanel.element.style("display", this.onIntro && options.showIntro === false ? "none" : null);

  // showImportOptions
  var showImportVisible = options.showImportOptions === false ? "none" : null;
  selectWithParent("#data_picker").style("display", showImportVisible);
  selectWithParent("#menu_div .menu_label").style("display", showImportVisible);
  selectWithParent("#menu_div #import_visible_btn").style("display", showImportVisible);

  // showAbout
  selectWithParent("#navigation_div").style("bottom", (options.showAbout === false || globals.playback_mode) ? "20px" : "50px");

  // showImportLoadDataOptions
  selectAllWithParent(".import-load-data-option").style("display", options.showImportLoadDataOptions === false ? "display:none" : null);

  if (updateMenu) {
    this._initializeMenu(options.menu);
  }
};

/**
 * Sets the rendering options on the timeline storyteller
 * @param {object} options The options to set
 * @returns {void}
 */
TimelineStoryteller.prototype.setOptions = function (options) {
  options = options || {};
  var updateMenu = false;
  for (var key in options) {
    // If it is a supported option
    if (TimelineStoryteller.DEFAULT_OPTIONS.hasOwnProperty(key)) {
      var value = typeof options[key] !== "undefined" ? options[key] : TimelineStoryteller.DEFAULT_OPTIONS[key];
      this.options[key] = value;
      if (key === "menu") {
        updateMenu = true;
      }
    }
  }
  this.applyOptions(updateMenu);
};

/**
 * Clears the canvas of annotations
 * @returns {void}
 */
TimelineStoryteller.prototype.clearCanvas = function() {
  logEvent("clear annotations", "annotation");

  this._main_svg.selectAll(".timeline_caption, .timeline_caption, .event_annotation").remove();
};

/**
 * Updates the set of currently loaded data
 * @
 */
TimelineStoryteller.prototype.update = function (data) {
  var unique_values = d3.map([]);
  var unique_data = [];

  globals.timeline_json_data = data;

  data.forEach(function (d) {
    unique_values.set((d.content_text + d.start_date + d.end_date + d.category + d.facet), d);
  });

  unique_values.forEach(function (d) {
    unique_data.push(unique_values.get(d));
  });

  logEvent("Updating data", "update");

  // TODO: Check if DrawTimeline hasn't been called yet

  globals.active_data = unique_data;
  globals.all_data = unique_data;

  // updateCategories

  var categories = d3.map(function (d) {
    return d.category;
  }).keys();
  var existingCategories = globals.categories.domain();

  // Don't worry about removed/changed categories, hopefully if you called updateData
  // the underlying dataset has not removed categories, so handle adding only
  if (categories.length > existingCategories.length) {
    var existingColors = existingCategories.map(globals.categories);

    // determine event categories from data
    globals.categories.domain(categories);

    existingColors.forEach(function(color, i) {
      // Restore existing colors
      setScaleValue(globals.categories, existingCategories[i], color);
    });

    globals.num_categories = globals.categories.domain().length;
  }

  this._drawTimeline(globals.active_data);
};

/**
 * Loads the given set of data
 * @param {object[]} data The data to load into the story teller
 * @returns {void}
 */
TimelineStoryteller.prototype.load = function (data) {
    globals.source = data;
    globals.source_format = "json_parsed";
    logEvent("loading (" + globals.source_format + ")", "load");
    setTimeout(function() {
      // Give it time for the UI to load
      this._loadTimeline(true);
    }.bind(this), 100);
};

/**
 * Loads the given story
 * @param {string} story The story to load (json serialized)
 * @param {number} [delay=500] The default delay for loading timeline storyteller
 * @returns {void}
 */
TimelineStoryteller.prototype.loadStory = function (story, delay) {
  return this._loadStoryInternal(story, typeof delay === "undefined" ? 500 : delay);
};

/**
 * Sets the color for the given category
 * @param {string} category The category to change
 * @param {number} categoryIndex The index of the category
 * @param {string} value The category color
 * @returns {void}
 */
TimelineStoryteller.prototype.setCategoryColor = function (category, categoryIndex, value) {
  return this._setCategoryColor(category, categoryIndex, value);
};

/**
 * Sets the playback mode
 * @param {boolean} isPlayback True if playback mode
 * @param {boolean} [addLog=true] True if the change should be logged
 * @returns {void}
 */
TimelineStoryteller.prototype.setPlaybackMode = function (isPlayback, addLog) {
  var importDiv = this.importPanel.element;
  var menuDiv = selectWithParent("#menu_div");
  var optionDiv = selectWithParent("#option_div");

  // This adjusts elements offscreen by calculating their widths and moving them appropriately
  function toggleElement(element, prop, padding) {
    var offscreen = element.node()[(prop === "bottom" || prop === "top") ? "clientHeight" : "clientWidth"];
    element.style(prop, (isPlayback ? ("-" + offscreen + 5) : padding) + "px");
  }

  if (isPlayback) {
    selectWithParent("#record_scene_btn").attr("class", "img_btn_disabled");
    selectWithParent("#caption_div").style("display", "none");
    selectWithParent("#image_div").style("display", "none");
    selectWithParent("#filter_div").style("display", "none");

    menuDiv.attr("class", "control_div onhover");
    importDiv
      .style("top", "-" + importDiv.node().clientHeight + "px")
      .attr("class", "control_div onhover");
    optionDiv.attr("class", "control_div onhover");

    d3.select(".introjs-hints").style("opacity", 0);
  } else {
    selectWithParent("#record_scene_btn").attr("class", "img_btn_enabled");
    optionDiv.attr("class", "control_div");
    importDiv.attr("class", "control_div");
    menuDiv.attr("class", "control_div");

    d3.select(".introjs-hints").style("opacity", 1);
  }

  toggleElement(optionDiv, "top", 10);
  toggleElement(menuDiv, "left", 10);
  toggleElement(selectWithParent("#hint_div"), "top", 20);
  toggleElement(selectWithParent("#intro_div"), "top", 10);
  toggleElement(selectWithParent("#footer"), "bottom", 0);
  toggleElement(selectWithParent("#logo_div"), "top", 10);

  selectWithParent().classed("playback_mode", isPlayback);

  globals.playback_mode = isPlayback;

  if (typeof addLog === "undefined" || addLog) {
    logEvent("playback mode " + (isPlayback ? "on" : "off"), "playback");
  }

  this.applyOptions();
};

/**
 * A utility function to get the scrollbar width
 */
function getScrollbarWidth() {
  var outer = document.createElement("div");
  outer.style.visibility = "hidden";
  outer.style.width = "100px";
  document.querySelector(".timeline_storyteller").appendChild(outer);

  var widthNoScroll = outer.offsetWidth;
  // force scrollbars
  outer.style.overflow = "scroll";

  // add innerdiv
  var inner = document.createElement("div");
  inner.style.width = "100%";
  outer.appendChild(inner);

  var widthWithScroll = inner.offsetWidth;

  // remove divs
  outer.parentNode.removeChild(outer);

  return widthNoScroll - widthWithScroll;
}

module.exports = TimelineStoryteller;
