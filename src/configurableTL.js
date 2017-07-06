"use strict";

/**

configurableTL: //a configurable timeline

**/
var gridAxis = require("./gridAxis.js");
var calendarAxis = require("./calendarAxis.js");
var radialAxis = require("./radialAxis.js");
var imageUrls = require("./imageUrls");
var annotateEvent = require("./annotateEvent");
var time = require("./lib/time.min.js");
var d3 = require("d3");
var moment = require("moment");
var globals = require("./globals");
var log = require("debug")("TimelineStoryteller:configurableTL");

var utils = require("./utils");
var selectWithParent = utils.selectWithParent;
var selectAllWithParent = utils.selectAllWithParent;
var logEvent = utils.logEvent;
var arcTween = utils.arcTween;
var onTransitionComplete = utils.onTransitionComplete;

var getNextZIndex = require("./annotations").getNextZIndex;

d3.configurableTL = function (unit_width) {
  var tl_scale = "Chronological", // timeline scale (chronological | relative | log | interim_duration | sequential)
    tl_layout = "Unified", // timeline layout  (unified | faceted | segmented)
    tl_representation = "Linear", // timeline representation (linear | grid | radial | spiral | curve)
    prev_tl_scale = "None", // timeline scale (chronological | relative | log | interim_duration | sequential)
    prev_tl_layout = "None", // timeline layout  (unified | faceted | segmented)
    prev_tl_representation = "None", // timeline representation (linear | grid | radial | spiral | curve)
    duration = 0,
    height = 760,
    width = 120,
    timeline_scale = d3.scale.linear(),
    timeline_scale_segments = [],
    interim_duration_scale = d3.scale.linear().nice().range([0.25 * unit_width, 4 * unit_width]),
    interim_duration_axis = d3.svg.axis().orient("right").outerTickSize(0),
    tick_format,
    radial_axis = radialAxis(unit_width),
    radial_axis_quantiles = [],
    calendar_axis = calendarAxis(),
    grid_axis = gridAxis(unit_width),
    render_path,
    active_line,
    fresh_canvas = true,
    timeline_facet,
    timeline_segment;

  function configurableTL(selection) {
    const promises = [];
    selection.each(function (data) {
      if (data.min_start_date === undefined || data.max_end_date === undefined) {
        data.min_start_date = globals.global_min_start_date;
        data.max_end_date = globals.global_max_end_date;
      }

      // update timeline dimensions
      var g = d3.select(this),
        log_bounds = -1,
        curve_margin = 20;

      render_path = d3.svg.line()
        .x(function (d) {
          if (d[0] < curve_margin) {
            return curve_margin;
          }
          if (d[0] > width - curve_margin) {
            return d3.max([0, width - curve_margin]);
          }
          return d[0];
        })
        .y(function (d) {
          if (d[1] < curve_margin) {
            return curve_margin;
          }
          if (d[1] > height - curve_margin) {
            return d3.max([0, height - curve_margin]);
          }
          return d[1];
        })
        .interpolate("basis");

      // remove event annotations during a transition
      selectAllWithParent(".event_annotation").remove();

      logEvent("timeline initialized", "drawing");

      /**
      ---------------------------------------------------------------------------------------
      GLOBAL DIMENSIONS
      ---------------------------------------------------------------------------------------
      **/

      // add parent container for entire timeline
      var timeline_container = g.selectAll(".timeline")
        .data([null]);

      // define the parent container
      var timeline_container_enter = timeline_container.enter()
        .append("g")
        .attr("class", "timeline")
        .attr("transform", function () {
          return "translate(" + globals.padding.left + "," + globals.padding.top + ")";
        });

      timeline_container_enter.append("rect")
        .attr("class", "timeline_frame")
        .attr("width", width)
        .attr("height", height)
        .on("mouseover", function () {
          d3.select(this)
            .style("opacity", 0.8)
            .style("stroke", "#ccc")
            .style("stroke-width", "0.5px");
        })
        .on("mouseout", function () {
          d3.select(this)
            .style("opacity", 0.1)
            .style("stroke", "none");
        })
        .on("dblclick", function () {
          logEvent("curve reset", "curve_reset");

          configurableTL.resetCurve();
        })
        .call(d3.behavior.drag()
          .on("dragstart", dragStarted)
          .on("drag", dragged)
          .on("dragend", dragEnd));

      /**
      CURVE-specific timeline
      --*/

      timeline_container_enter.append("path")
        .attr("id", "timecurve")
        .style("visibility", "hidden");

      var timeline_container_update = g.selectAll(".timeline")
        .transition("timeline_container_update")
        .duration(duration);

      timeline_container_update.select("#timecurve")
        .transition()
        .delay(0)
        .duration(duration)
        .style("visibility", () => tl_representation !== "Curve" ? "hidden" : "visible");

      // update parent container
      timeline_container_update.selectAll(".timeline_frame")
        .attr("width", width)
        .attr("height", height);

      logEvent("timeline container updated", "drawing");

      /**
      ---------------------------------------------------------------------------------------
      FACETS
      ---------------------------------------------------------------------------------------
      **/

      // add facet containers
      if (tl_layout === "Faceted" || prev_tl_layout === "Faceted") {
        timeline_facet = configureFacets(timeline_container, duration, width, height, tl_layout, tl_representation, tl_scale, unit_width).timeline_facet;
      }

      /**
      ---------------------------------------------------------------------------------------
      SEGMENTS
      ---------------------------------------------------------------------------------------
      **/

      // add segment containers
      if (tl_layout === "Segmented" || prev_tl_layout === "Segmented") {
        timeline_segment = configureSegments(timeline_container, duration, width, height, tl_layout, tl_representation, tl_scale, unit_width).timeline_segment;
      }

      /**
      ---------------------------------------------------------------------------------------
      SCALES
      ---------------------------------------------------------------------------------------
      **/

      const tssResults = configureTimelineScaleSegments(tl_layout, tl_representation, tl_scale, timeline_scale, tick_format, data, width, height, unit_width, log_bounds, interim_duration_scale);
      interim_duration_scale = tssResults.interim_duration_scale;
      log_bounds = tssResults.log_bounds;
      tick_format = tssResults.tick_format;
      timeline_scale = tssResults.timeline_scale;
      timeline_scale_segments = tssResults.timeline_scale_segments;

      // stash the new scales
      this.__chart__ = timeline_scale;

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Linear Axes
      ---------------------------------------------------------------------------------------
      **/

      configureLinearAxis(timeline_scale, tl_layout, tl_representation, prev_tl_representation, tl_scale, data, tick_format, unit_width, timeline_container, duration, width, height);

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Collapsed Axis
      ---------------------------------------------------------------------------------------
      **/
      configureCollapsedAxis(tl_representation, prev_tl_scale, tl_scale, tl_layout, interim_duration_axis, interim_duration_scale, duration, data, timeline_container, width, height, unit_width);

      /**
       * AXES
       * Radial Axes
       */
      radial_axis_quantiles = configureRadialAxes(tl_representation, tl_layout, tl_scale, timeline_container, timeline_scale, prev_tl_layout, prev_tl_representation, width, height, radial_axis_quantiles, timeline_scale_segments, radial_axis, duration, timeline_facet, timeline_segment, prev_tl_scale);

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Calendar Axis
      ---------------------------------------------------------------------------------------
      **/
      configureCalendarAxis(tl_representation, duration, data, calendar_axis, timeline_container, prev_tl_representation);

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Grid Axis
      ---------------------------------------------------------------------------------------
      **/
      configureGridAxis(tl_representation, duration, data, grid_axis, timeline_container, prev_tl_representation);

      // It is important that these guys get set here, in case the transitions get interrupted
      const old_scale = prev_tl_scale;
      const old_rep = prev_tl_representation;
      const old_layout = prev_tl_layout;
      prev_tl_scale = tl_scale;
      prev_tl_layout = tl_layout;
      prev_tl_representation = tl_representation;

      // Creates all the elements to be used
      const timeline_event_g = initializeElements(timeline_container, data, duration, width, height, unit_width, tl_representation, configurableTL);

      // Updates those elements to position/size/color them correctly
      const renderComplete = updateElements(interim_duration_scale, timeline_event_g, duration, configurableTL, tl_layout, tl_scale, tl_representation, width, height, data, unit_width, old_layout, old_rep, old_scale, timeline_scale);
      promises.push(renderComplete);
    });
    d3.timer.flush();

    promises.push(new Promise(resolve => {
      // HACK: A way to ensure that we always at least delay the full animation length
      setTimeout(resolve, duration * 3);
    }));

    configurableTL.renderComplete = Promise.all(promises);
    configurableTL.renderComplete.then(() => {
      configurableTL.renderComplete = undefined;
    });
  }

  function dragStarted() {
    if (tl_representation === "Curve" && active_line === undefined) {
      active_line = selectWithParent(".timeline").append("path")
        .datum([])
        .attr("id", "active_line")
        .attr("class", "line");
    }
  }

  function dragged() {
    if (tl_representation === "Curve" && active_line !== undefined && !globals.dirty_curve) {
      active_line.datum()
        .push(d3.mouse(this));

      active_line.attr("d", render_path);
    }
  }

  function dragEnd() {
    globals.dirty_curve = true;
    selectWithParent(".timeline_frame").style("cursor", "auto");

    if (tl_representation === "Curve" && fresh_canvas) {
      selectWithParent("#active_line")
        .transition("active_line_remove")
        .duration(duration)
        .remove();

      selectAllWithParent("rect.event_span")
        .transition("event_span_update")
        .duration(duration)
        .attr("transform", function (d) {
          return translateAlong(d, d.item_index, active_line.node());
        });
      fresh_canvas = false;

      // create actual visible time curve:
      selectWithParent("#timecurve")
        .attr("d", createTimeCurveFunction(unit_width)(
          selectAllWithParent(".event_span")[0].filter((d, i) => i % 2 === 1))
        )
        .style("visibility", "visible");
    }
  }

  function translateAlong(d, index, path) {
    var l = path.getTotalLength();
    var p = path.getPointAtLength(index * l / globals.max_item_index);
    d.curve_x = p.x;
    d.curve_y = p.y;
    d.translated_x = p.x;
    d.translated_y = p.y;
    return "translate(" + p.x + "," + p.y + ")";
  }

  configurableTL.reproduceCurve = function () {
    globals.dirty_curve = true;
    fresh_canvas = false;

    selectWithParent("#timecurve")
      .style("visibility", "hidden");

    active_line = selectWithParent(".timeline").append("path")
      .attr("id", "active_line")
      .attr("class", "line")
      .style("visibility", "hidden")
      .attr("d", render_path);

    selectWithParent("#active_line")
      .transition("active_line_reproduce")
      .duration(duration)
      .remove();

    selectAllWithParent("rect.event_span")
      .transition("event_span_reproduce")
      .duration(duration)
      .attr("transform", function (d) {
        return translateAlong(d, d.item_index, active_line.node());
      });

    // create actual visible time curve:
    selectWithParent("#timecurve")
      .attr("d", createTimeCurveFunction(unit_width)(
        selectAllWithParent(".event_span")[0].filter(function (d, i) {
          return i % 2 === 1;
        }))
      )
      .style("visibility", "hidden");
  };

  configurableTL.resetCurve = function () {
    globals.dirty_curve = false;

    if (tl_representation === "Curve") {
      // remove event annotations during a reset
      selectAllWithParent(".event_annotation")
        .remove();

      selectAllWithParent("rect.event_span")
        .transition("event_span_reset")
        .duration(duration)
        .attr("transform", function (d) {
          d.curve_y = 0;
          return "translate(" + d.curve_x + "," + d.curve_y + ")";
        });
      active_line = undefined;
      fresh_canvas = true;

      selectWithParent(".timeline_frame").style("cursor", "crosshair");

      selectWithParent("#timecurve")
        .style("visibility", "hidden");
    }
  };

  // getter / setter for path
  configurableTL.render_path = function (x) {
    if (!arguments.length) {
      return render_path;
    }
    render_path = x;
    return configurableTL;
  };

  // getter / setter for timeline scale
  configurableTL.tl_scale = function (x) {
    if (!arguments.length) {
      return tl_scale;
    }
    tl_scale = x;
    return configurableTL;
  };

  // getter / setter for timeline layout
  configurableTL.tl_layout = function (x) {
    if (!arguments.length) {
      return tl_layout;
    }
    tl_layout = x;
    return configurableTL;
  };

  // getter / setter for timeline representation
  configurableTL.tl_representation = function (x) {
    if (!arguments.length) {
      return tl_representation;
    }
    tl_representation = x;
    return configurableTL;
  };

  // getter / setter for previous timeline scale
  configurableTL.prev_tl_scale = function (x) {
    if (!arguments.length) {
      return prev_tl_scale;
    }
    prev_tl_scale = x;
    return configurableTL;
  };

  // getter / setter for previous timeline layout
  configurableTL.prev_tl_layout = function (x) {
    if (!arguments.length) {
      return prev_tl_layout;
    }
    prev_tl_layout = x;
    return configurableTL;
  };

  // getter / setter for previous timeline representation
  configurableTL.prev_tl_representation = function (x) {
    if (!arguments.length) {
      return prev_tl_representation;
    }
    prev_tl_representation = x;
    return configurableTL;
  };

  // getter / setter for previous timeline scale
  configurableTL.prev_tl_scale = function (x) {
    if (!arguments.length) {
      return prev_tl_scale;
    }
    prev_tl_scale = x;
    return configurableTL;
  };

  // getter / setter for transition duration
  configurableTL.duration = function (x) {
    if (!arguments.length) {
      return duration;
    }
    duration = x;
    return configurableTL;
  };

  // getter / setter for timeline height
  configurableTL.height = function (x) {
    if (!arguments.length) {
      return height;
    }
    height = x - globals.padding.top - globals.padding.bottom;
    return configurableTL;
  };

  // getter / setter for timeline width
  configurableTL.width = function (x) {
    if (!arguments.length) {
      return width;
    }
    width = x - globals.padding.left - globals.padding.right;
    return configurableTL;
  };

  // getter / setter for timeline scale
  configurableTL.timeline_scale = function (x) {
    if (!arguments.length) {
      return timeline_scale;
    }
    timeline_scale = x;
    return configurableTL;
  };

  // getter / setter for interim_duration_scale scale
  configurableTL.interim_duration_scale = function (x) {
    if (!arguments.length) {
      return interim_duration_scale;
    }
    interim_duration_scale = x;
    return configurableTL;
  };

  // getter / setter for timeline scale
  configurableTL.timeline_scale_segments = function (x) {
    if (!arguments.length) {
      return timeline_scale_segments;
    }
    timeline_scale_segments = x;
    return configurableTL;
  };

  // getter / setter for radial axis quantiles
  configurableTL.radial_axis_quantiles = function (x) {
    if (!arguments.length) {
      return radial_axis_quantiles;
    }
    radial_axis_quantiles = x;
    return configurableTL;
  };

  return configurableTL;
};

function createTimeCurveFunction(unit_width) {
  return d3.svg.line()
    .x(function (d) {
      return d.__data__.translated_x
        + unit_width / 2;
    })
    .y(function (d) {
      return d.__data__.translated_y
        + unit_width / 2;
    })
    .interpolate("cardinal");
}

/**
 * Returns a number if not-nan, 0 otherwise
 * @param {number} num The number to unnan
 * @returns {number} The number or 0 if the number is NaN
 */
function unNaN(num) {
  return (isNaN(num) ? 0 : num) || 0;
}

module.exports = d3.configurableTL;

function initializeElements(timeline_container, data, duration, width, height, unit_width, tl_representation, configurableTL) {
  const timeline_event_g = timeline_container.selectAll(".timeline_event_g")
    .data(data, function (d, idx) {
      return d && d.hasOwnProperty("id") ? d.id : idx;
    });

  /**
  ---------------------------------------------------------------------------------------
  EVENTS
  ---------------------------------------------------------------------------------------
  **/

  // add event containers
  timeline_event_g.exit().transition("timeline_event_remove")
    .style("opacity", 0)
    .duration(duration)
    .remove();

  /**
  ---------------------------------------------------------------------------------------
  EVENT ENTER
  ---------------------------------------------------------------------------------------
  **/

  // define each event and its behaviour
  var timeline_event_g_enter = timeline_event_g.enter()
    .append("g")
    .attr("class", "timeline_event_g")
    .attr("id", d => `event_g${d.event_id}`);

  // define event behaviour
  timeline_event_g_enter
    .on("click", function (d, i) {
      return eventClickListener(tl_representation, unit_width, configurableTL, d, i);
    })
    .on("mouseover", function (d) {
      return eventMouseOverListener(d, tl_representation, unit_width, configurableTL);
    })
    .on("mouseout", eventMouseOutListener);

  // add rect events for linear timelines
  timeline_event_g_enter.append("rect")
    .attr("class", "event_span")
    .attr("height", unit_width)
    .attr("width", unit_width)
    .attr("y", height / 2)
    .attr("x", width / 2)
    .style("stroke", "#fff")
    .style("opacity", 0)
    .style("fill", eventColorMapping);

  // draw elapsed time as bar below the sequence, offset between events
  timeline_event_g_enter.append("rect")
    .attr("class", "time_elapsed")
    .attr("height", 0)
    .attr("width", unit_width * 1.5)
    .attr("y", height / 2)
    .attr("x", width / 2)
    .append("title")
    .style("opacity", 0)
    .text("");

  // add arc path events for radial timelines
  timeline_event_g_enter.append("path")
    .attr("class", "event_span")
    .style("stroke", "#fff")
    .style("opacity", 1)
    .style("fill", eventColorMapping);

  /**
  ---------------------------------------------------------------------------------------
  EVENT SPANS for SEGMENTED layouts
  ---------------------------------------------------------------------------------------
  span enter
  ---------------------------------------------------------------------------------------
  **/
  var event_span = timeline_event_g_enter.selectAll(".event_span_component")
    .data(function (d) {
      let dateTimes;
      switch (globals.segment_granularity) {
      case "days":
        dateTimes = time.utcHour.range(time.utcHour.floor(d.start_date), time.utcHour.ceil(d.end_date));
        break;
      case "weeks":
        dateTimes = time.day.range(time.day.floor(d.start_date), time.day.ceil(d.end_date));
        break;
      case "months":
        dateTimes = time.day.range(time.day.floor(d.start_date), time.day.ceil(d.end_date));
        break;
      case "years":
        dateTimes = time.utcWeek.range(time.utcWeek.floor(d.start_date), time.utcWeek.ceil(d.end_date));
        break;
      case "decades":
        dateTimes = time.month.range(time.month.floor(d.start_date), time.month.ceil(d.end_date));
        break;
      case "centuries":
        dateTimes = d3.range(d.start_date.getUTCFullYear(), d.end_date.getUTCFullYear());
        break;
      case "millenia":
        dateTimes = d3.range(d.start_date.getUTCFullYear(), d.end_date.getUTCFullYear() + 1, 10);
        break;
      case "epochs":
        dateTimes = [d.start_date];
        break;
      default:
        break;
      }
      return dateTimes ? dateTimes.map(function (dateTime) {
        return {
          dateTime,
          event_id: d.event_id
        };
      }) : undefined;
    }, function (d) {
      return d && (d.event_id + d.dateTime);
    })
    .enter();

  event_span.append("rect")
    .attr("class", "event_span_component")
    .style("opacity", 0)
    .style("fill", eventSpanColorMapping)
    .attr("height", unit_width)
    .attr("width", unit_width)
    .attr("y", height / 2)
    .attr("x", width / 2);

  event_span.append("path")
    .attr("class", "event_span_component")
    .style("opacity", 0)
    .style("fill", eventSpanColorMapping);

  /**
  ---------------------------------------------------------------------------------------
  terminal span indicators for segmented layouts
  ---------------------------------------------------------------------------------------
  **/

  // add right-facing triangle path to indicate beginning of span
  timeline_event_g_enter.append("path")
    .attr("class", "path_end_indicator")
    .style("opacity", 0)
    .attr("d", d3.svg.symbol()
      .type("triangle-up")
      .size(unit_width * 1.5)
    )
    .style("display", "none");

  return timeline_event_g;
}

function updateElements(interim_duration_scale, timeline_event_g, duration, configurableTL, tl_layout, tl_scale, tl_representation, width, height, data, unit_width, prev_tl_layout, prev_tl_representation, prev_tl_scale, timeline_scale) {
  /**
  ---------------------------------------------------------------------------------------
  EVENT UPDATE (TRANSITIONS)
  ---------------------------------------------------------------------------------------
  **/

  const start = new Date();
  const initialTransition = timeline_event_g.transition("timeline_event_g_early_update")
    .delay(0)
    .duration(duration);

  earlyUpdate(initialTransition, tl_layout, prev_tl_layout, tl_representation, prev_tl_representation, tl_scale, prev_tl_scale);

  // configurableTL.currentTransition = timeline_event_g_final_update;
  transitionLog(start, initialTransition);

  /**
   * Trickles in attribute tweening based on data items
   * @param {*} d The data item
   * @param {*} i The index of the data item
   * @return {number} The delay that should be applied to the given item
   */
  function trickleDelayFn(d, i) {
    return (data.length - i) / data.length * duration;
  }

  // Render loop
  return onTransitionComplete(initialTransition)
    .then(() => {
      // First update
      const transition = timeline_event_g.transition("timeline_event_g_update")
        .delay(trickleDelayFn)
        .duration(duration);
      update(tl_layout, tl_scale, tl_representation, width, height, data, unit_width, prev_tl_layout, prev_tl_representation, prev_tl_scale, timeline_scale, transition);
      transitionLog(start, transition);
      return onTransitionComplete(transition);
    })
    .then(() => {
      // Second update
      const transition = timeline_event_g.transition("timeline_event_g_delayed_update")
        .delay(trickleDelayFn)
        .duration(duration);
      delayedUpdate(tl_layout, tl_representation, tl_scale, interim_duration_scale, unit_width, timeline_scale, transition);
      transitionLog(start, transition);
      return onTransitionComplete(transition);
    })
    .then(() => {
      // Final update
      const transition = timeline_event_g.transition("timeline_event_g_final_update")
        .delay(trickleDelayFn)
        .duration(duration);
      finalUpdate(tl_layout, transition);
      transitionLog(start, transition);
      return onTransitionComplete(transition);
    });
}

function configureTimelineScaleSegments(tl_layout, tl_representation, tl_scale, timeline_scale, tick_format, data, width, height, unit_width, log_bounds, interim_duration_scale) {
  let timeline_scale_segments = [];
  let format = function (d) {
    return globals.formatAbbreviation(d);
  };

  function updateScale(scale, representation) {
    if (scale === "Chronological") {
      if (representation === "Radial") {
        // valid scale
        // initialize the time scale
        timeline_scale = d3.time.scale()
          .range([0, 2 * Math.PI]);

        const endYear = data.max_end_date.getUTCFullYear();
        const startYear = data.min_start_date.getUTCFullYear();

        function yearBasedScale(years_per_segment) {
          const start = Math.floor(startYear / years_per_segment) * years_per_segment;
          const end = (Math.ceil((endYear + 1) / years_per_segment) + 1) * years_per_segment;
          timeline_scale_segments = time.year.range(moment([start, 0, 1]).toDate(), moment([end, 0, 1]).toDate(), years_per_segment);
          timeline_scale.domain([moment([start, 0, 1]).toDate(), moment([(end + years_per_segment), 0, 1]).toDate()]);
        }

        switch (globals.segment_granularity) {
        case "days":
          if (time.hour.count(time.day.floor(data.min_start_date), time.day.ceil(data.max_end_date)) > 24) {
            timeline_scale_segments = time.hour.range(time.day.floor(data.min_start_date), time.hour.offset(time.day.ceil(data.max_end_date), 3), 12);
          } else {
            timeline_scale_segments = time.hour.range(time.day.floor(data.min_start_date), time.hour.offset(time.day.ceil(data.max_end_date), 3), 3);
          }
          timeline_scale.domain([time.day.floor(data.min_start_date), time.day.ceil(data.max_end_date)]);
          break;
        case "weeks":
          timeline_scale_segments = time.week.range(time.week.floor(data.min_start_date), time.week.offset(data.max_end_date, 1), 2);
          timeline_scale.domain([time.week.floor(data.min_start_date), time.week.offset(data.max_end_date, 1)]);
          break;
        case "months":
          timeline_scale_segments = time.month.range(time.month.floor(data.min_start_date), time.month.offset(data.max_end_date, 1));
          timeline_scale.domain([time.month.floor(data.min_start_date), time.month.offset(data.max_end_date, 1)]);
          break;
        case "years":
          timeline_scale_segments = time.year.range(time.year.floor(data.min_start_date), time.year.offset(data.max_end_date, 1));
          timeline_scale.domain([time.year.floor(data.min_start_date), time.year.offset(data.max_end_date, 1)]);
          break;
        case "decades":
          yearBasedScale(endYear - startYear >= 50 ? 10 : 5);
          break;
        case "centuries":
          yearBasedScale(endYear - startYear >= 500 ? 100 : 20);
          break;
        case "millenia":
          yearBasedScale(endYear - startYear >= 5000 ? 1000 : 200);
          break;
        case "epochs":
          timeline_scale_segments = [data.min_start_date.valueOf(), data.min_start_date.valueOf() * 0.25, data.min_start_date.valueOf() * 0.5, data.min_start_date.valueOf() * 0.75];
          timeline_scale.domain([data.min_start_date, data.max_end_date]);
          break;
        default:
          break;
        }
        logEvent(scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date, "scale_update");
      } else {
        // valid scale
        if (globals.date_granularity === "epochs") { // eslint-disable-line no-lonely-if
          timeline_scale = d3.scale.linear()
            .range([0, width - unit_width])
            .domain([data.min_start_date.valueOf(), data.max_end_date.valueOf()]);
          tick_format = format;
        } else {
          timeline_scale = d3.time.scale()
            .range([0, width - unit_width])
            .domain([data.min_start_date, data.max_end_date]);
          if (globals.date_granularity === "years" && data.min_start_date.getUTCFullYear() <= 100) {
            tick_format = function (d) {
              if (d.getUTCFullYear() > 0) {
                return +d.getUTCFullYear() + " AD";
              } else if (d.getUTCFullYear() < 0) {
                return (-1 * d.getUTCFullYear()) + " BC";
              } else if (d.getUTCFullYear() === 0) {
                return 0;
              }
            };
          }
        }
      }
      logEvent(scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date, "scale_update");
    } else if (scale === "Log") {
      timeline_scale = d3.scale.log()
        .range([0, width - unit_width]);

      log_bounds = -1 * Math.abs(data.max_end_date.valueOf() - data.min_start_date.valueOf()) - 1;
      timeline_scale.domain([log_bounds, -1]);

      switch (globals.segment_granularity) {
      case "days":
        log_bounds = -1 * time.hour.count(data.min_start_date, data.max_end_date) - 1;
        tick_format = function (d) {
          return d + " hours";
        };
        break;
      case "weeks":
        log_bounds = -1 * time.day.count(data.min_start_date, data.max_end_date) - 1;
        tick_format = function (d) {
          return d + " days";
        };
        break;
      case "months":
        log_bounds = -1 * time.week.count(data.min_start_date, data.max_end_date) - 1;
        tick_format = function (d) {
          return d + " weeks";
        };
        break;
      case "years":
        log_bounds = -1 * time.month.count(data.min_start_date, data.max_end_date) - 1;
        tick_format = function (d) {
          return d + " months";
        };
        break;
      case "decades":
      case "centuries":
      case "millenia":
        log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
        tick_format = function (d) {
          return d + " years";
        };
        break;
      default:
        log_bounds = -1 * Math.abs(data.max_end_date.valueOf() - data.min_start_date.valueOf()) - 1;
        tick_format = format;
        break;
      }
      timeline_scale.domain([log_bounds, -1]);
      logEvent(scale + " scale updated with " + globals.segment_granularity + " granularity and range: " + data.min_start_date + " - " + data.max_end_date, "scale_update");
    } else if (scale === "Collapsed" || scale === "Sequential") {
      if (scale === "Sequential" && representation === "Radial") {
        // valid scale
        var index_offset = 5;
        if (globals.max_seq_index > 500) {
          index_offset = 100;
        } else if (globals.max_seq_index > 100) {
          index_offset = 50;
        } else if (globals.max_seq_index > 50) {
          index_offset = 10;
        } else if (globals.max_seq_index > 10) {
          index_offset = 5;
        } else {
          index_offset = 1;
        }
        timeline_scale = d3.scale.linear()
          .range([0, 2 * Math.PI])
          .domain([0, (Math.ceil(globals.max_seq_index / index_offset) + 1) * index_offset]);
        timeline_scale_segments = d3.range(0, (Math.ceil(globals.max_seq_index / index_offset) + 1) * index_offset, index_offset);
        logEvent(tl_scale + " scale updated with range: 0 - " + globals.max_seq_index, "scale_update");
      } else {
        timeline_scale = d3.scale.linear()
          .range([0, globals.max_seq_index * 1.5 * unit_width - unit_width])
          .domain([0, globals.max_seq_index * unit_width]);

        if (scale === "Collapsed") {
          let i = -1, last_start_date;

                // valid Collapsed scale
          data.forEach(function (item) {
            i++;
            if (i === 0) {
              item.time_elapsed = 0;
              last_start_date = item.start_date;
            } else if ((item.start_date.valueOf() - last_start_date.valueOf()) > 0) {
              item.time_elapsed = item.start_date.valueOf() - last_start_date.valueOf();
              if (globals.date_granularity === "epochs") {
                item.time_elapsed_label = format(item.start_date.valueOf() - last_start_date.valueOf()) + " years";
              } else {
                item.time_elapsed_label = moment(item.start_date).from(moment(last_start_date), true);
              }
              last_start_date = item.start_date;
            } else {
              item.time_elapsed = 0;
              if (globals.date_granularity === "epochs") {
                item.time_elapsed_label = format(item.start_date.valueOf() - last_start_date.valueOf()) + " years";
              } else {
                item.time_elapsed_label = moment(item.start_date).from(moment(last_start_date), true);
              }
            }
          });

          var max_time_elapsed = d3.max(data, function (d) { return d.time_elapsed; });

                // initialize the time scale
          if (globals.date_granularity === "epochs") {
            interim_duration_scale = d3.scale.log().range([0.25 * unit_width, 4 * unit_width])
                    .domain([1, max_time_elapsed]);
          } else {
            interim_duration_scale = d3.scale.linear().range([0.25 * unit_width, 4 * unit_width])
                    .domain([0, max_time_elapsed]);
          }
        }

        logEvent(scale + " scale updated with range: 0 - " + globals.max_seq_index, "scale_update");
      }
    }
  }

  // update scales
  switch (tl_layout) {
  case "Unified":
    if (tl_representation === "Linear" &&
        (tl_scale === "Chronological" || tl_scale === "Log" || tl_scale === "Collapsed")) {
      updateScale(tl_scale, tl_representation);
    } else if (tl_representation === "Radial" &&
        (tl_scale === "Chronological" || tl_scale === "Sequential")) {
      updateScale(tl_scale, tl_representation);
    }
    break;
  default:
    break;
  case "Faceted":
    switch (tl_representation) {

    case "Linear":
      switch (tl_scale) {

      case "Chronological":
      case "Log":
      case "Sequential":
              // valid scale
        updateScale(tl_scale, tl_representation);
        break;

      case "Relative":
              // valid scale
        if (globals.date_granularity === "epochs") {
          timeline_scale = d3.scale.linear()
                  .range([0, width - unit_width])
                  .domain([0, globals.max_end_age]);
          tick_format = format;
        } else {
          timeline_scale = d3.scale.linear()
                  .range([0, width - unit_width])
                  .domain([0, globals.max_end_age]);
          tick_format = function (d) {
            var converted_tick = d;
            if ((globals.max_end_age / 86400000) > 1000) {
              converted_tick = Math.round(d / 31536000730) + " years";
            } else if ((globals.max_end_age / 86400000) > 120) {
              converted_tick = Math.round(d / 2628000000) + " months";
            } else if ((globals.max_end_age / 86400000) > 2) {
              converted_tick = Math.round(d / 86400000) + " days";
            } else {
              converted_tick = Math.round(d / 3600000) + " hours";
            }
            return converted_tick;
          };
        }
        logEvent(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: 0 - " + globals.max_end_age, "scale_update");
        break;
      default:
        break;
      }
      break;
    default:
      break;

    case "Radial":
      switch (tl_scale) {

      case "Chronological":
      case "Sequential":
        updateScale(tl_scale, tl_representation);
        break;

      case "Relative":
              // valid scale
        timeline_scale = d3.scale.linear()
                .range([0, 2 * Math.PI]);

        if (globals.segment_granularity === "days") {
          timeline_scale.domain([0, globals.max_end_age]);
          timeline_scale_segments = d3.range(0, globals.max_end_age / 3600000 + 1);
        } else {
          timeline_scale.domain([0, globals.max_end_age * 1.05]);
          timeline_scale_segments = d3.range(0, Math.round((globals.max_end_age + 86400000) / 86400000));
        }
        logEvent(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: 0 - " + data.max_end_age, "scale_update");
        break;
      default:
        break;
      }
      break;
    }
    break;

  case "Segmented":
    if (tl_representation === "Linear" && tl_scale === "Chronological") {
        // valid scale
      timeline_scale = d3.scale.linear()
          .range([0, width - unit_width]);

      switch (globals.segment_granularity) {
      case "days":
        timeline_scale.domain([0, 24]);
        break;
      case "weeks":
        timeline_scale.domain([0, 7]);
        break;
      case "months":
        timeline_scale.domain([1, 32]);
        break;
      case "years":
        timeline_scale.domain([1, 53]);
        break;
      case "decades":
        timeline_scale.domain([0, 120]);
        break;
      case "centuries":
        timeline_scale.domain([0, 100]);
        break;
      case "millenia":
        timeline_scale.domain([0, 1000]);
        break;
      case "epochs":
        timeline_scale.domain([data.min_start_date.valueOf(), data.max_end_date.valueOf()]);
        break;
      default:
        break;
      }
      logEvent(tl_scale + " scale updated with domain: " + timeline_scale.domain(), "scale_update");
    } else if (tl_representation === "Radial" && tl_scale === "Chronological") {
        // valid scale
      timeline_scale = d3.scale.linear()
          .range([0, 2 * Math.PI]);

      switch (globals.segment_granularity) {
      case "days":
        timeline_scale_segments = d3.range(0, 25, 2);
        timeline_scale.domain([0, 24]);
        break;
      case "weeks":
        timeline_scale_segments = d3.range(0, 8);
        timeline_scale.domain([0, 7]);
        break;
      case "months":
        timeline_scale_segments = d3.range(1, 33);
        timeline_scale.domain([1, 33]);
        break;
      case "years":
        timeline_scale_segments = d3.range(1, 54, 2);
        timeline_scale.domain([1, 53]);
        break;
      case "decades":
        timeline_scale_segments = d3.range(0, 121, 12);
        timeline_scale.domain([0, 125]);
        break;
      case "centuries":
        timeline_scale_segments = d3.range(0, 101, 10);
        timeline_scale.domain([0, 105]);
        break;
      case "millenia":
        timeline_scale_segments = d3.range(0, 1001, 100);
        timeline_scale.domain([0, 1050]);
        break;
      case "epochs":
        timeline_scale_segments = [data.min_start_date.valueOf()];
        timeline_scale.domain([data.min_start_date.valueOf(), data.max_end_date.valueOf()]);
        break;
      default:
        break;
      }
      logEvent(tl_scale + " scale updated with domain: " + timeline_scale.domain(), "scale_update");
    }
    break;
  }

  return { timeline_scale_segments, timeline_scale, tick_format, log_bounds, interim_duration_scale };
}

function configureSegments(timeline_container, duration, width, height, tl_layout, tl_representation, tl_scale, unit_width) {
  const timeline_segment = timeline_container.selectAll(".timeline_segment")
    .data(globals.segments.domain());

  let segment_number = 0;

  const timeline_segment_exit = timeline_segment.exit().transition("timeline_segment_exit")
    .duration(duration)
    .remove();

  // define each segment and its rect container
  const timeline_segment_enter = timeline_segment.enter()
    .append("g")
    .attr("class", "timeline_segment")
    .each(insertFacetAtAxis);

  const timeline_segment_update = timeline_segment.transition("timeline_segment_update")
    .duration(duration);

  timeline_segment_enter.append("rect")
    .attr("class", "timeline_segment_frame")
    .attr("width", d3.max([0, width]))
    .attr("height", 0);

  // print the name of each segment
  timeline_segment_enter.append("text")
    .attr("class", "segment_title")
    .attr("dy", "-0.5em")
    .style("text-anchor", "middle")
    .text("")
    .attr("transform", "translate(0,0)rotate(0)");

  // update segment container dimensions
  timeline_segment_update.select(".timeline_segment_frame")
    .attr("width", d3.max([0, width]))
    .attr("height", function () {
      if (tl_layout !== "Segmented" || tl_representation === "Calendar" || tl_representation === "Grid") {
        return 0;
      } else if (tl_representation === "Linear") {
        return d3.max([0, height / globals.num_segments]);
      } else if (tl_representation === "Radial") {
        return 0;
      } else if (tl_representation === "Calendar" || tl_representation === "Grid") {
        return 0;
      }

      return 0;
    })
    .attr("transform", function () {
      var offset_x,
        offset_y;

      if (tl_layout !== "Segmented" || tl_representation === "Calendar" || tl_representation === "Grid") {
        offset_x = 0;
        offset_y = 0;
      } else if (tl_representation === "Linear") {
        offset_x = 0;
        offset_y = segment_number * (height / globals.num_segments);
        segment_number++;
      } else if (tl_representation === "Radial") {
        offset_x = width / 2;
        offset_y = 0;
      } else {
        offset_x = width / 2;
        offset_y = height / 2;
      }
      return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
    });

  segment_number = 0;

  timeline_segment_update.select("text.segment_title")
    .text(function (d) {
      if (tl_layout !== "Segmented" || tl_representation === "Calendar" || tl_representation === "Grid" || globals.segment_granularity === "epochs") {
        return "";
      }
      return d;
    })
    .attr("transform", function () {
      var offset_x = 0,
        offset_y = 0,
        rotation = 0;
      if (tl_layout !== "Segmented" || tl_representation === "Calendar" || tl_representation === "Grid") {
        offset_x = width / 2;
        offset_y = height / 2;
        rotation = 0;
      } else if (tl_representation === "Linear") {
        offset_x = 0;
        offset_y = segment_number * (height / globals.num_segments) + height / globals.num_segments / 2;
        rotation = 270;
        segment_number++;
      } else if (tl_representation === "Radial") {
        offset_x = segment_number % globals.num_segment_cols * (width / globals.num_segment_cols) + width / globals.num_segment_cols / 2;
        offset_y = Math.floor(segment_number / globals.num_segment_cols) * (height / globals.num_segment_rows) + globals.buffer + unit_width;
        rotation = 0;
        segment_number++;
      }
      return "translate(" + offset_x + " ," + offset_y + ")rotate(" + rotation + ")";
    });

  timeline_segment_exit.select(".timeline_segment_frame")
    .attr("height", 0);

  timeline_segment_exit.select("text.segment_title")
    .attr("transform", "translate(" + (0 - width) + " ,0)");

  logEvent("segment containers updated", "drawing");

  return { timeline_segment };
}


function configureFacets(timeline_container, duration, width, height, tl_layout, tl_representation, tl_scale, unit_width) {
  const timeline_facet = timeline_container.selectAll(".timeline_facet")
    .data(globals.facets.domain());

  const timeline_facet_exit = timeline_facet.exit().transition("timeline_facet_exit")
    .duration(duration)
    .remove();

  let facet_number = 0;

  // define each facet and its rect container
  const timeline_facet_enter = timeline_facet.enter()
    .append("g")
    .attr("class", "timeline_facet")
    .each(insertFacetAtAxis);

  // update facet container dimensions
  const timeline_facet_update = timeline_facet.transition("timeline_facet_update")
    .duration(duration);

  timeline_facet_enter.append("rect")
    .attr("class", "timeline_facet_frame")
    .attr("width", d3.max([0, width]))
    .attr("height", 0);

  timeline_facet_enter.append("title")
    .text("");

  // print the name of each facet
  timeline_facet_enter.append("text")
    .attr("class", "facet_title")
    .attr("dy", "-0.5em")
    .style("text-anchor", "middle")
    .text(d => getFacetTitleText(tl_layout, tl_representation, height, d))
    .attr("transform", "translate(0,0)rotate(0)");

  timeline_facet_update.select("title")
    .text(d => d);

  timeline_facet_update.select(".timeline_facet_frame")
    .attr("width", d3.max([0, width]))
    .attr("height", () => {
      if (tl_layout === "Faceted" && tl_representation === "Linear") {
        return d3.max([0, height / globals.num_facets]);
      }
      return 0;
    })
    .attr("transform", function () {
      var offset_x,
        offset_y;

      if (tl_layout !== "Faceted") {
        offset_x = width / 2;
        offset_y = height / 2;
      } else if (tl_representation === "Linear") {
        offset_x = 0;
        offset_y = facet_number * (height / globals.num_facets);
        facet_number++;
      } else if (tl_representation === "Radial" || (tl_representation === "Spiral" && tl_scale === "Sequential")) {
        offset_x = width / 2;
        offset_y = height / 2;
      } else {
        offset_x = width / 2;
        offset_y = height / 2;
      }
      return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
    });

  timeline_facet_exit.select(".timeline_facet_frame")
    .attr("height", 0);

  facet_number = 0;

  timeline_facet_update.select("text.facet_title")
    .text(d => getFacetTitleText(tl_layout, tl_representation, height, d))
    .attr("transform", function () {
      var offset_x = 0,
        offset_y = 0,
        rotation = 0;
      if (tl_layout !== "Faceted") {
        offset_x = width / 2;
        offset_y = height / 2;
        rotation = 0;
      } else if (tl_representation === "Linear") {
        offset_x = 0;
        offset_y = facet_number * (height / globals.num_facets) + height / globals.num_facets / 2;
        rotation = 270;
        facet_number++;
      } else if (tl_representation === "Radial") {
        offset_x = facet_number % globals.num_facet_cols * (width / globals.num_facet_cols) + width / globals.num_facet_cols / 2;
        offset_y = Math.floor(facet_number / globals.num_facet_cols) * (height / globals.num_facet_rows) + globals.buffer + unit_width;
        rotation = 0;
        facet_number++;
      } else if (tl_representation === "Spiral" && tl_scale === "Sequential") {
        offset_x = facet_number % globals.num_facet_cols * (width / globals.num_facet_cols) + width / globals.num_facet_cols / 2;
        offset_y = Math.floor(facet_number / globals.num_facet_cols) * globals.spiral_dim + globals.buffer + unit_width;
        rotation = 0;
        facet_number++;
      } else {
        offset_x = width / 2;
        offset_y = height / 2;
        rotation = 0;
      }
      return "translate(" + unNaN(offset_x) + " ," + unNaN(offset_y) + ")rotate(" + unNaN(rotation) + ")";
    });

  timeline_facet_exit.select("text.facet_title")
    .attr("transform", "translate(" + (0 - width) + " ,0)");

  logEvent("facet containers updated", "drawing");

  return { timeline_facet };
}

function initialOpacity(d, tl_layout, prev_tl_layout, tl_representation, prev_tl_representation, tl_scale, prev_tl_scale, checkRadial) {
  // If we were segmented at all, or if we were radial at all, then hide it.
  const noRadial = (tl_representation !== "Radial" && prev_tl_representation !== "Radial");
  const hasRadial = (tl_representation === "Radial" && prev_tl_representation === "Radial");
  const passesRepresentationCheck = checkRadial ? hasRadial : noRadial;
  if ((tl_layout === "Segmented" && prev_tl_layout === "Segmented") || passesRepresentationCheck) {
    return 0;

    // If it isn't "active" or wasn't "active"
  } else if (globals.prev_active_event_list.indexOf(d.event_id) === -1 || globals.active_event_list.indexOf(d.event_id) === -1) {
    // If we are just hiding it, then set opaticy to 0
    if (globals.filter_type === "Hide") {
      return 0;
    } else if (globals.filter_type === "Emphasize") {
      // Otherwise if we are not currently active, then return .1, cause we are not in the active list
      if (globals.active_event_list.indexOf(d.event_id) === -1) {
        return 0.1;
      }

      // We are in the active list, return 1 to show it at full opacity
      return 1;
    }
    // We are in the active list and we are selected, then show fully.
  } else if (globals.active_event_list.indexOf(d.event_id) !== -1 && d.selected) {
    return 1;
  } else if (globals.active_event_list.indexOf(d.event_id) !== -1) {
    if (tl_scale !== prev_tl_scale || tl_layout !== prev_tl_layout || tl_representation !== prev_tl_representation) {
      return 0.5;
    }

    return 1;
  } else {
    return 0.1;
  }
}

function eventSpanColorMapping() {
  if (globals.categories.domain()[0] === undefined) {
    return "#E45641";
  }

  return globals.categories(d3.select(this.parentNode).datum().category);
}

function eventColorMapping(d) {
  return d.category === undefined ? "#E45641" : globals.categories(d.category);
}

function eventMouseOutListener(d) {
  selectAllWithParent(".temporary_annotation").transition("event_hover_hide").duration(100).style("opacity", 0);
  selectAllWithParent(".temporary_annotation").transition("event_hover_remove").delay(100).remove();

  d3.select(this)
    .selectAll(".event_span")
    .attr("filter", "none")
    .style("stroke", "#fff")
    .style("stroke-width", "0.25px");
  d3.select(this)
    .selectAll(".event_span_component")
    .style("stroke", "#fff")
    .style("stroke-width", "0.25px");
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
}

function eventMouseOverListener(d, tl_representation, unit_width, configurableTL) {
  d3.select(this)
    .selectAll(".event_span")
    .attr("filter", "url(#drop-shadow)")
    .style("stroke", "#f00")
    .style("stroke-width", "1.25px")
    .style("cursor", "url(\"" + imageUrls("pin.png") + "\"),auto");
  d3.select(this)
    .selectAll(".event_span_component")
    .style("stroke", "#f00")
    .style("stroke-width", "0.5px")
    .style("cursor", "url(\"" + imageUrls("pin.png") + "\"),auto");

  const eventHasAnnotations = selectAllWithParent(`.event_${d.event_id}_annotation`).size() > 0;
  if (!eventHasAnnotations) {
    var x_pos = d3.event.x,
      y_pos = d3.event.y;

    var item_x_pos = 0;
    var item_y_pos = 0;

    if (tl_representation !== "Radial") {
      item_x_pos = d.rect_x_pos + d.rect_offset_x + globals.padding.left + unit_width * 0.5;
      item_y_pos = d.rect_y_pos + d.rect_offset_y + globals.padding.top + unit_width * 0.5;
    } else {
      item_x_pos = d.path_x_pos + d.path_offset_x + globals.padding.left;
      item_y_pos = d.path_y_pos + d.path_offset_y + globals.padding.top;
    }

    const annoText = d.content_text || d.facet;
    const { element } = annotateEvent(configurableTL, annoText, item_x_pos, item_y_pos, (x_pos - item_x_pos), (y_pos - item_y_pos), 50, 50, d3.min([annoText.length * 10, 100]), d.event_id, { id: -1 });
    element.classed("temporary_annotation", true);

    element.select("rect.annotation_frame").style("stroke", "#f00");

    element.transition("event_hover_show").duration(250).style("opacity", 1);
  }
}

function eventClickListener(tl_representation, unit_width, configurableTL, d) {
  logEvent("event " + d.event_id + " clicked", "event_click");

  if (!d.selected || d.selected === undefined) {
    var x_pos = d3.event.x,
      y_pos = d3.event.y;
    d.selected = true;

    d3.select(this)
      .selectAll(".event_span")
      .attr("filter", "url(#drop-shadow)")
      .style("stroke", "#f00")
      .style("stroke-width", "1.25px");
    d3.select(this)
      .selectAll(".event_span_component")
      .style("stroke", "#f00")
      .style("stroke-width", "1px");

    // annotate the event with its label if shift is not clicked
    if (!d3.event.shiftKey) {
      x_pos = d3.event.x;
      y_pos = d3.event.y;

      var item_x_pos = 0;
      var item_y_pos = 0;

      if (tl_representation !== "Radial") {
        item_x_pos = d.rect_x_pos + d.rect_offset_x + globals.padding.left + unit_width * 0.5;
        item_y_pos = d.rect_y_pos + d.rect_offset_y + globals.padding.top + unit_width * 0.5;
      } else {
        item_x_pos = d.path_x_pos + d.path_offset_x + globals.padding.left;
        item_y_pos = d.path_y_pos + d.path_offset_y + globals.padding.top;
      }

      let highestId = 0;
      globals.annotation_list.forEach(n => {
        if (n.id > highestId) {
          highestId = n.id;
        }
      });
      var annoText = d.content_text || d.facet;
      var annotation = {
        id: highestId + 1,
        item_index: d.event_id,
        count: d.annotation_count,
        content_text: annoText,
        x_pos: item_x_pos,
        y_pos: item_y_pos,
        x_offset: (x_pos - item_x_pos),
        y_offset: (y_pos - item_y_pos),
        x_anno_offset: 50,
        y_anno_offset: 50,
        label_width: d3.min([annoText.length * 10, 100]),
        z_index: getNextZIndex()
      };

      globals.annotation_list.push(annotation);

      logEvent("event " + d.event_id + " annotation: <<" + annoText + ">>");

      selectAllWithParent(".temporary_annotation").remove();

      const { element } = annotateEvent(configurableTL, annoText, item_x_pos, item_y_pos, (x_pos - item_x_pos), (y_pos - item_y_pos), 50, 50, d3.min([annoText.length * 10, 100]), d.event_id, annotation);

      element.transition("event_annotation_show").duration(50).style("opacity", 1);

      d.annotation_count++;
    } else {
      logEvent("event " + d.event_id + " annotation supressed (shift key)");
    }
  } else if (!d3.event.shiftKey) {
    d.selected = false;
    d3.select(this)
      .selectAll(".event_span")
      .attr("filter", "none")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");
    d3.select(this)
      .selectAll(".event_span_component")
      .style("stroke", "#fff")
      .style("stroke-width", "0.25px");

    logEvent("event " + d.event_id + " annotation removed");

    // Remove all annotations for this event
    selectAllWithParent(`.event_${d.event_id}_annotation`).remove();
  }
}

function configureGridAxis(tl_representation, duration, data, grid_axis, timeline_container, prev_tl_representation) {
  if (tl_representation === "Grid") {
    // determine the range, round to whole centuries
    var grid_min = Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100,
      grid_max = Math.ceil((data.max_end_date.getUTCFullYear() + 1) / 100) * 100;

    grid_axis.min_year(grid_min).max_year(grid_max);

    var grid_axis_container = timeline_container.selectAll(".grid_axis")
      .data([d3.range(grid_min, grid_max)]);

    logEvent("Grid axis domain: " + grid_min + " - " + grid_max, "axis_update");

    grid_axis_container.enter()
      .append("g")
      .attr("class", "grid_axis")
      .style("opacity", 0);

    timeline_container.selectAll(".grid_axis")
      .transition("grid_axis_update")
      .delay(0)
      .duration(duration)
      .style("opacity", 1)
      .call(grid_axis.min_year(grid_min).max_year(grid_max));

    logEvent("Grid axis updated", "axis_update");
  } else if (prev_tl_representation === "Grid" && tl_representation !== "Grid") {
    hideAxis(timeline_container, duration, "grid_axis");
  }
}

function hideAxis(timeline_container, duration, selector) {
  timeline_container.selectAll(`.${selector}`)
    .transition(`${selector}_hide`)
    .duration(duration * 3)
    .style("opacity", 0);

  timeline_container.selectAll(".grid_axis")
    .transition(`${selector}_remove`)
    .delay(duration * 3)
    .remove();
}

function configureCalendarAxis(tl_representation, duration, data, calendar_axis, timeline_container, prev_tl_representation) {
  if (tl_representation === "Calendar") {
    // determine the range, round to whole years
    const range_floor = data.min_start_date.getUTCFullYear(),
      range_ceil = data.max_end_date.getUTCFullYear();

    var calendar_axis_container = timeline_container.selectAll(".calendar_axis")
      .data([d3.range(range_floor, range_ceil + 1)]);

    calendar_axis_container.enter()
      .append("g")
      .attr("class", "calendar_axis")
      .style("opacity", 0);

    timeline_container.selectAll(".calendar_axis")
      .transition("calendar_axis_update")
      .delay(0)
      .duration(duration)
      .style("opacity", 1)
      .call(calendar_axis);

    logEvent("Calendar axis updated", "axis_update");
  } else if (prev_tl_representation === "Calendar" && tl_representation !== "Calendar") {
    hideAxis(timeline_container, duration, "calendar_axis");
  }
}

function configureSegmentedRadialAxis(tl_representation, tl_layout, tl_scale, duration, radial_axis_quantiles, timeline_scale_segments, radial_axis, timeline_segment, width, height, timeline_scale, timeline_container, prev_tl_representation, prev_tl_layout) {
  if (tl_representation === "Radial" && tl_layout === "Segmented") {
    radial_axis.duration(duration);

    radial_axis.radial_axis_units("Segments");
    if (radial_axis_quantiles !== timeline_scale_segments) {
      radial_axis_quantiles = timeline_scale_segments;
    }
    radial_axis.final_quantile(timeline_scale_segments[timeline_scale_segments.length - 1]);

    // get radial_axis_quantiles of timeline_scale_segments for radial axis ticks
    if (globals.segment_granularity === "epochs") {
      radial_axis.track_bounds(1);
    } else {
      radial_axis.track_bounds(globals.num_tracks + 1);
    }

    // update the radial axis for segmented radial timelines
    var segmented_radial_axis = timeline_segment.selectAll(".segmented_radial_axis")
      .data([radial_axis_quantiles]);

    let segment_number = 0;

    segmented_radial_axis.enter()
      .append("g")
      .attr("class", "segmented_radial_axis")
      .style("opacity", 0);

    timeline_segment.selectAll(".segmented_radial_axis")
      .transition("segmented_radial_axis_update")
      .duration(0)
      .style("opacity", 1)
      .attr("transform", function () {
        var offset_x,
          offset_y;

        if (tl_layout !== "Segmented" || tl_representation === "Calendar" || tl_representation === "Grid") {
          offset_x = width / 2;
          offset_y = height / 2;
        } else if (tl_representation === "Linear") {
          offset_x = width / 2;
          offset_y = segment_number * (height / globals.num_segments);
          segment_number++;
        } else if (tl_representation === "Radial") {
          var segment_dim_x = width / globals.num_segment_cols;
          var segment_dim_y = height / globals.num_segment_rows;

          offset_x = segment_number % globals.num_segment_cols * segment_dim_x;
          offset_y = Math.floor(segment_number / globals.num_segment_cols) * segment_dim_y + globals.buffer;

          segment_number++;
        } else {
          offset_x = width / 2;
          offset_y = height / 2;
        }
        return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
      })
      .call(radial_axis.radial_axis_scale(timeline_scale).x_pos(width / globals.num_segment_cols / 2).y_pos(height / globals.num_segment_rows / 2));

    logEvent("Segmented Radial axis updated", "axis_update");
  } else if (prev_tl_representation === "Radial" && prev_tl_layout === "Segmented" && (tl_representation !== "Radial" || tl_layout !== "Segmented")) {
    hideAxis(timeline_container, duration, "segmented_radial_axis");
  }

  return { radial_axis_quantiles };
}

function configureFacetedRadialAxes(tl_layout, tl_representation, tl_scale, radial_axis, radial_axis_quantiles, duration, timeline_scale_segments, timeline_facet, width, height, timeline_scale, prev_tl_scale, prev_tl_layout, prev_tl_representation, timeline_container) {
  if (tl_representation === "Radial" && tl_layout === "Faceted") {
    radial_axis.duration(duration);

    if (tl_scale === "Relative") {
      radial_axis_quantiles = [];
      radial_axis.radial_axis_units("Relative");
      if (globals.segment_granularity === "days") {
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.125)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.25)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.375)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.5)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.625)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.75)) * 3600000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.875)) * 3600000);
        radial_axis.final_quantile(Math.round(d3.quantile(timeline_scale_segments, 1)) * 3600000);
      } else {
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0)) * 86400000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.2)) * 86400000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.4)) * 86400000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.6)) * 86400000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 0.8)) * 86400000);
        radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments, 1)) * 86400000);
        radial_axis.final_quantile(Math.round(d3.quantile(timeline_scale_segments, 1)) * 86400000);
      }
      radial_axis.track_bounds(globals.max_num_tracks + 1);
    } else {
      if (radial_axis_quantiles !== timeline_scale_segments) {
        radial_axis_quantiles = timeline_scale_segments;
      }
      radial_axis.final_quantile(timeline_scale_segments[timeline_scale_segments.length - 1]);

      if (tl_scale === "Chronological") {
        radial_axis.radial_axis_units("Chronological");
        if (globals.segment_granularity === "epochs") {
          radial_axis.track_bounds(1);
        } else {
          radial_axis.track_bounds(globals.max_num_tracks + 1);
        }
      } else if (tl_scale === "Sequential") {
        radial_axis.radial_axis_units("Sequential");
        radial_axis.track_bounds(1);
      }
    }

    // update the radial axis for faceted radial timelines
    var faceted_radial_axis = timeline_facet.selectAll(".faceted_radial_axis")
      .data([radial_axis_quantiles]);

    faceted_radial_axis.enter()
      .append("g")
      .attr("class", "faceted_radial_axis")
      .style("opacity", 0);

    let facet_number = 0;

    timeline_facet.selectAll(".faceted_radial_axis")
      .transition("faceted_radial_axis_update")
      .duration(duration)
      .style("opacity", 1)
      .attr("transform", function () {
        var offset_x,
          offset_y;

        if (tl_layout !== "Faceted") {
          offset_x = width / 2;
          offset_y = height / 2;
        } else if (tl_representation === "Linear") {
          offset_x = width / 2;
          offset_y = facet_number * (height / globals.num_facets);
          facet_number++;
        } else if (tl_representation === "Radial" || (tl_representation === "Spiral" && tl_scale === "Sequential")) {
          var facet_dim_x = width / globals.num_facet_cols;
          var facet_dim_y = height / globals.num_facet_rows;

          offset_x = facet_number % globals.num_facet_cols * facet_dim_x;
          offset_y = Math.floor(facet_number / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + globals.buffer;

          facet_number++;
        } else {
          offset_x = width / 2;
          offset_y = height / 2;
        }
        return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
      })
      .call(radial_axis.radial_axis_scale(timeline_scale).x_pos(width / globals.num_facet_cols / 2).y_pos(height / globals.num_facet_rows / 2));

    logEvent("Faceted Radial axis updated", "axis_update");
  } else if (prev_tl_representation === "Radial" && prev_tl_layout === "Faceted" && (tl_representation !== "Radial" || tl_layout !== "Faceted")) {
    hideAxis(timeline_container, duration, "faceted_radial_axis");
  }
  return { radial_axis_quantiles };
}

function configureRadialAxes(tl_representation, tl_layout, tl_scale, timeline_container, timeline_scale, prev_tl_layout, prev_tl_representation, width, height, radial_axis_quantiles, timeline_scale_segments, radial_axis, duration, timeline_facet, timeline_segment, prev_tl_scale) {
  /**
  ---------------------------------------------------------------------------------------
  AXES
  Radial Axes
  ---------------------------------------------------------------------------------------
  Unified Radial Axis
  ---------------------------------------------------------------------------------------
  **/
  radial_axis_quantiles = configureUnifiedRadialAxis(tl_representation, tl_layout, tl_scale, timeline_container, timeline_scale, prev_tl_layout, prev_tl_representation, width, height, radial_axis_quantiles, timeline_scale_segments, radial_axis, duration).radial_axis_quantiles;

  /**
  ---------------------------------------------------------------------------------------
  Faceted Radial Axes
  ---------------------------------------------------------------------------------------
  **/
  radial_axis_quantiles = configureFacetedRadialAxes(tl_layout, tl_representation, tl_scale, radial_axis, radial_axis_quantiles, duration, timeline_scale_segments, timeline_facet, width, height, timeline_scale, prev_tl_scale, prev_tl_layout, prev_tl_representation, timeline_container).radial_axis_quantiles;

  /**
  ---------------------------------------------------------------------------------------
  Segmented Radial Axis
  ---------------------------------------------------------------------------------------
  **/
  return configureSegmentedRadialAxis(tl_representation, tl_layout, tl_scale, duration, radial_axis_quantiles, timeline_scale_segments, radial_axis, timeline_segment, width, height, timeline_scale, timeline_container, prev_tl_representation, prev_tl_layout).radial_axis_quantiles;
}

function configureUnifiedRadialAxis(tl_representation, tl_layout, tl_scale, timeline_container, timeline_scale, prev_tl_layout, prev_tl_representation, width, height, radial_axis_quantiles, timeline_scale_segments, radial_axis, duration) {
  if (tl_representation === "Radial" && tl_layout === "Unified") {
    if (radial_axis_quantiles !== timeline_scale_segments) {
      radial_axis_quantiles = timeline_scale_segments;
    }

    radial_axis.duration(duration);

    radial_axis.final_quantile(timeline_scale_segments[timeline_scale_segments.length - 1]);

    if (tl_scale === "Chronological") {
      radial_axis.radial_axis_units("Chronological");
      if (globals.segment_granularity === "epochs") {
        radial_axis.track_bounds(1);
      } else {
        radial_axis.track_bounds(globals.num_tracks + 1);
      }
    } else if (tl_scale === "Sequential") {
      radial_axis.radial_axis_units("Sequential");
      radial_axis.track_bounds(1);
    }

    // update the radial axis for radial timelines
    var radial_axis_container = timeline_container.selectAll(".radial_axis_container")
      .data([radial_axis_quantiles]);

    radial_axis_container.enter()
      .append("g")
      .attr("class", "radial_axis_container")
      .each(insertFacetAtAxis)
      .style("opacity", 0);

    timeline_container.selectAll(".radial_axis_container")
      .transition("radial_axis_container_enter")
      .duration(duration)
      .style("opacity", 1)
      .call(radial_axis.radial_axis_scale(timeline_scale).x_pos(width / 2).y_pos(height / 2));

    logEvent("Unified Radial axis updated", "axis_update");
  } else if (prev_tl_representation === "Radial" && prev_tl_layout === "Unified" && (tl_representation !== "Radial" || tl_layout !== "Unified")) {
    hideAxis(timeline_container, duration, "radial_axis_container");
  }

  return { radial_axis_quantiles };
}

function configureCollapsedAxis(tl_representation, prev_tl_scale, tl_scale, tl_layout, interim_duration_axis, interim_duration_scale, duration, data, timeline_container, width, height, unit_width) {
  let format = function (d) {
    return globals.formatAbbreviation(d);
  };

  if (tl_representation === "Linear" && tl_scale === "Collapsed" && tl_layout === "Unified") {
    interim_duration_axis.ticks(2);
    interim_duration_axis.scale(interim_duration_scale);

    interim_duration_axis.tickFormat(function (d) {
      var converted_tick = d;
      if (globals.date_granularity === "epochs") {
        return format(d.valueOf());
      } else if (time.year.count(data.min_start_date, data.max_end_date) > 5) {
        converted_tick = Math.round(d / 31536000730) + " years";
      } else if (time.day.count(data.min_start_date, data.max_end_date) > 31) {
        converted_tick = Math.round(d / 2628000000) + " months";
      } else {
        converted_tick = Math.round(d / 86400000) + " days";
      }
      return converted_tick;
    });

    // update the Collapsed axis for linear-interim_duration timeline
    var interim_duration_axis_container = timeline_container.selectAll(".interim_duration_axis")
      .data([null]);

    interim_duration_axis_container.enter()
      .append("g")
      .attr("class", "interim_duration_axis")
      .attr("transform", "translate(" + globals.max_seq_index * 1.5 * unit_width + "," + (height - unit_width * 4) + ")")
      .style("opacity", 0);

    timeline_container.selectAll(".interim_duration_axis")
      .transition("interim_duration_axis_linear_unified")
      .delay(0)
      .duration(duration)
      .attr("transform", "translate(" + globals.max_seq_index * 1.5 * unit_width + "," + (height - unit_width * 4) + ")")
      .style("opacity", 1)
      .call(interim_duration_axis);

    logEvent("Collapsed axis updated", "axis_update");
  } else if (prev_tl_scale === "Collapsed" && tl_scale !== "Collapsed") { // remove Collapsed axis for non-interim_duration-scale timelines
    timeline_container.selectAll(".interim_duration_axis")
      .transition("interim_duration_axis_collapsed")
      .duration(duration)
      .style("opacity", 0);
  }
}

function configureLinearAxis(timeline_scale, tl_layout, tl_representation, prev_tl_representation, tl_scale, data, tick_format, unit_width, timeline_container, duration, width, height) {
  const timeline_axis = d3.svg.axis().orient("top");
  if (tl_representation === "Linear") {
    timeline_axis.scale(timeline_scale);
    timeline_axis.ticks(10);
    timeline_axis.tickSize(6, 0);
    timeline_axis.tickFormat(undefined);
    timeline_axis.tickValues(undefined);

    if (tl_layout !== "Segmented" && tl_scale === "Chronological" && globals.date_granularity === "years" && data.min_start_date.getUTCFullYear() < 0) {
      timeline_axis.tickFormat(tick_format);
      timeline_axis.tickValues(undefined);
    } else if (tl_scale === "Sequential" || tl_scale === "Collapsed") {
      timeline_axis.ticks(10);
      timeline_axis.tickSize(6, 0);
      timeline_axis.tickValues(d3.range(0, globals.max_seq_index * 1.5 * unit_width - unit_width, unit_width * 10));
      timeline_axis.tickFormat(function (d) {
        return d / unit_width;
      });
    } else if (tl_scale === "Log") {
      timeline_axis.ticks(10, tick_format);
      timeline_axis.tickSize(6, 0);
      timeline_axis.tickValues(undefined);
    } else if (tl_scale === "Relative" || globals.date_granularity === "epochs") {
      timeline_axis.tickFormat(tick_format);
      timeline_axis.tickValues(undefined);
    } else if (tl_layout === "Segmented") {
      if (globals.segment_granularity === "decades") {
        timeline_axis.tickValues(d3.range(0, 120, 12));
      } else {
        timeline_axis.tickValues(undefined);
      }
      timeline_axis.tickFormat(function (d) {
        var converted_tick = d;
        switch (globals.segment_granularity) {
        case "days":
          converted_tick = moment().hour(d).format("hA");
          break;
        case "weeks":
          converted_tick = moment().weekday(d).format("ddd");
          break;
        case "months":
          converted_tick = moment().date(d).format("Do");
          break;
        case "years":
          converted_tick = moment().week(d + 1).format("MMM");
          break;
        case "decades":
          converted_tick = (d / 12) + " years";
          break;
        case "centuries":
        case "millenia":
          converted_tick = d + " years";
          break;
        case "epochs":
          converted_tick = globals.formatAbbreviation(d) + " years";
          break;
        default:
          break;
        }
        return converted_tick;
      });
    } else {
      timeline_axis.tickValues(undefined);
      timeline_axis.tickFormat(function (d) {
        var converted_tick = d;
        switch (globals.segment_granularity) {
        case "days":
          converted_tick = moment(d).format("hA");
          break;
        case "weeks":
          converted_tick = moment(d).format("MMM D");
          break;
        case "months":
          converted_tick = moment(d).format("MMM D");
          break;
        case "years":
        case "decades":
        case "centuries":
        case "millenia":
          converted_tick = moment(d).format("YYYY");
          break;
        case "epochs":
          converted_tick = globals.formatAbbreviation(d);
          break;
        default:
          break;
        }
        return converted_tick;
      });
    }

    // update the timeline axis for linear timelines
    var timeline_axis_container = timeline_container.selectAll(".timeline_axis")
      .data([null]);

    timeline_axis_container.enter()
      .append("g")
      .attr("class", "timeline_axis")
      .style("opacity", 0);

    timeline_axis_container.enter()
      .append("g")
      .attr("class", "timeline_axis")
      .attr("id", "bottom_timeline_axis")
      .style("opacity", 0);

    var timeline_axis_update = timeline_container.select(".timeline_axis")
      .transition("timeline_axis_update")
      .delay(0)
      .duration(duration)
      .style("opacity", 1)
      .call(timeline_axis);

    timeline_axis_update.selectAll("text")
      .attr("y", -12)
      .style("fill", "#666")
      .style("font-weight", "normal");

    timeline_axis_update.selectAll(".tick line")
      .delay(function (d, i) { // eslint-disable-line no-shadow
        return i * duration / timeline_axis_update.selectAll(".tick line")[0].length;
      })
      .attr("y1", -6)
      .attr("y2", 0);

    var bottom_timeline_axis_update = timeline_container.select("#bottom_timeline_axis")
      .transition("bottom_timeline_axis_update")
      .delay(0)
      .duration(duration)
      .style("opacity", 1)
      .call(timeline_axis);

    bottom_timeline_axis_update.selectAll("text")
      .delay(function (d, i) { // eslint-disable-line no-shadow
        return i * duration / bottom_timeline_axis_update.selectAll(".tick line")[0].length;
      })
      .attr("y", height + 18);

    bottom_timeline_axis_update.select(".domain")
      .attr("transform", function () {
        return "translate(0," + height + ")";
      });

    bottom_timeline_axis_update.selectAll(".tick line")
      .delay(function (d, i) { // eslint-disable-line no-shadow
        return i * duration / bottom_timeline_axis_update.selectAll(".tick line")[0].length;
      })
      .attr("y1", 0)
      .attr("y2", height + 6);

    logEvent("Linear axis updated", "axis_update");
  } else if (prev_tl_representation === "Linear" && tl_representation !== "Linear") { // remove axes for non-linear timelines
    var timeline_axis_hide = timeline_container.select(".timeline_axis")
      .transition("timeline_axis_hide")
      .duration(duration);

    var bottom_timeline_axis_hide = timeline_container.select("#bottom_timeline_axis")
      .transition("bottom_timeline_axis_hide")
      .duration(duration);

    timeline_axis_hide.selectAll(".tick line")
      .attr("y1", -6)
      .attr("y2", -6);

    bottom_timeline_axis_hide.select(".domain")
      .attr("transform", function () {
        return "translate(0,0)";
      });

    bottom_timeline_axis_hide.selectAll("text")
      .attr("y", -12);

    bottom_timeline_axis_hide.selectAll(".tick line")
      .attr("y1", -6)
      .attr("y2", -6);

    timeline_container.selectAll(".timeline_axis")
      .transition("timeline_container_axis")
      .duration(duration)
      .style("opacity", 0);
  }
}


function insertFacetAtAxis() {
  var firstChild = selectWithParent(".timeline_axis").node();
  if (firstChild) {
    this.parentNode.insertBefore(this, firstChild);
  }
}

function getFacetTitleText(tl_layout, tl_representation, height, d) {
  if (d === undefined || tl_layout !== "Faceted") {
    return "";
  }

  if (tl_representation === "Linear") {
    return d.substring(0, Math.floor(height / globals.num_facets / 10));
  }

  return d;
}


function earlyUpdate(transition, tl_layout, prev_tl_layout, tl_representation, prev_tl_representation, tl_scale, prev_tl_scale) {
  /**
  ---------------------------------------------------------------------------------------
  update rect elements for non-radial representations
  ---------------------------------------------------------------------------------------
  **/

  transition.select("rect.event_span")
    .style("opacity", function (d) {
      return initialOpacity(d, tl_layout, prev_tl_layout, tl_representation, prev_tl_representation, tl_scale, prev_tl_scale, true);
    })
    .style("pointer-events", function () {
      return "none";
    })
    .style("fill", eventColorMapping);

  /**
  ---------------------------------------------------------------------------------------
  update bar (rect) elements for interim_duration scale
  ---------------------------------------------------------------------------------------
  **/

  // draw elapsed time as bar below the sequence, offset between events
  transition.select(".time_elapsed")
    .attr("height", 0)
    .style("opacity", 0);

  /**
  ---------------------------------------------------------------------------------------
  update path elements for radial representations
  ---------------------------------------------------------------------------------------
  **/

  transition.select("path.event_span")
    .style("opacity", function (d) {
      return initialOpacity(d, tl_layout, prev_tl_layout, tl_representation, prev_tl_representation, tl_scale, prev_tl_scale, false);
    })
    .style("pointer-events", function () {
      return "none";
    })
    .style("fill", eventColorMapping);

  /**
  ---------------------------------------------------------------------------------------
  span updates: rect elements for non-radial timelines
  ---------------------------------------------------------------------------------------
  **/

  transition.selectAll("rect.event_span_component")
    .style("opacity", function () {
      if (tl_layout !== "Segmented" || prev_tl_layout !== "Segmented" || (tl_representation === "Radial" && prev_tl_representation === "Radial")) {
        return 0;
      } else if (globals.prev_active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) === -1 || globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) === -1) {
        if (globals.filter_type === "Hide") {
          return 0;
        } else if (globals.filter_type === "Emphasize") {
          if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) === -1) {
            return 0.1;
          }

          return 1;
        }
      } else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1 && d3.select(this.parentNode).datum().selected) {
        return 1;
      } else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        if (tl_scale !== prev_tl_scale || tl_layout !== prev_tl_layout || tl_representation !== prev_tl_representation) {
          return 0.5;
        }

        return 1;
      } else {
        return 0.1;
      }
    })
    .style("pointer-events", function () {
      return "none";
    })
    .style("fill", eventSpanColorMapping);

  /**
  ---------------------------------------------------------------------------------------
  span updates: path/arc elements for non-radial timelines
  ---------------------------------------------------------------------------------------
  **/

  transition.selectAll("path.event_span_component")
    .style("opacity", function () {
      if ((tl_layout !== "Segmented" || prev_tl_layout !== "Segmented") || (tl_representation !== "Radial" && prev_tl_representation !== "Radial")) {
        return 0;
      } else if (globals.prev_active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) === -1 || globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) === -1) {
        if (globals.filter_type === "Hide") {
          return 0;
        } else if (globals.filter_type === "Emphasize") {
          if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) === -1) {
            return 0.1;
          }

          return 1;
        }
      } else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1 && d3.select(this.parentNode).datum().selected) {
        return 1;
      } else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        if (tl_scale !== prev_tl_scale || tl_layout !== prev_tl_layout || tl_representation !== prev_tl_representation) {
          return 0.5;
        }

        return 1;
      } else {
        return 0.1;
      }
    })
    .style("pointer-events", function () {
      if (prev_tl_layout !== "Segmented" || (tl_representation !== "Radial" && prev_tl_representation !== "Radial")) {
        return "none";
      } else if (globals.prev_active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1 && globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        return "inherit";
      }

      return "none";
    })
    .style("fill", eventSpanColorMapping);

  transition.select(".path_end_indicator")
    .style("opacity", 0)
    .style("pointer-events", "none");
}

/* eslint-disable */
/**
 * Positions all the elements
 */
/* eslint-enable */
function update(tl_layout, tl_scale, tl_representation, width, height, data, unit_width, prev_tl_layout, prev_tl_representation, prev_tl_scale, timeline_scale, selection) {
  selection.attr("id", d => `event_g${d.event_id}`);

  selection.select("rect.event_span")
    .attr("transform", function (d) {
      var offset_y = 0,
        offset_x = 0;
      if (tl_representation === "Linear") {
        switch (tl_layout) {

        case "Unified":
          offset_y = 0;
          break;

        case "Faceted":
          offset_y = (height / globals.num_facets) * globals.facets.domain().indexOf(d.facet);
          break;

        case "Segmented":
          var span_segment = calculateSpanSegment(data.min_start_date, d.start_date);
          offset_y = (height / globals.num_segments) * span_segment;
          break;

        default:
          offset_y = 0;
          break;
        }
      } else if (tl_representation === "Spiral" || tl_representation === "Radial") {
        var facet_dim_x = width / globals.num_facet_cols;
        var facet_dim_y = height / globals.num_facet_rows;
        if (tl_layout === "Unified") {
          offset_x = width / 2;
          offset_y = height / 2;
        } else if (tl_layout === "Faceted") {
          offset_x = globals.facets.domain().indexOf(d.facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
          if (tl_representation === "Radial") { offset_y = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2 + globals.buffer; } else if (tl_representation === "Spiral") { offset_y = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols) * globals.spiral_dim + (globals.spiral_dim / 2); }
        }
      } else if (tl_representation === "Curve") {
        offset_x = d.curve_x;
        offset_y = d.curve_y;
      } else {
        offset_x = 0;
        offset_y = 0;
      }
      d.rect_offset_x = offset_x;
      d.rect_offset_y = offset_y;
      return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
    });

  // update rects for linear timelines
  selection.select("rect.event_span")
    .attr("height", () => unit_width)
    .attr("width", function (d) {
      if (tl_layout !== "Segmented" && tl_representation === "Linear") {
        if (tl_scale === "Chronological" && d.start_date !== d.end_date) {
          return d3.max([timeline_scale(d.end_date) - timeline_scale(d.start_date), unit_width]);
        } else if (tl_scale === "Relative" && d.start_age !== d.end_age) {
          return d3.max([timeline_scale(d.end_age) - timeline_scale(d.start_age), unit_width]);
        }
      }
      return unit_width;
    })
    .attr("x", function (d) {
      var rect_x = 0;
      if (tl_representation === "Linear") {
        if (tl_layout === "Segmented") {
          switch (globals.segment_granularity) {
          case "days":
            rect_x = timeline_scale(moment(time.utcHour.floor(d.start_date)).hour());
            break;
          case "weeks":
            rect_x = timeline_scale(moment(time.day.floor(d.start_date)).day());
            break;
          case "months":
            rect_x = timeline_scale(moment(time.day.floor(d.start_date)).date());
            break;
          case "years":
            if (moment(time.utcWeek.floor(d.start_date)).week() === 53) {
              rect_x = timeline_scale(1);
            } else {
              rect_x = timeline_scale(moment(time.utcWeek.floor(d.start_date)).week());
            }
            break;
          case "decades":
            rect_x = timeline_scale(moment(time.month.floor(d.start_date)).month() + (time.month.floor(d.start_date).getUTCFullYear() - Math.floor(time.month.floor(d.start_date).getUTCFullYear() / 10) * 10) * 12);
            break;
          case "centuries":
            if (d.start_date.getUTCFullYear() < 0) {
              rect_x = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100);
            } else {
              rect_x = timeline_scale(d.start_date.getUTCFullYear() % 100);
            }
            break;
          case "millenia":
            if (d.start_date.getUTCFullYear() < 0) {
              rect_x = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000);
            } else {
              rect_x = timeline_scale(d.start_date.getUTCFullYear() % 1000);
            }
            break;
          case "epochs":
            rect_x = timeline_scale(d.start_date);
            break;
          default:
            break;
          }
        } else {
          switch (tl_scale) {

          case "Chronological":
            rect_x = timeline_scale(d.start_date);
            break;

          case "Relative":
            rect_x = d3.max([0, timeline_scale(d.start_age)]);
            break;

          case "Log":
            switch (globals.segment_granularity) {
            case "days":
              rect_x = timeline_scale(time.hour.count(d.start_date, data.max_end_date) * -1 - 1);
              break;
            case "weeks":
              rect_x = timeline_scale(time.day.count(d.start_date, data.max_end_date) * -1 - 1);
              break;
            case "months":
              rect_x = timeline_scale(time.week.count(d.start_date, data.max_end_date) * -1 - 1);
              break;
            case "years":
              rect_x = timeline_scale(time.month.count(d.start_date, data.max_end_date) * -1 - 1);
              break;
            case "decades":
              rect_x = timeline_scale(Math.abs(data.max_end_date.getUTCFullYear() - d.start_date.getUTCFullYear()) * -1 - 1);
              break;
            case "centuries":
              rect_x = timeline_scale(Math.abs(data.max_end_date.getUTCFullYear() - d.start_date.getUTCFullYear()) * -1 - 1);
              break;
            case "millenia":
              rect_x = timeline_scale(Math.abs(data.max_end_date.getUTCFullYear() - d.start_date.getUTCFullYear()) * -1 - 1);
              break;
            default:
              rect_x = timeline_scale(Math.abs(data.max_end_date.valueOf() - d.start_date.valueOf()) * -1 - 1);
              break;
            }
            break;

          case "Collapsed":
            rect_x = timeline_scale(d.seq_index) * unit_width + 0.5 * unit_width;
            break;

          case "Sequential":
            rect_x = timeline_scale(d.seq_index) * unit_width + 0.5 * unit_width;
            break;
          default:
            break;
          }
        }
      } else if (tl_representation === "Radial") {
        switch (tl_scale) {

        case "Chronological":
          rect_x = (globals.centre_radius + d.track * globals.track_height + 0.5 * unit_width) * Math.sin(timeline_scale(d.start_date));
          break;

        case "Relative":
          rect_x = (globals.centre_radius + d.track * globals.track_height + 0.5 * unit_width) * Math.sin(timeline_scale(d.start_age));
          break;

        case "Sequential":
          rect_x = (globals.centre_radius + d.seq_track * globals.track_height + 0.5 * unit_width) * Math.sin(timeline_scale(d.seq_index));
          break;

        default:
          rect_x = 0;
          break;
        }
      } else if (tl_representation === "Spiral" && tl_scale === "Sequential") {
        rect_x = d.spiral_x;
      } else {
        rect_x = 0;
      }
      d.rect_x_pos = rect_x;
      return rect_x;
    })
    .attr("y", function (d) {
      var rect_y = 0;
      if (tl_representation === "Linear") {
        switch (tl_layout) {

        case "Unified":
          switch (tl_scale) {

          case "Chronological":
            rect_y = height - (globals.track_height * d.track + globals.track_height);
            break;

          case "Log":
            rect_y = height - (globals.track_height * d.track + globals.track_height);
            break;

          case "Collapsed":
            rect_y = height - (d.seq_track * globals.track_height + globals.track_height + (4 * unit_width));
            break;

          case "Sequential":
            rect_y = height - (d.seq_track * globals.track_height + globals.track_height);
            break;

          default:
            rect_y = 0;
            break;
          }
          break;

        case "Faceted":
          switch (tl_scale) {

          case "Chronological":
            rect_y = (height / globals.num_facets) - (globals.track_height * d.track + globals.track_height);
            break;

          case "Relative":
            rect_y = (height / globals.num_facets) - (globals.track_height * d.track + globals.track_height);
            break;

          case "Log":
            rect_y = (height / globals.num_facets) - (globals.track_height * d.track + globals.track_height);
            break;

          case "Sequential":
            rect_y = (height / globals.num_facets) - (globals.track_height * d.seq_track + globals.track_height);
            break;

          default:
            rect_y = 0;
            break;
          }
          break;

        case "Segmented":
          rect_y = (height / globals.num_segments) - (globals.track_height * d.track + globals.track_height);
          break;
        default:
          break;
        }
      } else if (tl_representation === "Radial") {
        switch (tl_scale) {

        case "Chronological":
          rect_y = -1 * (globals.centre_radius + d.track * globals.track_height + 0.5 * unit_width) * Math.cos(timeline_scale(d.start_date));
          break;

        case "Relative":
          rect_y = -1 * (globals.centre_radius + d.track * globals.track_height + 0.5 * unit_width) * Math.cos(timeline_scale(d.start_age));
          break;

        case "Sequential":
          rect_y = -1 * (globals.centre_radius + d.seq_track * globals.track_height + 0.5 * unit_width) * Math.cos(timeline_scale(d.seq_index));
          break;

        default:
          rect_y = 0;
          break;
        }
      } else if (tl_representation === "Spiral" && tl_scale === "Sequential") {
        rect_y = d.spiral_y + globals.buffer;
      } else {
        rect_y = 0;
      }
      d.rect_y_pos = rect_y;
      return rect_y;
    });

  selection.select(".time_elapsed")
    .attr("x", function (d) {
      if (tl_scale === "Chronological") {
        return d3.max([0, timeline_scale(d.start_date) * unit_width - unit_width]);
      }
      if (tl_scale === "Log") {
        return 0;
      } else if (tl_scale === "Relative") {
        return 0;
      }

      return timeline_scale(d.seq_index) * unit_width - 0.5 * unit_width;
    })
    .attr("y", function (d) {
      if (globals.date_granularity === "epochs" && d.time_elapsed === 0) {
        return height;
      }

      return height - (unit_width * 4);
    })
    .text(function (d) {
      return d.time_elapsed_label;
    });
  selection.select("path.event_span")
    .attr("transform", function (d) {
      var offset_y = 0;
      var offset_x = 0;
      switch (tl_layout) {

      case "Unified":
        offset_x = width / 2;
        offset_y = height / 2;
        break;

      case "Faceted":
        var facet_dim_x = width / globals.num_facet_cols;
        var facet_dim_y = height / globals.num_facet_rows;
        offset_x = globals.facets.domain().indexOf(d.facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
        offset_y = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2 + globals.buffer;
        break;

      case "Segmented":
        const span_segment = calculateSpanSegment(data.min_start_date, d.start_date);
        var segment_dim_x = width / globals.num_segment_cols;
        var segment_dim_y = height / globals.num_segment_rows;
        offset_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
        offset_y = Math.floor(span_segment / globals.num_segment_cols) * segment_dim_y + segment_dim_y / 2 + globals.buffer;
        break;
      default:
        break;
      }
      d.path_offset_x = offset_x;
      d.path_offset_y = offset_y;

      if (tl_representation === "Radial") {
        switch (tl_scale) {

        case "Chronological":
          d.path_x_pos = (globals.centre_radius + d.track * globals.track_height + 0.25 * globals.track_height) * Math.sin(timeline_scale(d.start_date));
          d.path_y_pos = -1 * (globals.centre_radius + d.track * globals.track_height + 0.25 * globals.track_height) * Math.cos(timeline_scale(d.start_date));
          break;

        case "Relative":
          d.path_x_pos = (globals.centre_radius + d.track * globals.track_height + 0.25 * globals.track_height) * Math.sin(timeline_scale(d.start_age));
          d.path_y_pos = -1 * (globals.centre_radius + d.track * globals.track_height + 0.25 * globals.track_height) * Math.cos(timeline_scale(d.start_age));
          break;

        case "Sequential":
          d.path_x_pos = (globals.centre_radius + d.seq_track * globals.track_height + 0.25 * globals.track_height) * Math.sin(timeline_scale(d.seq_index));
          d.path_y_pos = -1 * (globals.centre_radius + d.seq_track * globals.track_height + 0.25 * globals.track_height) * Math.cos(timeline_scale(d.seq_index));
          break;
        default:
          break;
        }
      }

      return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
    });

  if (tl_representation !== "Radial") {
    selection.selectAll("path.event_span")
      .style("display", "none");
  }

  selection.selectAll("rect.event_span_component")
    .attr("transform", function (dataItem) {
      const dateTime = dataItem.dateTime;
      var offset_y = 0,
        offset_x = 0;

      if (tl_layout === "Faceted") {
        offset_y = (height / globals.num_facets) * globals.facets.domain().indexOf(d3.select(this.parentNode).datum().facet);
      } else if (tl_layout === "Segmented") {
        if (tl_representation === "Linear" && tl_scale === "Chronological") {
          switch (globals.segment_granularity) {
          case "days":
            offset_y = d3.max([0, (time.day.count(time.utcDay.floor(data.min_start_date), dateTime) - 1) * (height / globals.num_segments)]);
            break;
          case "weeks":
            offset_y = d3.max([0, (time.week.count(time.utcWeek.floor(data.min_start_date), dateTime) - 1) * (height / globals.num_segments)]);
            break;
          case "months":
            offset_y = d3.max([0, (time.month.count(time.utcMonth.floor(data.min_start_date), dateTime) - 1) * (height / globals.num_segments)]);
            break;
          case "years":
            offset_y = d3.max([0, (dateTime.getUTCFullYear() - data.min_start_date.getUTCFullYear()) * (height / globals.num_segments)]);
            break;
          case "decades":
            offset_y = d3.max([0, (Math.floor(dateTime.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)) * (height / globals.num_segments)]);
            break;
          case "centuries":
            offset_y = d3.max([0, (Math.floor(dateTime / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)) * (height / globals.num_segments)]);
            break;
          case "millenia":
            offset_y = d3.max([0, (Math.floor(dateTime / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)) * (height / globals.num_segments)]);
            break;
          case "epochs":
            offset_y = 0;
            break;
          default:
            break;
          }
        } else if (tl_representation === "Radial" && tl_scale === "Chronological") {
          var span_segment = calculateSpanSegment(data.min_start_date, dateTime);
          var segment_dim_x = width / globals.num_segment_cols;
          var segment_dim_y = height / globals.num_segment_rows;
          offset_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
          offset_y = Math.floor(span_segment / globals.num_segment_cols) * segment_dim_y + segment_dim_y / 2 + globals.track_height;
        }
      }
      return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
    });

  function getTimelineScaleValue(dateTime, checkNegative) {
    let value = 0;
    switch (globals.segment_granularity) {
    case "days":
      value = d3.max([0, timeline_scale(moment(dateTime).hour())]);
      break;
    case "weeks":
      value = d3.max([0, timeline_scale(moment(dateTime).day())]);
      break;
    case "months":
      value = d3.max([0, timeline_scale(moment(dateTime).date())]);
      break;
    case "years":
      if (moment(dateTime).week() === 53) {
        value = d3.max([0, timeline_scale(1)]);
      } else {
        value = d3.max([0, timeline_scale(moment(dateTime).week())]);
      }
      break;
    case "decades":
      value = d3.max([0, timeline_scale(moment(dateTime).month() + (dateTime.getUTCFullYear() - Math.floor(dateTime.getUTCFullYear() / 10) * 10) * 12)]);
      break;
    case "centuries":
      if (checkNegative && dateTime < 0) {
        value = d3.max([0, timeline_scale(dateTime % 100 + 100)]);
      } else {
        value = d3.max([0, timeline_scale(dateTime % 100)]);
      }
      break;
    case "millenia":
      if (checkNegative && dateTime < 0) {
        value = d3.max([0, timeline_scale(dateTime % 1000 + 1000)]);
      } else {
        value = d3.max([0, timeline_scale(dateTime % 1000)]);
      }
      break;
    case "epochs":
      value = d3.max([0, timeline_scale(dateTime)]);
      break;
    default:
      break;
    }
    return value;
  }

  selection.selectAll("rect.event_span_component")
    .attr("height", function () {
      var span_height = unit_width;
      if (tl_layout === "Segmented" && tl_representation === "Calendar" && tl_scale === "Chronological") {
        span_height = 20;
      } else if (tl_layout === "Segmented" && tl_representation === "Grid" && tl_scale === "Chronological") {
        span_height = 37.5;
      }
      return span_height;
    })
    .attr("width", function () {
      var span_width = unit_width;
      if (tl_layout === "Segmented" && tl_representation === "Linear" && tl_scale === "Chronological") {
        span_width = globals.segment_granularity !== "epochs" ?
          d3.max([0, width / getNumberOfSegmentsForGranularity(globals.segment_granularity)]) :
          d3.max([0, unit_width]);
      } else if (tl_layout === "Segmented" && tl_representation === "Radial" && tl_scale === "Chronological" && prev_tl_representation !== "Radial") {
        span_width = unit_width;
      } else if (tl_layout === "Segmented" && tl_representation === "Grid" && tl_scale === "Chronological") {
        span_width = 50;
      } else if (tl_layout === "Segmented" && tl_representation === "Calendar" && tl_scale === "Chronological") {
        span_width = 10;
      }
      return span_width;
    })
    .attr("y", function (dataItem) {
      const dateTime = dataItem.dateTime;
      var y_pos = 0;
      if (tl_layout === "Unified") {
        if (tl_representation === "Linear" && tl_scale === "Chronological") {
          y_pos = d3.max([0, height - (globals.track_height * d3.select(this.parentNode).datum().track + globals.track_height)]);
        }
      } else if (tl_layout === "Faceted") {
        if (tl_representation === "Linear" && tl_scale === "Chronological") {
          y_pos = d3.max([0, (height / globals.num_facets) - (globals.track_height * d3.select(this.parentNode).datum().track + globals.track_height)]);
        }
      } else if (tl_layout === "Segmented") {
        if (tl_representation === "Linear" && tl_scale === "Chronological") {
          y_pos = d3.max([0, (height / globals.num_segments) - (globals.track_height * d3.select(this.parentNode).datum().track + globals.track_height)]);
        } else if (tl_representation === "Radial" && tl_scale === "Chronological") {
          var y_cos = getTimelineScaleValue(dateTime, false);
          y_pos = -1 * (globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height + globals.track_height) * Math.cos(y_cos);
        } else if (tl_layout === "Segmented" && tl_representation === "Grid" && tl_scale === "Chronological") {
          if (["decades", "centuries", "millenia"].indexOf(globals.segment_granularity) !== -1) {
            var grid_year;

            if (globals.isNumber(dateTime)) {
              grid_year = dateTime;
            } else {
              grid_year = dateTime.getUTCFullYear();
            }

            y_pos = getYGridPosition(grid_year, Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100, unit_width);
          } else if (globals.segment_granularity === "epochs") {
            y_pos = 0;
          } else {
            y_pos = 0;
          }
        } else if (tl_layout === "Segmented" && tl_representation === "Calendar" && tl_scale === "Chronological") {
          var cell_size = 20,
            year_height = cell_size * 8;
          let range_floor = data.min_start_date.getUTCFullYear();
          if (globals.segment_granularity === "centuries" || globals.segment_granularity === "millenia" || globals.segment_granularity === "epochs") {
            y_pos = 0;
          } else {
            const year_offset = year_height * (dateTime.getUTCFullYear() - range_floor);
            y_pos = d3.max([0, dateTime.getDay() * cell_size + year_offset]);
          }
        }
      }
      return y_pos;
    })
    .attr("x", function (dataItem) {
      const dateTime = dataItem.dateTime;
      var x_pos = 0;
      if (tl_layout === "Unified" || tl_layout === "Faceted") {
        if (tl_representation === "Linear" && tl_scale === "Chronological") {
          x_pos = d3.max([0, timeline_scale(d3.select(this.parentNode).datum().start_date)]);
        }
      } else if (tl_layout === "Segmented") {
        if (tl_representation === "Linear" && tl_scale === "Chronological") {
          x_pos = getTimelineScaleValue(dateTime, true);
        } else if (tl_representation === "Radial" && tl_scale === "Chronological") {
          var x_sin = getTimelineScaleValue(dateTime, false);
          x_pos = (globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height + globals.track_height) * Math.sin(x_sin);
        } else if (tl_layout === "Segmented" && tl_representation === "Grid" && tl_scale === "Chronological") {
          var grid_year;

          if (globals.isNumber(dateTime)) {
            grid_year = dateTime;
          } else {
            grid_year = dateTime.getUTCFullYear();
          }

          if (["decades", "centuries", "millenia"].indexOf(globals.segment_granularity) !== -1) {
            x_pos = d3.max([0, getXGridPosition(grid_year)]);
          } else if (globals.segment_granularity === "epochs") {
            x_pos = 0;
          } else {
            x_pos = d3.max([0, getXGridPosition(grid_year)]);
          }
        } else if (tl_layout === "Segmented" && tl_representation === "Calendar" && tl_scale === "Chronological") {
          if (globals.segment_granularity === "centuries" || globals.segment_granularity === "millenia" || globals.segment_granularity === "epochs") {
            x_pos = 0;
          } else {
            x_pos = d3.max([0, d3.time.weekOfYear(dateTime) * 20]);
          }
        }
      }
      return x_pos;
    });

  selection.selectAll("path.event_span_component")
    .attr("transform", function (dataItem) {
      const dateTime = dataItem.dateTime;
      var offset_x = 0,
        offset_y = 0,
        span_segment = 0;
      if (tl_layout === "Segmented" && tl_scale === "Chronological") {
        span_segment = calculateSpanSegment(data.min_start_date, dateTime);
        var segment_dim_x = width / globals.num_segment_cols;
        var segment_dim_y = height / globals.num_segment_rows;
        offset_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
        offset_y = Math.floor(span_segment / globals.num_segment_cols - 1) * segment_dim_y + segment_dim_y + segment_dim_y / 2 + globals.buffer;
      } else if (tl_layout === "Unified") {
        offset_x = width / 2;
        offset_y = height / 2;
      } else if (tl_layout === "Faceted") {
        var facet_dim_x = width / globals.num_facet_cols;
        var facet_dim_y = height / globals.num_facet_rows;
        offset_x = globals.facets.domain().indexOf(d3.select(this.parentNode).datum().facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
        offset_y = Math.floor(globals.facets.domain().indexOf(d3.select(this.parentNode).datum().facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2 + globals.buffer;
      }
      return "translate(" + unNaN(offset_x) + "," + unNaN(offset_y) + ")";
    });

  if (tl_representation !== "Radial") {
    selection.selectAll("path.event_span_component")
      .style("display", "none");
  }

  // update terminal span indicators
  selection.select(".path_end_indicator")
    .attr("transform", function (d) {
      var x_pos = 0,
        y_pos = 0,
        span_segment = 0,
        rotation = 0,
        rect_x = 0; // eslint-disable-line no-unused-vars

      if (tl_layout === "Segmented") {
        if (tl_representation === "Linear") {
          rotation = 90;
          switch (globals.segment_granularity) {
          case "days":
            x_pos = d3.max([0, timeline_scale(moment(d.start_date).hour())]);
            y_pos = d3.max([0, time.day.count(time.utcDay.floor(data.min_start_date), d.start_date) - 1]);
            break;
          case "weeks":
            x_pos = d3.max([0, timeline_scale(moment(d.start_date).day())]);
            y_pos = d3.max([0, time.week.count(time.utcWeek.floor(data.min_start_date), d.start_date) - 1]);
            break;
          case "months":
            x_pos = d3.max([0, timeline_scale(moment(d.start_date).date())]);
            y_pos = d3.max([0, time.month.count(time.utcMonth.floor(data.min_start_date), d.start_date) - 1]);
            break;
          case "years":
            if (moment(d.start_date).week() === 53) {
              x_pos = d3.max([0, timeline_scale(1)]);
            } else {
              d3.max([0, x_pos = timeline_scale(moment(d.start_date).week() - 1)]);
            }
            y_pos = d3.max([0, d.start_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()]);
            break;
          case "decades":
            if (moment(d.start_date).month() === 11 && moment(d.start_date).date() === 31) {
              x_pos = d3.max([0, timeline_scale(-1 + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12)]);
            } else {
              x_pos = d3.max([0, timeline_scale(moment(d.start_date).month() + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12)]);
            }
            y_pos = d3.max([0, Math.floor(d.start_date.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)]);
            break;
          case "centuries":
            if (d.start_date.getUTCFullYear() < 0) {
              x_pos = d3.max([0, timeline_scale(d.start_date.getUTCFullYear() % 100 + 100)]);
            } else {
              x_pos = d3.max([0, timeline_scale(d.start_date.getUTCFullYear() % 100)]);
            }
            y_pos = d3.max([0, Math.floor(d.start_date.getUTCFullYear() / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)]);
            break;
          case "millenia":
            if (d.start_date.getUTCFullYear() < 0) {
              x_pos = d3.max([0, timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000)]);
            } else {
              x_pos = d3.max([0, timeline_scale(d.start_date.getUTCFullYear() % 1000)]);
            }
            y_pos = d3.max([0, Math.floor(d.start_date.getUTCFullYear() / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)]);
            break;
          case "epochs":
            x_pos = d3.max([0, timeline_scale(d.start_date)]);
            y_pos = 0;
            break;
          default:
            break;
          }
          x_pos = x_pos + unit_width * 0.33;
          y_pos = (y_pos + 1) * (height / globals.num_segments) - (globals.track_height * d.track + globals.track_height) + unit_width * 0.5;
        } else if (tl_representation === "Radial") {
          var pos;
          span_segment = calculateSpanSegment(data.min_start_date, d.start_date);
          switch (globals.segment_granularity) {
          case "days":
            pos = timeline_scale(moment(d.start_date).hour() + 0.5);
            break;
          case "weeks":
            pos = timeline_scale(moment(d.start_date).day() + 0.5);
            break;
          case "months":
            pos = timeline_scale(moment(d.start_date).date() + 0.5);
            break;
          case "years":
            if (moment(d.start_date).isoWeek() === 53) {
              pos = timeline_scale(1);
            } else {
              pos = timeline_scale(moment(d.start_date).isoWeek() - 1);
            }
            break;
          case "decades":
            if (moment(d.start_date).month() === 11 && moment(d.start_date).date() === 31) {
              pos = timeline_scale(-1 + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12 + 0.5);
            } else {
              pos = timeline_scale(moment(d.start_date).month() + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12 + 0.5);
            }
            break;
          case "centuries":
            if (d.start_date.getUTCFullYear() < 0) {
              pos = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100 + 0.5);
            } else {
              pos = timeline_scale(d.start_date.getUTCFullYear() % 100 + 0.5);
            }
            break;
          case "millenia":
            if (d.start_date.getUTCFullYear() < 0) {
              pos = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000 + 0.5);
            } else {
              pos = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 0.5);
            }
            break;
          case "epochs":
            pos = timeline_scale(d.start_date.valueOf() + 0.5);
            break;
          default:
            break;
          }
          var segment_dim_x = width / globals.num_segment_cols;
          var segment_dim_y = height / globals.num_segment_rows;
          var segment_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
          var segment_y = Math.floor(span_segment / globals.num_segment_cols - 1) * segment_dim_y + segment_dim_y + segment_dim_y / 2 + globals.buffer;
          var x_offset = ((globals.centre_radius + d.track * globals.track_height + 0.25 * globals.track_height) * Math.sin(pos));
          var y_offset = -1 * ((globals.centre_radius + d.track * globals.track_height + 0.25 * globals.track_height) * Math.cos(pos));
          x_pos = segment_x + x_offset;
          y_pos = segment_y + y_offset;
          rotation = pos * 360 / (Math.PI * 2) + 90;
        } else if (tl_representation === "Grid" && tl_scale === "Chronological" && globals.date_granularity !== "epochs") {
          rotation = 90;
          x_pos = d3.max([0, getXGridPosition(d.start_date.getUTCFullYear()) + unit_width * 0.33]);
          y_pos = getYGridPosition(d.start_date.getUTCFullYear(), data.min_start_date.getUTCFullYear(), unit_width) + unit_width * 0.5;
        } else if (tl_representation === "Calendar" && tl_scale === "Chronological") {
          var cell_size = 20,
            year_height = cell_size * 8;
          const range_floor = data.min_start_date.getUTCFullYear();
          const year_offset = year_height * (d.start_date.getUTCFullYear() - range_floor);
          rotation = 180;
          x_pos = d3.max([0, d3.time.weekOfYear(d.start_date) * 20 + 0.33 * unit_width]);
          y_pos = d3.max([0, d.start_date.getDay() * cell_size + year_offset + unit_width * 0.33]);
        }
      } else if (tl_layout === "Unified" && tl_scale === "Chronological") {
        if (tl_representation === "Linear") {
          rotation = 90;
          x_pos = d3.max([0, rect_x = timeline_scale(d.start_date) + unit_width * 0.33]);
          y_pos = d3.max([0, height - (globals.track_height * d.track + unit_width)]);
        } else if (tl_representation === "Radial") {
          rotation = timeline_scale(d.start_date) * 360 / (Math.PI * 2) + 90;
          x_pos = (globals.centre_radius + d.track * globals.track_height) * Math.sin(timeline_scale(d.start_date));
          y_pos = -1 * (globals.centre_radius + d.track * globals.track_height) * Math.cos(timeline_scale(d.start_date));
        }
      } else if (tl_layout === "Faceted" && tl_scale === "Chronological") {
        if (tl_representation === "Linear") {
          var facet_offset = (height / globals.num_facets) * globals.facets.domain().indexOf(d.facet);
          rotation = 90;
          x_pos = d3.max([0, rect_x = timeline_scale(d.start_date) + unit_width * 0.33]);
          y_pos = d3.max([0, (height / globals.num_facets) - (globals.track_height * d.track + unit_width) + facet_offset]);
        } else if (tl_representation === "Radial") {
          var facet_dim_x = width / globals.num_facet_cols;
          var facet_dim_y = height / globals.num_facet_rows;
          var x_facet_offset = globals.facets.domain().indexOf(d.facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
          var y_facet_offset = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2;
          rotation = timeline_scale(d.start_date) * 360 / (Math.PI * 2) + 90;
          x_pos = (globals.centre_radius + d.track * globals.track_height) * Math.sin(timeline_scale(d.start_date)) + x_facet_offset;
          y_pos = -1 * (globals.centre_radius + d.track * globals.track_height) * Math.cos(timeline_scale(d.start_date)) + y_facet_offset;
        }
      }
      return "translate(" + unNaN(x_pos) + "," + unNaN(y_pos) + ")rotate(" + unNaN(rotation) + ")";
    });
}

function delayedUpdate(tl_layout, tl_representation, tl_scale, interim_duration_scale, unit_width, timeline_scale, transition) {
  transition.select("rect.event_span")
    .style("opacity", function (d) {
      if (tl_layout !== "Segmented" && tl_representation !== "Radial" && globals.active_event_list.indexOf(d.event_id) !== -1) {
        return 1;
      }

      if (tl_layout === "Segmented" || tl_representation === "Radial" || globals.filter_type === "Hide") {
        return 0;
      }

      return 0.1;
    })
    .style("pointer-events", function (d) {
      if (tl_layout !== "Segmented" && tl_representation !== "Radial" && globals.active_event_list.indexOf(d.event_id) !== -1) {
        return "inherit";
      }

      return "none";
    });
  transition.select("rect.time_elapsed")
    .attr("height", function (d) {
      if (tl_scale !== "Collapsed" || d.time_elapsed === 0) {
        return 0;
      }

      return interim_duration_scale(d.time_elapsed);
    })
    .style("opacity", function (d) {
      if (globals.active_event_list.indexOf(d.event_id) !== -1) {
        return 1;
      }

      if (globals.filter_type === "Hide") {
        return 0;
      }

      return 0.1;
    })
    .style("pointer-events", function (d) {
      if (globals.active_event_list.indexOf(d.event_id) !== -1) {
        return "inherit";
      }

      return "none";
    });


  if (tl_representation === "Radial") {
    transition.select("path.event_span")
      .attrTween("d", arcTween(d3.svg.arc()
        .innerRadius(function (d) {
          var inner_radius = globals.centre_radius;
          switch (tl_scale) {

          case "Chronological":
            inner_radius = d3.max([globals.centre_radius, globals.centre_radius + d.track * globals.track_height]);
            break;

          case "Relative":
            inner_radius = d3.max([globals.centre_radius, globals.centre_radius + d.track * globals.track_height]);
            break;

          case "Sequential":
            inner_radius = d3.max([globals.centre_radius, globals.centre_radius + d.seq_track * globals.track_height]);
            break;
          default:
            break;
          }
          return inner_radius;
        })
        .outerRadius(function (d) {
          var outer_radius = globals.centre_radius + unit_width;
          switch (tl_scale) {

          case "Chronological":
            outer_radius = d3.max([globals.centre_radius + unit_width, globals.centre_radius + d.track * globals.track_height + unit_width]);
            break;

          case "Relative":
            outer_radius = d3.max([globals.centre_radius + unit_width, globals.centre_radius + d.track * globals.track_height + unit_width]);
            break;

          case "Sequential":
            outer_radius = d3.max([globals.centre_radius + unit_width, globals.centre_radius + d.seq_track * globals.track_height + unit_width]);
            break;
          default:
            break;
          }
          return outer_radius;
        })
        .startAngle(function (d) {
          var start_angle = 0;
          if (tl_layout !== "Segmented") {
            switch (tl_scale) {

            case "Chronological":
              start_angle = timeline_scale(d.start_date);
              break;

            case "Relative":
              if (tl_layout === "Faceted") {
                start_angle = timeline_scale(d.start_age);
              }
              break;

            case "Sequential":
              start_angle = timeline_scale(d.seq_index);
              break;
            default:
              break;
            }
          } else if (tl_layout === "Segmented") {
            switch (globals.segment_granularity) {
            case "days":
              start_angle = timeline_scale(moment(time.utcHour.floor(d.start_date)).hour());
              break;
            case "weeks":
              start_angle = timeline_scale(moment(time.day.floor(d.start_date)).day());
              break;
            case "months":
              start_angle = timeline_scale(moment(time.day.floor(d.start_date)).date());
              break;
            case "years":
              if (moment(time.utcWeek.floor(d.start_date)).isoWeek() === 53) {
                start_angle = timeline_scale(1);
              } else {
                start_angle = timeline_scale(moment(time.utcWeek.floor(d.start_date)).isoWeek());
              }
              break;
            case "decades":
              start_angle = timeline_scale(moment(time.month.floor(d.start_date)).month() + (time.month.floor(d.start_date).getUTCFullYear() - Math.floor(time.month.floor(d.start_date).getUTCFullYear() / 10) * 10) * 12);
              break;
            case "centuries":
              if (d.start_date.getUTCFullYear() < 0) {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100);
              } else {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 100);
              }
              break;
            case "millenia":
              if (d.start_date.getUTCFullYear() < 0) {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000);
              } else {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 1000);
              }
              break;
            case "epochs":
              start_angle = timeline_scale(d.start_date);
              break;
            default:
              break;
            }
          }
          return start_angle;
        })
        .endAngle(function (d) {
          var end_angle = 0;
          var unit_arc = Math.PI * 2 / 100;
          if (tl_layout !== "Segmented") {
            switch (tl_scale) {

            case "Chronological":
              end_angle = d3.max([timeline_scale(d.end_date), timeline_scale(d.start_date) + unit_arc]);
              break;

            case "Relative":
              if (tl_layout === "Faceted") {
                end_angle = d3.max([timeline_scale(d.end_age), timeline_scale(d.start_age) + unit_arc]);
              }
              break;

            case "Sequential":
              end_angle = timeline_scale(d.seq_index + 1);
              break;
            default:
              break;
            }
          } else if (tl_layout === "Segmented") {
            switch (globals.segment_granularity) {
            case "days":
              end_angle = timeline_scale(moment(time.utcHour.floor(d.start_date)).hour()) + unit_arc;
              break;
            case "weeks":
              end_angle = timeline_scale(moment(time.day.floor(d.start_date)).day()) + unit_arc;
              break;
            case "months":
              end_angle = timeline_scale(moment(time.day.floor(d.start_date)).date()) + unit_arc;
              break;
            case "years":
              if (moment(time.utcWeek.floor(d.start_date)).isoWeek() === 53) {
                end_angle = timeline_scale(1) + unit_arc;
              } else {
                end_angle = timeline_scale(moment(time.utcWeek.floor(d.start_date)).isoWeek()) + unit_arc;
              }
              break;
            case "decades":
              end_angle = timeline_scale(moment(time.month.floor(d.start_date)).month() + (time.month.floor(d.start_date).getUTCFullYear() - Math.floor(time.month.floor(d.start_date).getUTCFullYear() / 10) * 10) * 12) + unit_arc;
              break;
            case "centuries":
              if (d.start_date.getUTCFullYear() < 0) {
                end_angle = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100) + unit_arc;
              } else {
                end_angle = timeline_scale(d.start_date.getUTCFullYear() % 100) + unit_arc;
              }
              break;
            case "millenia":
              if (d.start_date.getUTCFullYear() < 0) {
                end_angle = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000) + unit_arc;
              } else {
                end_angle = timeline_scale(d.start_date.getUTCFullYear() % 1000) + unit_arc;
              }
              break;
            case "epochs":
              end_angle = timeline_scale(d.start_date) + unit_arc;
              break;
            default:
              break;
            }
          }
          return end_angle;
        }))
      )
      .style("opacity", function (d) {
        if (tl_layout !== "Segmented") {
          if (globals.active_event_list.indexOf(d.event_id) !== -1) {
            return 1;
          }

          if (globals.filter_type === "Hide") {
            return 0;
          }

          return 0.1;
        }

        return 0;
      })
      .style("pointer-events", function (d) {
        if (tl_layout !== "Segmented") {
          if (globals.active_event_list.indexOf(d.event_id) !== -1) {
            return "inherit";
          }

          return "none";
        }

        return "none";
      })
      .style("display", "inline");
  }
  transition.selectAll("rect.event_span_component")
    .style("opacity", function () {
      if (tl_layout === "Segmented" && tl_representation !== "Radial" && globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        return 1;
      }

      if (tl_layout !== "Segmented" || globals.filter_type === "Hide" || tl_representation === "Radial") {
        return 0;
      }

      return 0.1;
    })
    .style("pointer-events", function () {
      if (tl_layout === "Segmented" && tl_representation !== "Radial" && globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        return "inherit";
      }

      return "none";
    });
  if (tl_representation === "Radial") {
    transition.selectAll("path.event_span_component")
      .attrTween("d", arcTween(d3.svg.arc()
        .innerRadius(function () {
          var inner_radius = globals.centre_radius;
          if (tl_scale === "Relative" || tl_scale === "Chronological") {
            inner_radius = d3.max([globals.centre_radius, globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height]);
          }
          return inner_radius;
        })
        .outerRadius(function () {
          var outer_radius = globals.centre_radius + unit_width;
          if (tl_scale === "Relative" || tl_scale === "Chronological") {
            outer_radius = d3.max([globals.centre_radius + unit_width, globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height + unit_width]);
          }
          return outer_radius;
        })
        .startAngle(function (dataItem) {
          // TODO: Come back and consolidate startAngle & endAngle
          const d = dataItem.dateTime;
          var start_angle = 0;
          if (tl_layout === "Segmented" && tl_scale === "Chronological") {
            switch (globals.segment_granularity) {
            case "days":
              start_angle = d3.max([0, timeline_scale(moment(d).hour())]);
              break;
            case "weeks":
              start_angle = d3.max([0, timeline_scale(moment(d).day())]);
              break;
            case "months":
              start_angle = d3.max([0, timeline_scale(moment(d).date())]);
              break;
            case "years":
              if (moment(d).isoWeek() === 53) {
                start_angle = d3.max([0, timeline_scale(1)]);
              } else {
                start_angle = d3.max([0, timeline_scale(moment(d).isoWeek())]);
              }
              break;
            case "decades":
              start_angle = d3.max([0, timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12)]);
              break;
            case "centuries":
              if (d < 0) {
                start_angle = d3.max([0, timeline_scale(d % 100 + 100)]);
              } else {
                start_angle = d3.max([0, timeline_scale(d % 100)]);
              }
              break;
            case "millenia":
              if (d < 0) {
                start_angle = d3.max([0, timeline_scale(d % 1000 + 1000)]);
              } else {
                start_angle = d3.max([0, timeline_scale(d % 1000)]);
              }
              break;
            case "epochs":
              start_angle = d3.max([0, timeline_scale(d.valueOf())]);
              break;
            default:
              break;
            }
          } else if (tl_layout === "Unified" || tl_layout === "Faceted") {
            switch (tl_scale) {

            case "Chronological":
              start_angle = timeline_scale(d3.select(this.parentNode).datum().start_date);
              break;

            case "Relative":
              if (tl_layout === "Faceted") {
                start_angle = timeline_scale(d3.select(this.parentNode).datum().start_age);
              }
              break;

            case "Sequential":
              start_angle = timeline_scale(d3.select(this.parentNode).datum().seq_index);
              break;
            default:
              break;
            }
          }
          return start_angle;
        })
        .endAngle(function (dataItem) {
          const d = dataItem.dateTime;
          var end_angle = 0, unit_arc = 0;
          if (tl_layout === "Segmented" && tl_scale === "Chronological") {
            switch (globals.segment_granularity) {
            case "days":
              unit_arc = Math.PI * 2 / 24;
              end_angle = d3.max([0, timeline_scale(moment(d).hour()) + unit_arc]);
              break;
            case "weeks":
              unit_arc = Math.PI * 2 / 7;
              end_angle = d3.max([0, timeline_scale(moment(d).day()) + unit_arc]);
              break;
            case "months":
              unit_arc = Math.PI * 2 / 31;
              end_angle = d3.max([0, timeline_scale(moment(d).date()) + unit_arc]);
              break;
            case "years":
              unit_arc = Math.PI * 2 / 52;
              if (moment(d).isoWeek() === 53) {
                end_angle = d3.max([0, timeline_scale(1) + unit_arc]);
              } else {
                end_angle = d3.max([0, timeline_scale(moment(d).isoWeek()) + unit_arc]);
              }
              break;
            case "decades":
              unit_arc = Math.PI * 2 / 120;
              end_angle = d3.max([0, timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12) + unit_arc]);
              break;
            case "centuries":
              unit_arc = Math.PI * 2 / 100;
              if (d < 0) {
                end_angle = d3.max([0, timeline_scale(d % 100 + 100) + unit_arc]);
              } else {
                end_angle = d3.max([0, timeline_scale(d % 100) + unit_arc]);
              }
              break;
            case "millenia":
              unit_arc = Math.PI * 2 / 100;
              if (d < 0) {
                end_angle = d3.max([0, timeline_scale(d % 1000 + 1000) + unit_arc]);
              } else {
                end_angle = d3.max([0, timeline_scale(d % 1000) + unit_arc]);
              }
              break;
            case "epochs":
              unit_arc = Math.PI * 2 / 100;
              end_angle = d3.max([0, timeline_scale(d.valueOf()) + unit_arc]);
              break;
            default:
              break;
            }
          } else if (tl_layout === "Unified" || tl_layout === "Faceted") {
            unit_arc = Math.PI * 2 / 100;
            switch (tl_scale) {

            case "Chronological":
              end_angle = d3.max([timeline_scale(d.end_date), timeline_scale(d3.select(this.parentNode).datum().start_date) + unit_arc]);
              break;

            case "Relative":
              if (tl_layout === "Faceted") {
                end_angle = d3.max([timeline_scale(d.end_age), timeline_scale(d3.select(this.parentNode).datum().start_age) + unit_arc]);
              }
              break;

            case "Sequential":
              end_angle = timeline_scale(d3.select(this.parentNode).datum().seq_index + 1);
              break;
            default:
              break;
            }
          }
          return end_angle;
        }))
      )
      .style("opacity", function () {
        if (tl_layout === "Segmented" && tl_scale === "Chronological") {
          if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
            return 1;
          }

          if (globals.filter_type === "Hide") {
            return 0;
          }

          return 0.1;
        }

        return 0;
      })
      .style("pointer-events", function () {
        if (tl_layout === "Segmented" && tl_scale === "Chronological") {
          if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
            return "inherit";
          }

          return "none";
        }

        return "none";
      })
      .style("display", "inline");
  }
}


function finalUpdate(tl_layout, transition) {
  transition.select(".path_end_indicator")
    .style("opacity", function () {
      if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        return 1;
      }

      return 0;
    })
    .style("pointer-events", function () {
      if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) !== -1) {
        return "inherit";
      }

      return "none";
    })
    .style("display", function () {
      if (tl_layout === "Segmented") {
        return "inline";
      }

      return "none";
    });

  transition.selectAll("path.event_span").each(function () {
    this.parentNode.appendChild(this);
  });
}

function transitionLog(start, transition) {
  if (transition.size() > 0) {
    log((new Date().getTime() - start.getTime()) + "ms: transition with " + transition.size() + " elements lasting " + transition.duration() + "ms.");
  }
}

// place an element in correct x position on grid axis
function getXGridPosition(year) {
  var cell_size = 50;

  if (year < 0 && year % 10 !== 0) {
    return (year % 10 + 10) * cell_size; // negative decade year correction adds 10
  }

  return year % 10 * cell_size;
}

// place an element in correct y position on grid axis
function getYGridPosition(year, min, unit_width) {
  var cell_size = 50,
    century_height = cell_size * unit_width,
    y_offset = 0;

  var decade_of_century = 0,
    century_offset = Math.floor(year / 100) - Math.floor(min / 100);

  if (year < 0) {
    century_offset++; // handle BC dates
    if (year % 100 === 0) {
      decade_of_century = 0;
      century_offset--;
      y_offset = -unit_width;
    } else {
      decade_of_century = Math.floor(year % 100 / 10) - 1;
    }
  } else {
    decade_of_century = Math.floor(year % 100 / 10);
  }

  return decade_of_century * 1.25 * cell_size + century_offset * (century_height + cell_size) + y_offset;
}

function calculateSpanSegment(min_start_date, start_date) {
  var span_segment = 0;
  const year = start_date && start_date.getUTCFullYear ? start_date.getUTCFullYear() : start_date;
  switch (globals.segment_granularity) {
  case "days":
    span_segment = d3.max([0, time.day.count(time.day.floor(min_start_date), start_date)]);
    break;
  case "weeks":
    span_segment = d3.max([0, time.week.count(time.week.floor(min_start_date), start_date)]);
    break;
  case "months":
    span_segment = d3.max([0, time.month.count(time.month.floor(min_start_date), start_date)]);
    break;
  case "years":
    span_segment = d3.max([0, year - min_start_date.getUTCFullYear()]);
    break;
  case "decades":
    span_segment = d3.max([0, Math.floor(year / 10) - Math.floor(min_start_date.getUTCFullYear() / 10)]);
    break;
  case "centuries":
    span_segment = d3.max([0, Math.floor(year / 100) - Math.floor(min_start_date.getUTCFullYear() / 100)]);
    break;
  case "millenia":
    span_segment = d3.max([0, Math.floor(year / 1000) - Math.floor(min_start_date.getUTCFullYear() / 1000)]);
    break;
  default:
    break;
  }
  return span_segment;
}

/**
 * Returns the number of segments necessary to appropriately render the given granularity
 * @param {string} granularity The granularity to get the number of segments for
 * @return {number} The number of segments for a given granularity
 */
function getNumberOfSegmentsForGranularity(granularity) {
  if (granularity === "days") {
    return 24;
  }
  if (granularity === "weeks") {
    return 7;
  }
  if (granularity === "months") {
    return 31;
  }
  if (granularity === "years") {
    return 52;
  }
  if (granularity === "decades") {
    return 120;
  }
  return 100;
}
