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

var utils = require("./utils");
var selectWithParent = utils.selectWithParent;
var selectAllWithParent = utils.selectAllWithParent;

d3.configurableTL = function (unit_width, padding) {

  var tl_scale = "Chronological", //timeline scale (chronological | relative | log | interim_duration | sequential)
  tl_layout = "Unified", //timeline layout  (unified | faceted | segmented)
  tl_representation = "Linear", // timeline representation (linear | grid | radial | spiral | curve)
  prev_tl_scale = "None", //timeline scale (chronological | relative | log | interim_duration | sequential)
  prev_tl_layout = "None", //timeline layout  (unified | faceted | segmented)
  prev_tl_representation = "None", // timeline representation (linear | grid | radial | spiral | curve)
  duration = 0,
  height = 760,
  width = 120,
  timeline_scale = d3.scale.linear(),
  timeline_scale_segments = [],
  interim_duration_scale = d3.scale.linear().nice().range([0.25 * unit_width,4 * unit_width]),
  interim_duration_axis  = d3.svg.axis().orient("right").outerTickSize(0),
  tick_format,
  timeline_axis = d3.svg.axis().orient("top"),
  radial_axis = radialAxis(unit_width),
  radial_axis_quantiles = [],
  calendar_axis = calendarAxis(),
  grid_axis = gridAxis(unit_width),
  render_path = undefined,
  active_line = undefined,
  fresh_canvas = true;

  function configurableTL (selection) {

    selection.each(function (data) {

      if (data.min_start_date == undefined || data.max_end_date == undefined) {
        data.min_start_date = globals.global_min_start_date;
        data.max_end_date = globals.global_max_end_date;
      }

      //update timeline dimensions
      var g = d3.select(this),
      old_timeline_scale, //old timeline scale
      old_interim_duration_scale, //old bar chart scale
      last_end_date = data.max_end_date.valueOf() + 1,
      last_start_date = data.max_start_date.valueOf(),
      timeline_span = last_end_date - data.min_start_date.valueOf(),
      domain_bound = (last_end_date - last_start_date) / timeline_span,
      log_bounds = -1,
      curve_margin = 20;

      render_path = d3.svg.line()
      .x(function(d) {
        if (d[0] < curve_margin) {
          return curve_margin;
        }
        if (d[0] > width - curve_margin) {
          return d3.max([0,width - curve_margin]);
        }
        else {
          return d[0];
        }
      })
      .y(function(d) {
        if (d[1] < curve_margin) {
          return curve_margin;
        }
        if (d[1] > height - curve_margin) {
          return d3.max([0,height - curve_margin]);
        }
        else {
          return d[1];
        }
      })
      .interpolate("basis");

      //remove event annotations during a transition
      selectAllWithParent(".event_annotation").remove();

      console.log("timeline initialized");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "drawing",
        event_detail: "timeline initialized"
      }
      globals.usage_log.push(log_event);

      /**
      ---------------------------------------------------------------------------------------
      GLOBAL DIMENSIONS
      ---------------------------------------------------------------------------------------
      **/

      //add parent container for entire timeline
      var timeline_container = g.selectAll(".timeline")
      .data([null]);

      //define the parent container
      var timeline_container_enter = timeline_container.enter()
      .append("g")
      .attr("class", "timeline")
      .attr("transform", function(){
        return "translate(" + globals.padding.left + "," + globals.padding.top + ")"
      });

      timeline_container_enter.append("rect")
      .attr("class","timeline_frame")
      .attr("width",width)
      .attr("height",height)
      .on('mouseover', function(){
        d3.select(this)
        .style('opacity',0.8)
        .style('stroke','#ccc')
        .style('stroke-width','0.5px');
      })
      .on('mouseout', function(){
        d3.select(this)
        .style('opacity',0.1)
        .style('stroke','none')
      })
      .on('dblclick', function(){

        console.log("curve reset")

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "curve_reset",
          event_detail: "curve reset"
        }
        globals.usage_log.push(log_event);

        configurableTL.resetCurve();
      })
      .call(d3.behavior.drag()
      .on("dragstart", dragStarted)
      .on("drag", dragged)
      .on("dragend", dragEnd));

      /**
      CURVE-specific timeline
      --*/

      timeline_container_enter.append('path')
      .attr('id', 'timecurve')
      .style('visibility','hidden');

      var timeline_container_update = g.selectAll(".timeline")
      .transition()
      .duration(duration);

      timeline_container_update.select("#timecurve")
      .transition()
      .delay(0)
      .duration(duration)
      .style('visibility', function () {
        if (tl_representation != 'Curve') {
          return 'hidden';
        }
        else {
          return 'visible';
        }
      })

      //update parent container
      timeline_container_update.selectAll(".timeline_frame")
      .attr("width",width)
      .attr("height",height);

      console.log("timeline container updated");

      var log_event = {
        event_time: new Date().valueOf(),
        event_category: "drawing",
        event_detail: "timeline container updated"
      }
      globals.usage_log.push(log_event);

      /**
      ---------------------------------------------------------------------------------------
      FACETS
      ---------------------------------------------------------------------------------------
      **/

      //add facet containers
      if (tl_layout == "Faceted" || prev_tl_layout == "Faceted") {

        var timeline_facet = timeline_container.selectAll(".timeline_facet")
        .data(globals.facets.domain());

        var timeline_facet_exit = timeline_facet.exit().transition()
        .duration(duration)
        .remove();

        var facet_number = 0;

        //define each facet and its rect container
        var timeline_facet_enter = timeline_facet.enter()
        .append("g")
        .attr("class","timeline_facet")
        .each(function() {
          var firstChild = selectWithParent('.timeline_axis').node();
          if (firstChild) {
            this.parentNode.insertBefore(this, firstChild);
          }
        });

        //update facet container dimensions
        var timeline_facet_update = timeline_facet.transition()
        .duration(duration);

        timeline_facet_enter.append("rect")
        .attr("class","timeline_facet_frame")
        .attr("width", d3.max([0,width]))
        .attr("height", 0);

        timeline_facet_enter.append("title")
        .text("");

        //print the name of each facet
        timeline_facet_enter.append("text")
        .attr("class", "facet_title")
        .attr("dy","-0.5em")
        .style("text-anchor", "middle")
        .text(function (d) {
          if (d == undefined || tl_layout != "Faceted") {
            return "";
          }
          else {
            if (tl_representation == "Linear") {
              return d.substring(0, Math.floor(height / globals.num_facets / 10));
            }
            else {
              return d;
            }
          }
        })
        .attr("transform",  "translate(0,0)rotate(0)");

        timeline_facet_update.select("title")
        .text( function (d) {
          return d;
        });

        timeline_facet_update.select(".timeline_facet_frame")
        .attr("width", d3.max([0,width]))
        .attr("height", function () {
          if (tl_layout != "Faceted") {
            return 0;
          }
          else if (tl_representation == "Linear") {
            return d3.max([0,height / globals.num_facets]);
          }
          else {
            return 0;
          }
        })
        .attr("transform", function (){
          var offset_x,
          offset_y;

          if (tl_layout != "Faceted") {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          else if (tl_representation == "Linear") {
            offset_x = 0;
            offset_y = facet_number * (height / globals.num_facets);
            facet_number++;
          }
          else if (tl_representation == "Radial" || (tl_representation == "Spiral" && tl_scale == "Sequential")) {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          else {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          return "translate(" + offset_x + "," + offset_y + ")";
        });

        timeline_facet_exit.select(".timeline_facet_frame")
        .attr("height", 0);

        facet_number = 0;

        timeline_facet_update.select("text.facet_title")
        .text(function (d) {
          if (d == undefined || tl_layout != "Faceted") {
            return "";
          }
          else {
            if (tl_representation == "Linear") {
              return d.substring(0, Math.floor(height / globals.num_facets / 10));
            }
            else {
              return d;
            }
          }
        })
        .attr("transform", function () {
          var offset_x = 0,
          offset_y = 0,
          rotation = 0;
          if (tl_layout != "Faceted") {
            offset_x = width / 2;
            offset_y = height / 2;
            rotation = 0;
          }
          else if (tl_representation == "Linear") {
            offset_x = 0;
            offset_y = facet_number * (height / globals.num_facets) + height / globals.num_facets / 2;
            rotation = 270;
            facet_number++;
          }
          else if (tl_representation == "Radial") {
            offset_x = facet_number % globals.num_facet_cols * (width / globals.num_facet_cols) + width / globals.num_facet_cols / 2;
            offset_y = Math.floor(facet_number / globals.num_facet_cols) * (height / globals.num_facet_rows) + globals.buffer + unit_width;
            rotation = 0;
            facet_number++;
          }
          else if (tl_representation == "Spiral" && tl_scale == "Sequential") {
            offset_x = facet_number % globals.num_facet_cols * (width / globals.num_facet_cols) + width / globals.num_facet_cols / 2;
            offset_y = Math.floor(facet_number / globals.num_facet_cols) * globals.spiral_dim + globals.buffer + unit_width;
            rotation = 0;
            facet_number++;

          }
          else {
            offset_x = width / 2;
            offset_y = height / 2;
            rotation = 0;
          }
          return "translate(" + offset_x + " ," + offset_y + ")rotate(" + rotation + ")";
        });

        timeline_facet_exit.select("text.facet_title")
        .attr("transform", "translate(" + (0 - width) + " ,0)");

        console.log("facet containers updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "drawing",
          event_detail: "facet containers updated"
        }
        globals.usage_log.push(log_event);

      }

      /**
      ---------------------------------------------------------------------------------------
      SEGMENTS
      ---------------------------------------------------------------------------------------
      **/

      //add segment containers
      if (tl_layout == "Segmented" || prev_tl_layout == "Segmented") {

        var timeline_segment = timeline_container.selectAll(".timeline_segment")
        .data(globals.segments.domain());

        var segment_number = 0;

        var timeline_segment_exit = timeline_segment.exit().transition()
        .duration(duration)
        .remove();

        //define each segment and its rect container
        var timeline_segment_enter = timeline_segment.enter()
        .append("g")
        .attr("class","timeline_segment")
        .each(function() {
          var firstChild = selectWithParent('.timeline_axis').node();
          if (firstChild) {
            this.parentNode.insertBefore(this, firstChild);
          }
        });

        var timeline_segment_update = timeline_segment.transition()
        .duration(duration)

        timeline_segment_enter.append("rect")
        .attr("class","timeline_segment_frame")
        .attr("width", d3.max([0,width]))
        .attr("height", 0);

        //print the name of each segment
        timeline_segment_enter.append("text")
        .attr("class", "segment_title")
        .attr("dy","-0.5em")
        .style("text-anchor", "middle")
        .text("")
        .attr("transform", "translate(0,0)rotate(0)");

        //update segment container dimensions
        timeline_segment_update.select(".timeline_segment_frame")
        .attr("width", d3.max([0,width]))
        .attr("height", function () {
          if (tl_layout != "Segmented" || tl_representation == "Calendar" || tl_representation == "Grid") {
            return 0;
          }
          else if (tl_representation == "Linear") {
            return d3.max([0,height / globals.num_segments]);
          }
          else if (tl_representation == "Radial") {
            return 0;
          }
          else if (tl_representation == "Calendar" || tl_representation == "Grid") {
            return 0;
          }
          else {
            return 0;
          }
        })
        .attr("transform", function (){
          var offset_x,
          offset_y;

          if (tl_layout != "Segmented" || tl_representation == "Calendar" || tl_representation == "Grid") {
            offset_x = 0;
            offset_y = 0;
          }
          else if (tl_representation == "Linear") {
            offset_x = 0;
            offset_y = segment_number * (height / globals.num_segments);
            segment_number++;
          }
          else if (tl_representation == "Radial") {
            offset_x = width / 2;
            offset_y =0;
          }
          else {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          return "translate(" + offset_x + "," + offset_y + ")";
        });

        segment_number = 0;

        timeline_segment_update.select("text.segment_title")
        .text(function (d) {
          if ( tl_layout != "Segmented" || tl_representation == "Calendar" || tl_representation == "Grid" || globals.segment_granularity == "epochs") {
            return "";
          }
          return d;
        })
        .attr("transform", function () {
          var offset_x = 0,
          offset_y = 0,
          rotation = 0;
          if (tl_layout != "Segmented"  || tl_representation == "Calendar" || tl_representation == "Grid") {
            offset_x = width / 2;
            offset_y = height / 2;
            rotation = 0;
          }
          else if (tl_representation == "Linear") {
            offset_x = 0;
            offset_y = segment_number * (height / globals.num_segments) + height / globals.num_segments / 2;
            rotation = 270;
            segment_number++;
          }
          else if (tl_representation == "Radial") {
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

        console.log("segment containers updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "drawing",
          event_detail: "segment containers updated"
        }
        globals.usage_log.push(log_event);
      }

      /**
      ---------------------------------------------------------------------------------------
      SCALES
      ---------------------------------------------------------------------------------------
      **/

      timeline_scale_segments = [];

      //update scales
      switch (tl_layout) {
        case "Unified":
        switch (tl_representation) {

          case "Linear":
          switch (tl_scale) {

            case "Chronological":
            //valid scale
            if (globals.date_granularity == "epochs") {
              timeline_scale = d3.scale.linear()
              .range([0,width - unit_width])
              .domain([data.min_start_date.valueOf(),data.max_end_date.valueOf()]);
              tick_format = function(d) {
                return globals.formatAbbreviation(d);
              };
            }
            else {
              timeline_scale = d3.time.scale()
              .range([0,width - unit_width])
              .domain([data.min_start_date,data.max_end_date]);
              if (globals.date_granularity == "years" && data.min_start_date.getUTCFullYear() <= 100){
                tick_format = function (d) {
                  if (d.getUTCFullYear() > 0) {
                    return +d.getUTCFullYear() + " AD";
                  }
                  else if (d.getUTCFullYear() < 0) {
                    return (-1 * d.getUTCFullYear()) + " BC";
                  }
                  else if (d.getUTCFullYear() == 0) {
                    return 0;
                  }
                }
              }
            }
            console.log(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date
            }
            globals.usage_log.push(log_event);

            break;

            case "Log":
            //valid scale
            timeline_scale = d3.scale.log()
            .range([0,width - unit_width]);

            log_bounds = -1 * Math.abs(data.max_end_date.valueOf() - data.min_start_date.valueOf()) - 1;
            timeline_scale.domain([log_bounds,-1]);

            switch (globals.segment_granularity) {
              case "days":
              log_bounds = -1 * time.hour.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " hours"
              }
              break;
              case "weeks":
              log_bounds = -1 * time.day.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " days"
              }
              break;
              case "months":
              log_bounds = -1 * time.week.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " weeks"
              }
              break;
              case "years":
              log_bounds = -1 * time.month.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " months"
              }
              break;
              case "decades":
              log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
              tick_format = function (d) {
                return d + " years"
              }
              break;
              case "centuries":
              log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
              tick_format = function (d) {
                return d + " years"
              }
              break;
              case "millenia":
              log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
              tick_format = function (d) {
                return d + " years"
              }
              break;
              default:
              log_bounds = -1 * Math.abs(data.max_end_date.valueOf() - data.min_start_date.valueOf()) - 1;
              tick_format = function (d) {
                return globals.formatAbbreviation(d);
              }
              break;
            }
            timeline_scale.domain([log_bounds,-1]);
            console.log(tl_scale + " scale updated with " + globals.segment_granularity + " granularity and range: " + data.min_start_date + " - " + data.max_end_date);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.segment_granularity + " granularity and range: " + data.min_start_date + " - " + data.max_end_date
            }
            globals.usage_log.push(log_event);
            break;

            case "Collapsed":
            //valid timeline scale
            timeline_scale = d3.scale.linear()
            .range([0,globals.max_seq_index * 1.5 * unit_width - unit_width])
            .domain([0,globals.max_seq_index * unit_width]);

            var i = -1,
            last_start_date,
            format = function(d){
              return globals.formatAbbreviation(d);
            };

            //valid Collapsed scale
            data.forEach(function (item){
              i++;
              if (i == 0){
                item.time_elapsed = 0;
                last_start_date = item.start_date;
              }
              else {
                if ((item.start_date.valueOf() - last_start_date.valueOf()) > 0) {
                  item.time_elapsed = item.start_date.valueOf() - last_start_date.valueOf();
                  if (globals.date_granularity == "epochs") {
                    item.time_elapsed_label = format(item.start_date.valueOf() - last_start_date.valueOf()) + " years";
                  }
                  else {
                    item.time_elapsed_label = moment(item.start_date).from(moment(last_start_date),true);
                  }
                  last_start_date = item.start_date;
                }
                else {
                  item.time_elapsed = 0;
                  if (globals.date_granularity == "epochs") {
                    item.time_elapsed_label = format(item.start_date.valueOf() - last_start_date.valueOf()) + " years";
                  }
                  else {
                    item.time_elapsed_label = moment(item.start_date).from(moment(last_start_date),true);
                  }
                }
              }
            });

            var max_time_elapsed = d3.max(data, function (d) { return d.time_elapsed });

            //initialize the time scale
            if (globals.date_granularity == "epochs") {
              interim_duration_scale = d3.scale.log().range([0.25 * unit_width,4 * unit_width])
              .domain([1,max_time_elapsed]);
            }
            else {
              interim_duration_scale = d3.scale.linear().range([0.25 * unit_width,4 * unit_width])
              .domain([0,max_time_elapsed]);
            }

            console.log(tl_scale + " scale updated with " + globals.date_granularity + " granularity and range: 0 - " + max_time_elapsed + " time elapsed");

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.date_granularity + " granularity and range: 0 - " + max_time_elapsed + " time elapsed"
            }
            globals.usage_log.push(log_event);

            break;

            case "Sequential":
            //valid scale
            timeline_scale = d3.scale.linear()
            .range([0,globals.max_seq_index * 1.5 * unit_width - unit_width])
            .domain([0,globals.max_seq_index * unit_width]);

            console.log(tl_scale + " scale updated with range: 0 - " + globals.max_seq_index);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with range: 0 - " + globals.max_seq_index
            }
            globals.usage_log.push(log_event);

            break;
          }
          break;

          case "Radial":
          switch (tl_scale) {

            case "Chronological":
            //valid scale
            //initialize the time scale
            timeline_scale = d3.time.scale()
            .range([0,2 * Math.PI]);

            switch (globals.segment_granularity) {
              case "days":
              if (time.hour.count(time.day.floor(data.min_start_date), time.day.ceil(data.max_end_date)) > 24) {
                timeline_scale_segments = time.hour.range(time.day.floor(data.min_start_date),time.hour.offset(time.day.ceil(data.max_end_date),3),12);
              }
              else {
                timeline_scale_segments = time.hour.range(time.day.floor(data.min_start_date),time.hour.offset(time.day.ceil(data.max_end_date),3),3);
              }
              timeline_scale.domain([time.day.floor(data.min_start_date),time.day.ceil(data.max_end_date)]);
              break;
              case "weeks":
              timeline_scale_segments = time.week.range(time.week.floor(data.min_start_date),time.week.offset(data.max_end_date,1),2);
              timeline_scale.domain([time.week.floor(data.min_start_date),time.week.offset(data.max_end_date,1)]);
              break;
              case "months":
              timeline_scale_segments = time.month.range(time.month.floor(data.min_start_date),time.month.offset(data.max_end_date,1));
              timeline_scale.domain([time.month.floor(data.min_start_date),time.month.offset(data.max_end_date,1)]);
              break;
              case "years":
              timeline_scale_segments = time.year.range(time.year.floor(data.min_start_date),time.year.offset(data.max_end_date,1));
              timeline_scale.domain([time.year.floor(data.min_start_date),time.year.offset(data.max_end_date,1)]);
              break;
              case "decades":
              var year_offset = 5;
              if ((data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) >= 50) {
                year_offset = 10;
              }
              else {
                year_offset = 5;
              }
              var start = Math.floor(data.min_start_date.getUTCFullYear() / year_offset) * year_offset;
              var end = (Math.ceil((data.max_end_date.getUTCFullYear() + 1) / year_offset) + 1) * year_offset;
              if (start < 0 && end <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),new Date(end,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1), new Date((end + year_offset),0,1).setUTCFullYear(("0000" + end).slice(-4) * -1)]);
              }
              else if (start <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1), new Date((end + year_offset),0,1)]);
              }
              else {
                timeline_scale_segments = time.year.range(new Date(start,0,1),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1), new Date((end + year_offset),0,1)]);
              }
              break;
              case "centuries":
              var year_offset = 20;
              if ((data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) >= 500) {
                year_offset = 100;
              }
              else {
                year_offset = 20;
              }
              var start = Math.floor(data.min_start_date.getUTCFullYear() / year_offset) * year_offset;
              var end = (Math.ceil((data.max_end_date.getUTCFullYear() + 1) / year_offset) + 1) * year_offset;
              if (start < 0 && end <= 0) {

                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),new Date(end,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1), new Date((end + year_offset),0,1).setUTCFullYear(("0000" + end).slice(-4) * -1)]);
              }
              else if (start <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1)]);
              }
              else {
                timeline_scale_segments = time.year.range(new Date(start,0,1),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1), new Date((end + year_offset),0,1)]);
              }
              break;
              case "millenia":
              var year_offset = 200;
              if ((data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) >= 5000) {
                year_offset = 1000;
              }
              else {
                year_offset = 200;
              }
              var start = Math.floor(data.min_start_date.getUTCFullYear() / year_offset) * year_offset;
              var end = (Math.ceil((data.max_end_date.getUTCFullYear() + 1) / year_offset) + 1) * year_offset;
              if (start < 0 && end <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1).setUTCFullYear(("0000" + start).slice(-4)),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1).setUTCFullYear(("0000" + end).slice(-4))]);
              }
              else if (start <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1)]);
              }
              else {
                timeline_scale_segments = time.year.range(new Date(start,0,1),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1), new Date((end + year_offset),0,1)]);
              }
              break;
              case "epochs":
              timeline_scale_segments = [data.min_start_date.valueOf(),data.min_start_date.valueOf() * 0.25, data.min_start_date.valueOf() * 0.5, data.min_start_date.valueOf() * 0.75];
              timeline_scale.domain([data.min_start_date,data.max_end_date]);
              break;
            }
            console.log(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date
            }
            globals.usage_log.push(log_event);

            break;

            case "Sequential":
            //valid scale
            var index_offset = 5;
            if (globals.max_seq_index > 500) {
              index_offset = 100;
            }
            else if (globals.max_seq_index > 100) {
              index_offset = 50;
            }
            else if (globals.max_seq_index > 50) {
              index_offset = 10;
            }
            else if (globals.max_seq_index > 10){
              index_offset = 5;
            }
            else {
              index_offset = 1;
            }
            timeline_scale = d3.scale.linear()
            .range([0,2 * Math.PI])
            .domain([0, (Math.ceil(globals.max_seq_index / index_offset) + 1) * index_offset]);
            timeline_scale_segments = d3.range(0, (Math.ceil(globals.max_seq_index / index_offset) + 1) * index_offset, index_offset);
            console.log(tl_scale + " scale updated with range: 0 - " + globals.max_seq_index);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with range: 0 - " + globals.max_seq_index
            }
            globals.usage_log.push(log_event);

            break;
          }
          break;
        }
        break;

        case "Faceted":
        switch (tl_representation) {

          case "Linear":
          switch (tl_scale) {

            case "Chronological":
            //valid scale
            if (globals.date_granularity == "epochs") {
              timeline_scale = d3.scale.linear()
              .range([0,width - unit_width])
              .domain([data.min_start_date.valueOf(),data.max_end_date.valueOf()]);
              tick_format = function(d) {
                return globals.formatAbbreviation(d);
              };
            }
            else {
              timeline_scale = d3.time.scale()
              .range([0,width - unit_width])
              .domain([data.min_start_date,data.max_end_date]);
              if (globals.date_granularity == "years" && data.min_start_date.getUTCFullYear() < 0){
                tick_format = function (d) {
                  if (d.getUTCFullYear() > 0) {
                    return +d.getUTCFullYear() + " AD";
                  }
                  else if (d.getUTCFullYear() < 0) {
                    return (-1 * d.getUTCFullYear()) + " BC";
                  }
                  else if (d.getUTCFullYear() == 0) {
                    return 0;
                  }
                }
              }
            }
            console.log(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date
            }
            globals.usage_log.push(log_event);

            break;

            case "Relative":
            //valid scale
            if (globals.date_granularity == "epochs") {
              timeline_scale = d3.scale.linear()
              .range([0,width - unit_width])
              .domain([0,globals.max_end_age]);
              tick_format = function(d) {
                return globals.formatAbbreviation(d);
              };
            }
            else {
              timeline_scale = d3.scale.linear()
              .range([0,width - unit_width])
              .domain([0,globals.max_end_age])
              tick_format = function (d) {
                var converted_tick = d;
                if ((globals.max_end_age / 86400000) > 1000) {
                  converted_tick = Math.round(d / 31536000730) + " years";
                }
                else if ((globals.max_end_age / 86400000) > 120) {
                  converted_tick = Math.round(d / 2628000000) + " months";
                }
                else if ((globals.max_end_age / 86400000) > 2) {
                  converted_tick = Math.round(d / 86400000) + " days";
                }
                else {
                  converted_tick = Math.round(d / 3600000) + " hours";
                }
                return converted_tick;
              };
            }
            console.log(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: 0 - " + globals.max_end_age);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: 0 - " + globals.max_end_age
            }
            globals.usage_log.push(log_event);

            break;

            case "Log":
            //valid scale
            timeline_scale = d3.scale.log()
            .range([0,width - unit_width]);

            log_bounds = -1 * Math.abs(data.max_end_date.valueOf() - data.min_start_date.valueOf()) - 1;
            timeline_scale.domain([log_bounds,-1]);

            switch (globals.segment_granularity) {
              case "days":
              log_bounds = -1 * time.hour.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " hours"
              }
              break;
              case "weeks":
              log_bounds = -1 * time.day.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " days"
              }
              break;
              case "months":
              log_bounds = -1 * time.week.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " weeks"
              }
              break;
              case "years":
              log_bounds = -1 * time.month.count(data.min_start_date, data.max_end_date) - 1;
              tick_format = function (d) {
                return d + " months"
              }
              break;
              case "decades":
              log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
              tick_format = function (d) {
                return d + " years"
              }
              break;
              case "centuries":
              log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
              tick_format = function (d) {
                return d + " years"
              }
              break;
              case "millenia":
              log_bounds = -1 * Math.abs(data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) - 1;
              tick_format = function (d) {
                return d + " years"
              }
              break;
              default:
              log_bounds = -1 * Math.abs(data.max_end_date.valueOf() - data.min_start_date.valueOf()) - 1;
              tick_format = function (d) {
                return globals.formatAbbreviation(d);
              }
              break;
            }
            timeline_scale.domain([log_bounds,-1]);
            console.log(tl_scale + " scale updated with " + globals.segment_granularity + " granularity and range: " + data.min_start_date + " - " + data.max_end_date);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.segment_granularity + " granularity and range: " + data.min_start_date + " - " + data.max_end_date
            }
            globals.usage_log.push(log_event);
            break;

            break;

            case "Sequential":
            //valid scale
            timeline_scale = d3.scale.linear()
            .range([0,globals.max_seq_index * 1.5 * unit_width - unit_width])
            .domain([0,globals.max_seq_index * unit_width]);
            console.log(tl_scale + " scale updated with range: 0 - " + globals.max_seq_index);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with range: 0 - " + globals.max_seq_index
            }
            globals.usage_log.push(log_event);
            break;
          }
          break;

          case "Radial":
          switch (tl_scale) {

            case "Chronological":
            //valid scale:
            timeline_scale = d3.time.scale()
            .range([0,2 * Math.PI]);

            switch (globals.segment_granularity) {
              case "days":
              if (time.hour.count(time.day.floor(data.min_start_date), time.day.ceil(data.max_end_date)) > 24) {
                timeline_scale_segments = time.hour.range(time.day.floor(data.min_start_date),time.hour.offset(time.day.ceil(data.max_end_date),3),12);
              }
              else {
                timeline_scale_segments = time.hour.range(time.day.floor(data.min_start_date),time.hour.offset(time.day.ceil(data.max_end_date),3),3);
              }
              timeline_scale.domain([time.day.floor(data.min_start_date),time.day.ceil(data.max_end_date)]);
              break;
              case "weeks":
              timeline_scale_segments = time.week.range(time.week.floor(data.min_start_date),time.week.offset(data.max_end_date,1),2);
              timeline_scale.domain([time.week.floor(data.min_start_date),time.week.offset(data.max_end_date,1)]);
              break;
              case "months":
              timeline_scale_segments = time.month.range(time.month.floor(data.min_start_date),time.month.offset(data.max_end_date,1));
              timeline_scale.domain([time.month.floor(data.min_start_date),time.month.offset(data.max_end_date,1)]);
              break;
              case "years":
              timeline_scale_segments = time.year.range(time.year.floor(data.min_start_date),time.year.offset(data.max_end_date,1));
              timeline_scale.domain([time.year.floor(data.min_start_date),time.year.offset(data.max_end_date,1)]);
              break;
              case "decades":
              var year_offset = 5;
              if ((data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) >= 50) {
                year_offset = 10;
              }
              else {
                year_offset = 5;
              }
              var start = Math.floor(data.min_start_date.getUTCFullYear() / year_offset) * year_offset;
              var end = (Math.ceil((data.max_end_date.getUTCFullYear() + 1) / year_offset) + 1) * year_offset;
              if (start < 0 && end <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1).setUTCFullYear(("0000" + start).slice(-4)),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1).setUTCFullYear(("0000" + end).slice(-4))]);
              }
              else if (start <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1)]);
              }
              else {
                timeline_scale_segments = time.year.range(new Date(start,0,1),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1), new Date((end + year_offset),0,1)]);
              }
              break;

              case "centuries":
              var year_offset = 20;
              if ((data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) >= 500) {
                year_offset = 100;
              }
              else {
                year_offset = 20;
              }
              var start = Math.floor(data.min_start_date.getUTCFullYear() / year_offset) * year_offset;
              var end =(Math.ceil((data.max_end_date.getUTCFullYear() + 1) / year_offset) + 1) * year_offset;
              if (start < 0 && end <= 0) {

                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),new Date(end,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4) * -1), new Date((end + year_offset),0,1).setUTCFullYear(("0000" + end).slice(-4) * -1)]);
              }
              else if (start <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1)]);
              }
              else {
                timeline_scale_segments = time.year.range(new Date(start,0,1),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1), new Date((end + year_offset),0,1)]);
              }
              break;
              case "millenia":
              var year_offset = 200;
              if ((data.max_end_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()) >= 5000) {
                year_offset = 1000;
              }
              else {
                year_offset = 200;
              }
              var start = Math.floor(data.min_start_date.getUTCFullYear() / year_offset) * year_offset;
              var end = (Math.ceil((data.max_end_date.getUTCFullYear() + 1) / year_offset) + 1) * year_offset;

              if (start < 0 && end <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1).setUTCFullYear(("0000" + start).slice(-4)),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1).setUTCFullYear(("0000" + end).slice(-4))]);
              }
              else if (start <= 0) {
                timeline_scale_segments = time.year.range(new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)),new Date(end,0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1).setUTCFullYear(("0000" + start).slice(-4)), new Date((end + year_offset),0,1)]);
              }
              else {
                timeline_scale_segments = time.year.range(new Date(start,0,1),new Date((end + year_offset),0,1),year_offset);
                timeline_scale.domain([new Date(start,0,1), new Date((end + year_offset),0,1)]);
              }
              break;
              case "epochs":
              timeline_scale_segments = [data.min_start_date.valueOf()];
              timeline_scale.domain([data.min_start_date,data.max_end_date]);
              console.log(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date);

              var log_event = {
                event_time: new Date().valueOf(),
                event_category: "scale_update",
                event_detail: tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: " + data.min_start_date + " - " + data.max_end_date
              }
              globals.usage_log.push(log_event);

              break;
            }
            break;

            case "Relative":
            //valid scale
            timeline_scale = d3.scale.linear()
            .range([0,2 * Math.PI]);

            if (globals.segment_granularity == "days") {
              timeline_scale.domain([0,globals.max_end_age]);
              timeline_scale_segments = d3.range(0,globals.max_end_age / 3600000 + 1);
            }
            else {
              timeline_scale.domain([0,globals.max_end_age * 1.05]);
              timeline_scale_segments = d3.range(0,Math.round((globals.max_end_age + 86400000) / 86400000));
            }
            console.log(tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: 0 - " + data.max_end_age);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with " + globals.date_granularity + " date granularity and range: 0 - " + data.max_end_age
            }
            globals.usage_log.push(log_event);

            break;

            case "Sequential":
            //valid scale
            var index_offset = 5;
            if (globals.max_seq_index > 500) {
              index_offset = 100;
            }
            else if (globals.max_seq_index > 100) {
              index_offset = 50;
            }
            else if (globals.max_seq_index > 50) {
              index_offset = 10;
            }
            else if (globals.max_seq_index > 10){
              index_offset = 5;
            }
            else {
              index_offset = 1;
            }
            timeline_scale = d3.scale.linear()
            .range([0,2 * Math.PI])
            .domain([0, (Math.ceil(globals.max_seq_index / index_offset) + 1) * index_offset]);
            timeline_scale_segments = d3.range(0, (Math.ceil(globals.max_seq_index / index_offset) + 1) * index_offset, index_offset);
            console.log(tl_scale + " scale updated with range: 0 - " + globals.max_seq_index);

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "scale_update",
              event_detail: tl_scale + " scale updated with range: 0 - " + globals.max_seq_index
            }
            globals.usage_log.push(log_event);

            break;
          }
          break;
        }
        break;

        case "Segmented":
        if (tl_representation == "Linear" && tl_scale == "Chronological") {
          //valid scale
          timeline_scale = d3.scale.linear()
          .range([0,width - unit_width]);

          switch (globals.segment_granularity) {
            case "days":
            timeline_scale.domain([0,24]);
            break;
            case "weeks":
            timeline_scale.domain([0,7]);
            break;
            case "months":
            timeline_scale.domain([1,32]);
            break;
            case "years":
            timeline_scale.domain([1,53]);
            break;
            case "decades":
            var start = Math.floor(data.min_start_date.getUTCFullYear() / 10) * 10;
            var end = Math.ceil(data.max_end_date.getUTCFullYear() / 10) * 10;
            timeline_scale.domain([0,120]);
            break;
            case "centuries":
            timeline_scale.domain([0,100]);
            break;
            case "millenia":
            timeline_scale.domain([0,1000]);
            break;
            case "epochs":
            timeline_scale.domain([data.min_start_date.valueOf(),data.max_end_date.valueOf()]);
            break;
          }
          console.log(tl_scale + " scale updated with domain: " + timeline_scale.domain());

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "scale_update",
            event_detail: tl_scale + " scale updated with domain: " + timeline_scale.domain()
          }
          globals.usage_log.push(log_event);
        }
        else if (tl_representation == "Radial" && tl_scale == "Chronological") {
          //valid scale
          timeline_scale = d3.scale.linear()
          .range([0,2 * Math.PI]);

          switch (globals.segment_granularity) {
            case "days":
            timeline_scale_segments = d3.range(0,25,2);
            timeline_scale.domain([0,24]);
            break;
            case "weeks":
            timeline_scale_segments = d3.range(0,8);
            timeline_scale.domain([0,7]);
            break;
            case "months":
            timeline_scale_segments = d3.range(1,33);
            timeline_scale.domain([1,33]);
            break;
            case "years":
            timeline_scale_segments = d3.range(1,54,2);
            timeline_scale.domain([1,53]);
            break;
            case "decades":
            timeline_scale_segments = d3.range(0,121,12);
            timeline_scale.domain([0,125]);
            break;
            case "centuries":
            timeline_scale_segments = d3.range(0,101,10);
            timeline_scale.domain([0,105]);
            break;
            case "millenia":
            timeline_scale_segments = d3.range(0,1001,100);
            timeline_scale.domain([0,1050]);
            break;
            case "epochs":
            timeline_scale_segments = [data.min_start_date.valueOf()];
            timeline_scale.domain([data.min_start_date.valueOf(),data.max_end_date.valueOf()]);
            break;
          }
          console.log(tl_scale + " scale updated with domain: " + timeline_scale.domain());

          var log_event = {
            event_time: new Date().valueOf(),
            event_category: "scale_update",
            event_detail: tl_scale + " scale updated with domain: " + timeline_scale.domain()
          }
          globals.usage_log.push(log_event);

        }
        break;
      }

      //retrieve the old scales, if this is an update
      old_timeline_scale = this.__chart__ || d3.scale.linear()
      .range([0,Infinity])
      .domain(timeline_scale.range());

      //stash the new scales
      this.__chart__ = timeline_scale;

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Linear Axes
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Linear") {

        timeline_axis.scale(timeline_scale);
        timeline_axis.ticks(10);
        timeline_axis.tickSize(6,0);
        timeline_axis.tickFormat(undefined);
        timeline_axis.tickValues(undefined);

        if (tl_layout != "Segmented" && tl_scale == "Chronological" && globals.date_granularity == "years" && data.min_start_date.getUTCFullYear() < 0){
          timeline_axis.tickFormat(tick_format);
          timeline_axis.tickValues(undefined);
        }
        else if (tl_scale == "Sequential" || tl_scale == "Collapsed"){
          timeline_axis.ticks(10);
          timeline_axis.tickSize(6,0);
          timeline_axis.tickValues(d3.range(0,globals.max_seq_index * 1.5 * unit_width - unit_width,unit_width * 10))
          timeline_axis.tickFormat(function (d) {
            return d / unit_width;
          });
        }
        else if (tl_scale == "Log") {
          timeline_axis.ticks(10, tick_format);
          timeline_axis.tickSize(6,0);
          timeline_axis.tickValues(undefined);
        }
        else if (tl_scale == "Relative" || globals.date_granularity == "epochs") {
          timeline_axis.tickFormat(tick_format);
          timeline_axis.tickValues(undefined);
        }
        else if (tl_layout == "Segmented") {
          if (globals.segment_granularity == "decades") {
              timeline_axis.tickValues(d3.range(0,120,12));
          }
          else {
            timeline_axis.tickValues(undefined);
          }
          timeline_axis.tickFormat(function (d) {
            var converted_tick = d
            switch (globals.segment_granularity) {
              case "days":
              converted_tick = moment().hour(d).format('hA');
              break;
              case "weeks":
              converted_tick = moment().weekday(d).format('ddd');
              break;
              case "months":
              converted_tick = moment().date(d).format('Do');
              break;
              case "years":
              converted_tick = moment().week(d + 1).format('MMM');
              break;
              case "decades":
              converted_tick = (d / 12) + " years";
              break;
              case "centuries":
              converted_tick = d + " years";
              break;
              case "millenia":
              converted_tick = d + " years";
              break;
              case "epochs":
              converted_tick = globals.formatAbbreviation(d) + " years";
              break;
            }
            return converted_tick;
          });
        }
        else {
          timeline_axis.tickValues(undefined);
          timeline_axis.tickFormat(function (d) {
            var converted_tick = d
            switch (globals.segment_granularity) {
              case "days":
              converted_tick = moment(d).format('hA');
              break;
              case "weeks":
              converted_tick = moment(d).format('MMM D');
              break;
              case "months":
              converted_tick = moment(d).format('MMM D');
              break;
              case "years":
              converted_tick = moment(d).format('YYYY');
              break;
              case "decades":
              converted_tick = moment(d).format('YYYY');
              break;
              case "centuries":
              converted_tick = moment(d).format('YYYY');
              break;
              case "millenia":
              converted_tick = moment(d).format('YYYY');
              break;
              case "epochs":
              converted_tick = globals.formatAbbreviation(d);
              break;
            }
            return converted_tick;
          });
        }

        //update the timeline axis for linear timelines
        var timeline_axis_container = timeline_container.selectAll(".timeline_axis")
        .data([null]);

        var timeline_axis_enter = timeline_axis_container.enter()
        .append("g")
        .attr("class","timeline_axis")
        .style("opacity",0);

        var bottom_timeline_axis_enter = timeline_axis_container.enter()
        .append("g")
        .attr("class","timeline_axis")
        .attr("id","bottom_timeline_axis")
        .style("opacity",0);

        var timeline_axis_update = timeline_container.select(".timeline_axis")
        .transition()
        .delay(0)
        .duration(duration)
        .style("opacity",1)
        .call(timeline_axis);

        timeline_axis_update.selectAll("text")
        .attr("y", -12)
        .style("fill", "#666")
        .style("font-weight","normal");

        timeline_axis_update.selectAll(".tick line")
        .delay(function (d, i) {
          return i * duration / timeline_axis_update.selectAll(".tick line")[0].length;
        })
        .attr("y1",-6)
        .attr("y2", 0);

        var bottom_timeline_axis_update = timeline_container.select("#bottom_timeline_axis")
        .transition()
        .delay(0)
        .duration(duration)
        .style("opacity",1)
        .call(timeline_axis);

        bottom_timeline_axis_update.selectAll("text")
        .delay(function (d, i) {
          return i * duration / bottom_timeline_axis_update.selectAll(".tick line")[0].length;
        })
        .attr("y", height + 18);

        bottom_timeline_axis_update.select(".domain")
        .attr("transform", function () {
          return "translate(0," + height + ")";
        });

        bottom_timeline_axis_update.selectAll(".tick line")
        .delay(function (d, i) {
          return i * duration / bottom_timeline_axis_update.selectAll(".tick line")[0].length;
        })
        .attr("y1", 0)
        .attr("y2", height + 6);

        console.log("Linear axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Linear axis updated"
        }
        globals.usage_log.push(log_event);
      }
      else if (prev_tl_representation == "Linear" && tl_representation != "Linear")  { //remove axes for non-linear timelines

        var timeline_axis_hide = timeline_container.select(".timeline_axis")
        .transition()
        .duration(duration);

        timeline_axis_hide.selectAll(".tick line")
        .attr("y1", -6)
        .attr("y2", -6);

        var bottom_timeline_axis_hide = timeline_container.select("#bottom_timeline_axis")
        .transition()
        .duration(duration);

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
        .transition()
        .delay(duration)
        .duration(duration)
        .style("opacity",0);
      }

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Collapsed Axis
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Linear" && tl_scale == "Collapsed" && tl_layout == "Unified") {
        interim_duration_axis.ticks(2);
        interim_duration_axis.scale(interim_duration_scale);

        interim_duration_axis.tickFormat(function (d) {
          var converted_tick = d;
          if (globals.date_granularity == "epochs") {
            return format(d.valueOf());
          }
          else if (time.year.count(data.min_start_date,data.max_end_date) > 5) {
            converted_tick = Math.round(d / 31536000730) + " years";
          }
          else if (time.day.count(data.min_start_date,data.max_end_date) > 31) {
            converted_tick = Math.round(d / 2628000000) + " months";
          }
          else {
            converted_tick = Math.round(d / 86400000) + " days";
          }
          return converted_tick;
        });

        //update the Collapsed axis for linear-interim_duration timeline
        var interim_duration_axis_container = timeline_container.selectAll(".interim_duration_axis")
        .data([null]);

        var interim_duration_axis_enter = interim_duration_axis_container.enter()
        .append("g")
        .attr("class","interim_duration_axis")
        .attr("transform", "translate(" + globals.max_seq_index * 1.5 * unit_width + "," + (height - unit_width * 4) + ")")
        .style("opacity",0);

        var interim_duration_axis_update = timeline_container.selectAll(".interim_duration_axis")
        .transition()
        .delay(0)
        .duration(duration)
        .attr("transform", "translate(" + globals.max_seq_index * 1.5 * unit_width + "," + (height - unit_width * 4) + ")")
        .style("opacity",1)
        .call(interim_duration_axis);

        console.log("Collapsed axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Collapsed axis updated"
        }
        globals.usage_log.push(log_event);
      }
      else if (prev_tl_scale == "Collapsed" && tl_scale != "Collapsed") { //remove Collapsed axis for non-interim_duration-scale timelines
        timeline_container.selectAll(".interim_duration_axis")
        .transition()
        .duration(duration)
        .style("opacity",0);
      }

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Radial Axes
      ---------------------------------------------------------------------------------------
      Unified Radial Axis
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Radial" && tl_layout == "Unified"){

        if (radial_axis_quantiles != timeline_scale_segments){
          radial_axis_quantiles = timeline_scale_segments;
        }

        radial_axis.duration(duration);

        radial_axis.final_quantile(timeline_scale_segments[timeline_scale_segments.length - 1]);

        if (tl_scale == "Chronological") {
          radial_axis.radial_axis_units("Chronological");
          if (globals.segment_granularity == "epochs") {
            radial_axis.track_bounds(1);
          }
          else {
            radial_axis.track_bounds(globals.num_tracks + 1);
          }
        }
        else if (tl_scale == "Sequential") {
          radial_axis.radial_axis_units("Sequential");
          radial_axis.track_bounds(1);
        }

        //update the radial axis for radial timelines
        var radial_axis_container = timeline_container.selectAll(".radial_axis_container")
        .data([radial_axis_quantiles]);

        var radial_axis_enter = radial_axis_container.enter()
        .append("g")
        .attr("class", "radial_axis_container")
        .each(function() {
          var firstChild = selectWithParent('.timeline_axis').node();
          if (firstChild) {
            this.parentNode.insertBefore(this, firstChild);
          }
        })
        .style("opacity",0);

        var radial_axis_update = timeline_container.selectAll(".radial_axis_container")
        .transition()
        .duration(duration)
        .style("opacity",1)
        .call(radial_axis.radial_axis_scale(timeline_scale).x_pos(width / 2).y_pos(height / 2));

        console.log("Unified Radial axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Unified Radial axis updated"
        }
        globals.usage_log.push(log_event);
      }
      else if (prev_tl_representation == "Radial" && prev_tl_layout == "Unified" && (tl_representation != "Radial" || tl_layout != "Unified")) {

        timeline_container.selectAll(".radial_axis_container")
        .transition()
        .duration(duration * 3)
        .style('opacity',0);

        timeline_container.selectAll(".radial_axis_container")
        .transition()
        .delay(duration * 3)
        .remove();
      }

      /**
      ---------------------------------------------------------------------------------------
      Faceted Radial Axes
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Radial" && tl_layout == "Faceted"){

        radial_axis.duration(duration);

        if (tl_scale == "Relative") {
          radial_axis_quantiles = [];
          radial_axis.radial_axis_units("Relative");
          if (globals.segment_granularity == "days") {
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.125)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.25)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.375)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.5)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.625)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.75)) * 3600000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.875)) * 3600000);
            radial_axis.final_quantile(Math.round(d3.quantile(timeline_scale_segments,1)) * 3600000);
          }
          else {
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0)) * 86400000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.2)) * 86400000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.4)) * 86400000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.6)) * 86400000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,0.8)) * 86400000);
            radial_axis_quantiles.push(Math.round(d3.quantile(timeline_scale_segments,1)) * 86400000);
            radial_axis.final_quantile(Math.round(d3.quantile(timeline_scale_segments,1)) * 86400000);
          }
          radial_axis.track_bounds(globals.max_num_tracks + 1);
        }
        else {
          if (radial_axis_quantiles != timeline_scale_segments){
            radial_axis_quantiles = timeline_scale_segments;
          }
          radial_axis.final_quantile(timeline_scale_segments[timeline_scale_segments.length - 1]);

          if (tl_scale == "Chronological") {
            radial_axis.radial_axis_units("Chronological");
            if (globals.segment_granularity == "epochs") {
              radial_axis.track_bounds(1);
            }
            else {
              radial_axis.track_bounds(globals.max_num_tracks + 1);
            }
          }
          else if (tl_scale == "Sequential") {
            radial_axis.radial_axis_units("Sequential");
            radial_axis.track_bounds(1);
          }
        }

        //update the radial axis for faceted radial timelines
        var faceted_radial_axis = timeline_facet.selectAll(".faceted_radial_axis")
        .data([radial_axis_quantiles]);

        var faceted_radial_axis_enter = faceted_radial_axis.enter()
        .append("g")
        .attr("class", "faceted_radial_axis")
        .style("opacity",0);

        facet_number = 0;

        var faceted_radial_axis_update = timeline_facet.selectAll(".faceted_radial_axis")
        .transition()
        .duration(duration)
        .style("opacity",1)
        .attr("transform", function (){
          var offset_x,
          offset_y;

          if (tl_layout != "Faceted") {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          else if (tl_representation == "Linear") {
            offset_x = width / 2;
            offset_y = facet_number * (height / globals.num_facets);
            facet_number++;
          }
          else if (tl_representation == "Radial" || (tl_representation == "Spiral" && tl_scale == "Sequential")) {
            var facet_dim_x = width / globals.num_facet_cols;
            var facet_dim_y = height / globals.num_facet_rows;

            offset_x = facet_number % globals.num_facet_cols * facet_dim_x;
            offset_y = Math.floor(facet_number / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + globals.buffer;

            facet_number++;
          }
          else {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          return "translate(" + offset_x + "," + offset_y + ")";
        })
        .call(radial_axis.radial_axis_scale(timeline_scale).x_pos(width / globals.num_facet_cols / 2).y_pos(height / globals.num_facet_rows / 2));

        console.log("Faceted Radial axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Faceted Radial axis updated"
        }
        globals.usage_log.push(log_event);
      }
      else if (prev_tl_representation == "Radial" && prev_tl_layout == "Faceted" && (tl_representation != "Radial" || tl_layout != "Faceted")) {

        timeline_container.selectAll(".faceted_radial_axis")
        .transition()
        .duration(duration * 3)
        .style('opacity',0);

        timeline_container.selectAll(".faceted_radial_axis")
        .transition()
        .delay(duration * 3)
        .remove();
      }

      /**
      ---------------------------------------------------------------------------------------
      Segmented Radial Axis
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Radial" && tl_layout == "Segmented"){

        radial_axis.duration(duration);

        radial_axis.radial_axis_units("Segments");
        if (radial_axis_quantiles != timeline_scale_segments){
          radial_axis_quantiles = timeline_scale_segments;
        }
        radial_axis.final_quantile(timeline_scale_segments[timeline_scale_segments.length - 1]);

        //get radial_axis_quantiles of timeline_scale_segments for radial axis ticks
        if (globals.segment_granularity == "epochs") {
          radial_axis.track_bounds(1);
        }
        else {
          radial_axis.track_bounds(globals.num_tracks + 1);
        }

        //update the radial axis for segmented radial timelines
        var segmented_radial_axis = timeline_segment.selectAll(".segmented_radial_axis")
        .data([radial_axis_quantiles]);

        segment_number = 0;

        var segmented_radial_axis_enter = segmented_radial_axis.enter()
        .append("g")
        .attr("class", "segmented_radial_axis")
        .style("opacity",0);

        var segmented_radial_axis_update = timeline_segment.selectAll(".segmented_radial_axis")
        .transition()
        .duration(0)
        .style("opacity",1)
        .attr("transform", function (){
          var offset_x,
          offset_y;

          if (tl_layout != "Segmented" || tl_representation == "Calendar" || tl_representation == "Grid") {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          else if (tl_representation == "Linear") {
            offset_x = width / 2;
            offset_y = segment_number * (height / globals.num_segments);
            segment_number++;
          }
          else if (tl_representation == "Radial") {
            var segment_dim_x = width / globals.num_segment_cols;
            var segment_dim_y = height / globals.num_segment_rows;

            offset_x = segment_number % globals.num_segment_cols * segment_dim_x;
            offset_y = Math.floor(segment_number / globals.num_segment_cols) * segment_dim_y + globals.buffer;

            segment_number++;
          }
          else {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          return "translate(" + offset_x + "," + offset_y + ")";
        })
        .call(radial_axis.radial_axis_scale(timeline_scale).x_pos(width / globals.num_segment_cols / 2).y_pos(height / globals.num_segment_rows / 2));

        console.log("Segmented Radial axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Segmented Radial axis updated"
        }
        globals.usage_log.push(log_event);

      }
      else if (prev_tl_representation == "Radial" && prev_tl_layout == "Segmented" && (tl_representation != "Radial" || tl_layout != "Segmented")) {

        timeline_container.selectAll(".segmented_radial_axis")
        .transition()
        .duration(duration * 3)
        .style('opacity',0);

        timeline_container.selectAll(".segmented_radial_axis")
        .transition()
        .delay(duration * 3)
        .remove();
      }

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Calendar Axis
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Calendar") {

        //determine the range, round to whole years
        var range_floor = data.min_start_date.getUTCFullYear(),
        range_ceil = data.max_end_date.getUTCFullYear();

        var calendar_axis_container = timeline_container.selectAll(".calendar_axis")
        .data([d3.range(range_floor,range_ceil + 1)]);

        var calendar_axis_enter = calendar_axis_container.enter()
        .append("g")
        .attr("class","calendar_axis")
        .style("opacity",0);

        var calendar_axis_update = timeline_container.selectAll(".calendar_axis")
        .transition()
        .delay(0)
        .duration(duration)
        .style("opacity",1)
        .call(calendar_axis);

        console.log("Calendar axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Calendar axis updated"
        }
        globals.usage_log.push(log_event);
      }
      else if (prev_tl_representation == "Calendar" && tl_representation != "Calendar") {

        timeline_container.selectAll(".calendar_axis")
        .transition()
        .duration(duration * 3)
        .style('opacity',0);

        timeline_container.selectAll(".calendar_axis")
        .transition()
        .delay(duration * 3)
        .remove();
      }

      /**
      ---------------------------------------------------------------------------------------
      AXES
      Grid Axis
      ---------------------------------------------------------------------------------------
      **/

      if (tl_representation == "Grid") {

        //determine the range, round to whole centuries
        var grid_min = Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100,
        grid_max = Math.ceil((data.max_end_date.getUTCFullYear() + 1) / 100) * 100;

        grid_axis.min_year(grid_min).max_year(grid_max);

        var grid_axis_container = timeline_container.selectAll(".grid_axis")
        .data([d3.range(grid_min,grid_max)]);

        console.log("Grid axis domain: " + grid_min + " - " + grid_max)

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Grid axis domain: " + grid_min + " - " + grid_max
        }
        globals.usage_log.push(log_event);

        var grid_axis_enter = grid_axis_container.enter()
        .append("g")
        .attr("class","grid_axis")
        .style("opacity",0);

        var grid_axis_update = timeline_container.selectAll(".grid_axis")
        .transition()
        .delay(0)
        .duration(duration)
        .style("opacity",1)
        .call(grid_axis.min_year(grid_min).max_year(grid_max));

        console.log("Grid axis updated");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "axis_update",
          event_detail: "Grid axis updated"
        }
        globals.usage_log.push(log_event);
      }
      else if (prev_tl_representation == "Grid" && tl_representation != "Grid") {

        timeline_container.selectAll(".grid_axis")
        .transition()
        .duration(duration * 3)
        .style('opacity',0);

        timeline_container.selectAll(".grid_axis")
        .transition()
        .delay(duration * 3)
        .remove();
      }

      /**
      ---------------------------------------------------------------------------------------
      EVENTS
      ---------------------------------------------------------------------------------------
      **/

      //add event containers
      var timeline_event_g = timeline_container.selectAll(".timeline_event_g")
      .data(data);

      var timeline_event_g_exit = timeline_event_g.exit().transition()
      .duration(duration)
      .remove();

      /**
      ---------------------------------------------------------------------------------------
      EVENT ENTER
      ---------------------------------------------------------------------------------------
      **/

      //define each event and its behaviour
      var timeline_event_g_enter = timeline_event_g.enter()
      .append("g")
      .attr("class","timeline_event_g")
      .attr("id", function (d) {
        return "event_g" + d.event_id;
      });

      //define event behaviour
      timeline_event_g_enter.on("click", function (d, i){

        console.log("event " + d.event_id + " clicked");

        var log_event = {
          event_time: new Date().valueOf(),
          event_category: "event_click",
          event_detail: "event " + d.event_id + " clicked"
        }
        globals.usage_log.push(log_event);

        if (!d.selected || d.selected == undefined) {
          var x_pos = d3.event.x,
          y_pos = d3.event.y;
          d.selected = true;

          d3.select(this)
          .selectAll(".event_span")
          .attr("filter", "url(#drop-shadow)")
          .style("stroke","#f00")
          .style("stroke-width","1.25px");
          d3.select(this)
          .selectAll(".event_span_component")
          .style("stroke","#f00")
          .style("stroke-width","1px");

          //annotate the event with its label if shift is not clicked
          if (!d3.event.shiftKey) {

            var x_pos = d3.event.x,
            y_pos = d3.event.y;

            var item_x_pos = 0;
            var item_y_pos = 0;

            if (tl_representation != "Radial") {
              item_x_pos = d.rect_x_pos + d.rect_offset_x + globals.padding.left + unit_width * 0.5;
              item_y_pos = d.rect_y_pos + d.rect_offset_y + globals.padding.top + unit_width * 0.5;
            }
            else {
                item_x_pos = d.path_x_pos + d.path_offset_x + globals.padding.left;
                item_y_pos = d.path_y_pos + d.path_offset_y + globals.padding.top;
            }

            var annotation = {
              id: "event" + d.event_id + "_" + d.annotation_count,
              item_index: d.event_id,
              count: d.annotation_count,
              content_text: d.content_text,
              x_pos: item_x_pos,
              y_pos: item_y_pos,
              x_offset: (x_pos - item_x_pos),
              y_offset: (y_pos - item_y_pos),
              x_anno_offset: 50,
              y_anno_offset: 50,
              label_width: d3.min([d.content_text.length * 10,100])
            }

            globals.annotation_list.push(annotation);

            console.log("event " + d.event_id + " annotation: <<" + d.content_text + ">>");

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "annotation",
              event_detail: "event " + d.event_id + " annotation: <<" + d.content_text + ">>"
            }
            globals.usage_log.push(log_event);

            selectWithParent('#event' + d.event_id + "_-1").remove();

            annotateEvent(configurableTL,d.content_text,item_x_pos,item_y_pos,(x_pos - item_x_pos),(y_pos - item_y_pos),50,50,d3.min([d.content_text.length * 10,100]),d.event_id,d.annotation_count);

            selectWithParent('#event' + d.event_id + "_" + d.annotation_count).transition().duration(50).style('opacity',1);

            d.annotation_count++;
          }
          else {
            console.log("event " + d.event_id + " annotation supressed (shift key)");

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "annotation",
              event_detail: "event " + d.event_id + " annotation supressed (shift key)"
            }
            globals.usage_log.push(log_event);
          }
        }
        else {

          if (!d3.event.shiftKey) {
            d.selected = false;
            d3.select(this)
            .selectAll(".event_span")
            .attr("filter", "none")
            .style("stroke","#fff")
            .style("stroke-width","0.25px");
            d3.select(this)
            .selectAll(".event_span_component")
            .style("stroke","#fff")
            .style("stroke-width","0.25px");

            console.log("event " + d.event_id + " annotation removed");

            var log_event = {
              event_time: new Date().valueOf(),
              event_category: "annotation",
              event_detail: "event " + d.event_id + " annotation removed"
            }
            globals.usage_log.push(log_event);

            //remove annotations for the event
            for(var i = 0; i <= d.annotation_count; i++) {
              selectWithParent("#event" + d.event_id + "_" + i).remove();
            }
          }
        }
      })
      .on("mouseover", function (d) {
        d3.select(this)
        .selectAll(".event_span")
        .attr("filter", "url(#drop-shadow)")
        .style("stroke","#f00")
        .style("stroke-width","1.25px")
        .style('cursor','url("' + imageUrls("pin.png") + '"),auto');
        d3.select(this)
        .selectAll(".event_span_component")
        .style("stroke","#f00")
        .style("stroke-width","0.5px")
        .style('cursor','url("' + imageUrls("pin.png") + '"),auto');

        if ((selectWithParent("#event" + d.event_id + "_" + (d.annotation_count - 1) + ".event_annotation")[0][0] == null) && (selectWithParent("#event" + d.event_id + "_0.event_annotation")[0][0] == null)) {

          var x_pos = d3.event.x,
          y_pos = d3.event.y;

          var item_x_pos = 0;
          var item_y_pos = 0;

          if (tl_representation != "Radial") {
            item_x_pos = d.rect_x_pos + d.rect_offset_x + globals.padding.left + unit_width * 0.5;
            item_y_pos = d.rect_y_pos + d.rect_offset_y + globals.padding.top + unit_width * 0.5;
          }
          else {
            item_x_pos = d.path_x_pos + d.path_offset_x + globals.padding.left;
            item_y_pos = d.path_y_pos + d.path_offset_y + globals.padding.top;
          }

          annotateEvent(configurableTL,d.content_text,item_x_pos,item_y_pos,(x_pos - item_x_pos),(y_pos - item_y_pos),50,50,d3.min([d.content_text.length * 10,100]),d.event_id,-1);

          selectWithParent('#event' + d.event_id + "_-1 rect.annotation_frame").style('stroke','#f00');

          selectWithParent('#event' + d.event_id + "_-1").transition().duration(250).style('opacity',1);
        }

      })
      .on("mouseout", function (d) {

        selectWithParent('#event' + d.event_id + "_-1").transition().duration(100).style('opacity',0);

        selectWithParent('#event' + d.event_id + "_-1").transition().delay(100).remove();

        d3.select(this)
        .selectAll(".event_span")
        .attr("filter", "none")
        .style("stroke","#fff")
        .style("stroke-width","0.25px");
        d3.select(this)
        .selectAll(".event_span_component")
        .style("stroke","#fff")
        .style("stroke-width","0.25px");
        if (d.selected) {
          d3.select(this)
          .selectAll(".event_span")
          .attr("filter", "url(#drop-shadow)")
          .style("stroke","#f00")
          .style("stroke-width","1.25px");
          d3.select(this)
          .selectAll(".event_span_component")
          .style("stroke","#f00")
          .style("stroke-width","1px");
        }
      })

      //add rect events for linear timelines
      timeline_event_g_enter.append("rect")
      .attr("class", "event_span")
      .attr("height", unit_width)
      .attr("width", unit_width)
      .attr("y", height / 2)
      .attr("x", width / 2)
      .style("stroke", "#fff")
      .style("opacity", 0)
      .style("fill", function (d) {
        if (d.category == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d.category);
        }
      });

      //draw elapsed time as bar below the sequence, offset between events
      timeline_event_g_enter.append("rect")
      .attr("class", "time_elapsed")
      .attr("height", 0)
      .attr("width", unit_width * 1.5)
      .attr("y", height / 2)
      .attr("x", width / 2)
      .append("title")
      .style("opacity", 0)
      .text("");

      //add arc path events for radial timelines
      timeline_event_g_enter.append("path")
      .attr("class", "event_span")
      .style("stroke", "#fff")
      .style("opacity", 0)
      .style("fill", function (d) {
        if (d.category == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d.category);
        }
      });

      /**
      ---------------------------------------------------------------------------------------
      EVENT UPDATE (TRANSITIONS)
      ---------------------------------------------------------------------------------------
      **/

      var timeline_event_g_early_update = timeline_event_g.transition()
      .delay(0)
      .duration(duration)
      .call(transitionLog);

      var timeline_event_g_update = timeline_event_g.transition()
      .delay(function (d, i) {
        return duration + (data.length - i) / data.length * duration;
      })
      .duration(duration)
      .call(transitionLog);

      var timeline_event_g_delayed_update = timeline_event_g.transition()
      .delay(function (d, i) {
        return duration * 2 + (data.length - i) / data.length * duration;
      })
      .duration(duration)
      .call(transitionLog);

      var timeline_event_g_final_update = timeline_event_g.transition()
      .delay(function (d, i) {
        return duration * 3 + (data.length - i) / data.length * duration;
      })
      .duration(duration)
      .call(transitionLog);

      timeline_event_g_update.attr("id", function (d) {
        return "event_g" + d.event_id;
      })

      /**
      ---------------------------------------------------------------------------------------
      update rect elements for non-radial representations
      ---------------------------------------------------------------------------------------
      **/

      timeline_event_g_early_update.select("rect.event_span")
      .style("opacity", function(d){
        if ((tl_layout == "Segmented" && prev_tl_layout == "Segmented") || (tl_representation == "Radial" && prev_tl_representation == "Radial")) {
          return 0;
        }
        else if (globals.prev_active_event_list.indexOf(d.event_id) == -1 || globals.active_event_list.indexOf(d.event_id) == -1) {
          if (globals.filter_type == "Hide") {
            return 0;
          }
          else if (globals.filter_type == "Emphasize") {
            if (globals.active_event_list.indexOf(d.event_id) == -1) {
              return 0.1;
            }
            else {
              return 1;
            }
          }
        }
        else if (globals.active_event_list.indexOf(d.event_id) != -1 && d.selected) {
          return 1;
        }
        else if (globals.active_event_list.indexOf(d.event_id) != -1) {
          if (tl_scale != prev_tl_scale || tl_layout != prev_tl_layout || tl_representation != prev_tl_representation) {
            return 0.5
          }
          else {
            return 1;
          }
        }
        else {
          return 0.1;
        }
      })
      .style("pointer-events", function(d){
        return "none";
      })
      .style("fill", function (d) {
        if (d.category == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d.category);
        }
      });

      timeline_event_g_update.select("rect.event_span")
      .attr("transform", function (d) {
        var offset_y = 0,
        offset_x = 0;
        if (tl_representation == "Linear") {
          switch (tl_layout) {

            case "Unified":
            offset_y = 0;
            break;

            case "Faceted":
            offset_y = (height / globals.num_facets) * globals.facets.domain().indexOf(d.facet);
            break;

            case "Segmented":
            var span_segment = 0;
            switch (globals.segment_granularity) {
              case "days":
              span_segment = time.day.count(time.day.floor(data.min_start_date),d.start_date);
              break;
              case "weeks":
              span_segment = time.week.count(time.week.floor(data.min_start_date),d.start_date);
              break;
              case "months":
              span_segment = time.month.count(time.month.floor(data.min_start_date),d.start_date);
              break;
              case "years":
              span_segment = d.start_date.getUTCFullYear() - data.min_start_date.getUTCFullYear();
              break;
              case "decades":
              span_segment = Math.floor(d.start_date.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10);
              break;
              case "centuries":
              span_segment = Math.floor(d.start_date.getUTCFullYear() / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100);
              break;
              case "millenia":
              span_segment = Math.floor(d.start_date.getUTCFullYear() / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000);
              break;
              case "epochs":
              span_segment = 0;
              break;
            }
            offset_y = (height / globals.num_segments) * span_segment;
            break;

            default:
            offset_y = 0;
            break;
          }
        }
        else if (tl_representation == "Spiral" || tl_representation == "Radial") {
          var facet_dim_x = width / globals.num_facet_cols;
          var facet_dim_y = height / globals.num_facet_rows;
          if (tl_layout == "Unified") {
            offset_x = width / 2;
            offset_y = height / 2;
          }
          else if (tl_layout == "Faceted") {
            offset_x = globals.facets.domain().indexOf(d.facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
            if (tl_representation == "Radial")
            offset_y = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2 + globals.buffer;
            else if (tl_representation == "Spiral")
            offset_y = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols) * globals.spiral_dim + (globals.spiral_dim / 2);
          }
        }
        else if (tl_representation == "Curve") {
          offset_x = d.curve_x;
          offset_y = d.curve_y;
        }
        else {
          offset_x = 0;
          offset_y = 0;
        }
        d.rect_offset_x = offset_x;
        d.rect_offset_y = offset_y;
        return "translate(" + offset_x + "," + offset_y + ")";
      });

      //update rects for linear timelines
      timeline_event_g_update.select("rect.event_span")
      .attr("height", function (d) {
        var rect_height = unit_width;
        if (tl_layout == "Segmented") {
          rect_height = unit_width;
        }
        else if (tl_representation == "Linear") {
          rect_height = unit_width;
        }
        else if ((tl_representation == "Spiral" || tl_representation == "Curve") && tl_scale == "Sequential") {
          rect_height = unit_width;
        }
        else if (tl_representation == "Radial" && prev_tl_representation != "Radial") {
          rect_height = unit_width;
        }
        return rect_height;
      })
      .attr("width", function (d) {
        var rect_width = unit_width;
        if (tl_layout == "Segmented") {
          rect_width = unit_width;
        }
        else if (tl_representation == "Linear") {
          switch (tl_scale) {
            case "Chronological":
            if (d.start_date == d.end_date) {
              rect_width = unit_width;
            }
            else {
              rect_width = d3.max([timeline_scale(d.end_date) - timeline_scale(d.start_date),unit_width]);
            }
            break;

            case "Relative":
            if (d.start_age == d.end_age) {
              rect_width = unit_width;
            }
            else {
              rect_width = d3.max([timeline_scale(d.end_age) - timeline_scale(d.start_age),unit_width]);
            }
            break;

            default:
            rect_width = unit_width;
            break;
          }
        }
        else if ((tl_representation == "Spiral" || tl_representation == "Curve") && tl_scale == "Sequential") {
          rect_width = unit_width
        }
        else if (tl_representation == "Radial" && prev_tl_representation != "Radial") {
          rect_width = unit_width;
        }
        return rect_width;
      })
      .attr("x", function (d) {
        var rect_x = 0;
        if (tl_representation == "Linear") {
          if (tl_layout == "Segmented") {
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
              if (moment(time.utcWeek.floor(d.start_date)).week() == 53) {
                rect_x = timeline_scale(1);
              }
              else {
                rect_x = timeline_scale(moment(time.utcWeek.floor(d.start_date)).week());
              }
              break;
              case "decades":
              rect_x = timeline_scale(moment(time.month.floor(d.start_date)).month() + (time.month.floor(d.start_date).getUTCFullYear() - Math.floor(time.month.floor(d.start_date).getUTCFullYear() / 10) * 10) * 12);
              break;
              case "centuries":
              if (d.start_date.getUTCFullYear() < 0){
                rect_x = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100);
              }
              else {
                rect_x = timeline_scale(d.start_date.getUTCFullYear() % 100);
              }
              break;
              case "millenia":
              if (d.start_date.getUTCFullYear() < 0){
                rect_x = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000);
              }
              else {
                rect_x = timeline_scale(d.start_date.getUTCFullYear() % 1000);
              }
              break;
              case "epochs":
              rect_x = timeline_scale(d.start_date);
              break;
            }
          }
          else {
            switch (tl_scale) {

              case "Chronological":
              rect_x = timeline_scale(d.start_date);
              break;

              case "Relative":
              rect_x = d3.max([0,timeline_scale(d.start_age)]);
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
            }
          }
        }
        else if (tl_representation == "Radial") {
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
        }
        else if (tl_representation == "Spiral" && tl_scale == "Sequential") {
          rect_x = d.spiral_x;
        }
        else {
          rect_x = 0;
        }
        d.rect_x_pos = rect_x;
        return rect_x;
      })
      .attr("y", function (d) {
        var rect_y = 0;
        if (tl_representation == "Linear") {
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
              rect_y = (height / globals.num_facets) - (globals.track_height  * d.track + globals.track_height);
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

          }
        }
        else if (tl_representation == "Radial") {
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
        }
        else if (tl_representation == "Spiral" && tl_scale == "Sequential") {
          rect_y = d.spiral_y + globals.buffer;
        }
        else {
          rect_y = 0;
        }
        d.rect_y_pos = rect_y;
        return rect_y;
      });

      timeline_event_g_delayed_update.select("rect.event_span")
      .style("opacity", function(d){
        if (tl_layout != "Segmented" && tl_representation != "Radial" && globals.active_event_list.indexOf(d.event_id) != -1) {
          return 1;
        }
        else {
          if (tl_layout == "Segmented" || tl_representation == "Radial" || globals.filter_type == "Hide") {
            return 0;
          }
          else {
            return 0.1;
          }
        }
      })
      .style("pointer-events", function(d){
        if (tl_layout != "Segmented" && tl_representation != "Radial" && globals.active_event_list.indexOf(d.event_id) != -1) {
          return "inherit";
        }
        else {
          return "none";
        }
      });

      /**
      ---------------------------------------------------------------------------------------
      update bar (rect) elements for interim_duration scale
      ---------------------------------------------------------------------------------------
      **/

      //draw elapsed time as bar below the sequence, offset between events
      timeline_event_g_early_update.select(".time_elapsed")
      .attr("height", 0)
      .style("opacity", 0);

      timeline_event_g_update.select(".time_elapsed")
      .attr("x", function (d) {
        if (tl_scale == "Chronological") {
          return d3.max([0,timeline_scale(d.start_date) * unit_width - unit_width]);
        }
        if (tl_scale == "Log") {
          return 0;
        }
        else if (tl_scale == "Relative") {
          return 0;
        }
        else {
          return timeline_scale(d.seq_index) * unit_width - 0.5 * unit_width;
        }
      })
      .attr("y", function (d) {
        if (globals.date_granularity == "epochs" && d.time_elapsed == 0) {
          return height;
        }
        else {
          return height - (unit_width * 4);
        }
      })
      .text(function (d){
        return d.time_elapsed_label;
      });

      timeline_event_g_delayed_update.select("rect.time_elapsed")
      .attr("height", function (d) {
        if (tl_scale != "Collapsed" || d.time_elapsed == 0) {
          return 0;
        }
        else {
          return interim_duration_scale(d.time_elapsed);
        }
      })
      .style("opacity", function(d){
        if (globals.active_event_list.indexOf(d.event_id) != -1) {
          return 1;
        }
        else {
          if (globals.filter_type == "Hide") {
            return 0;
          }
          else {
            return 0.1;
          }
        }
      })
      .style("pointer-events", function(d){
        if (globals.active_event_list.indexOf(d.event_id) != -1) {
          return "inherit";
        }
        else {
          return "none";
        }
      });

      /**
      ---------------------------------------------------------------------------------------
      update path elements for radial representations
      ---------------------------------------------------------------------------------------
      **/

      timeline_event_g_early_update.select("path.event_span")
      .style("opacity", function(d){
        if ((tl_layout == "Segmented" && prev_tl_layout == "Segmented") || (tl_representation != "Radial" && prev_tl_representation != "Radial")) {
          return 0;
        }
        else if (globals.prev_active_event_list.indexOf(d.event_id) == -1 || globals.active_event_list.indexOf(d.event_id) == -1) {
          if (globals.filter_type == "Hide") {
            return 0;
          }
          else if (globals.filter_type == "Emphasize") {
            if (globals.active_event_list.indexOf(d.event_id) == -1) {
              return 0.1;
            }
            else {
              return 1;
            }
          }
        }
        else if (globals.active_event_list.indexOf(d.event_id) != -1 && d.selected) {
          return 1;
        }
        else if (globals.active_event_list.indexOf(d.event_id) != -1) {
          if (tl_scale != prev_tl_scale || tl_layout != prev_tl_layout || tl_representation != prev_tl_representation) {
            return 0.5
          }
          else {
            return 1;
          }
        }
        else {
          return 0.1;
        }
      })
      .style("pointer-events", function(d){
        return "none";
      })
      .style("fill", function (d) {
        if (d.category == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d.category);
        }
      });

      timeline_event_g_update.select("path.event_span")
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
          var span_segment = 0;
          switch (globals.segment_granularity) {
            case "days":
            span_segment = time.day.count(time.day.floor(data.min_start_date),d.start_date);
            break;
            case "weeks":
            span_segment = time.week.count(time.week.floor(data.min_start_date),d.start_date);
            break;
            case "months":
            span_segment = time.month.count(time.month.floor(data.min_start_date),d.start_date);
            break;
            case "years":
            span_segment = d.start_date.getUTCFullYear() - data.min_start_date.getUTCFullYear();
            break;
            case "decades":
            span_segment = Math.floor(d.start_date.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10);
            break;
            case "centuries":
            span_segment = Math.floor(d.start_date.getUTCFullYear() / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100);
            break;
            case "millenia":
            span_segment = Math.floor(d.start_date.getUTCFullYear() / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000);
            break;
            case "epochs":
            span_segment = 0;
            break;
          }
          var segment_dim_x = width / globals.num_segment_cols;
          var segment_dim_y = height / globals.num_segment_rows;
          offset_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
          offset_y = Math.floor(span_segment / globals.num_segment_cols) * segment_dim_y + segment_dim_y / 2 + globals.buffer;
          break;
        }
        d.path_offset_x = offset_x;
        d.path_offset_y = offset_y;

        if (tl_representation == "Radial") {
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
          }
        }

        return "translate(" + offset_x + "," + offset_y + ")";
      });

      if (tl_representation == "Radial") {

        timeline_event_g_delayed_update.select("path.event_span")
        .attr("d", d3.svg.arc()
        .innerRadius(function (d){
          var inner_radius = globals.centre_radius;
          switch (tl_scale) {

            case "Chronological":
            inner_radius = d3.max([globals.centre_radius,globals.centre_radius + d.track * globals.track_height]);
            break;

            case "Relative":
            inner_radius = d3.max([globals.centre_radius,globals.centre_radius + d.track * globals.track_height]);
            break;

            case "Sequential":
            inner_radius = d3.max([globals.centre_radius,globals.centre_radius + d.seq_track * globals.track_height]);
            break;
          }
          return inner_radius;
        })
        .outerRadius(function (d) {
          var outer_radius = globals.centre_radius + unit_width;
          switch (tl_scale) {

            case "Chronological":
            outer_radius = d3.max([globals.centre_radius + unit_width,globals.centre_radius + d.track * globals.track_height + unit_width]);
            break;

            case "Relative":
            outer_radius = d3.max([globals.centre_radius + unit_width,globals.centre_radius + d.track * globals.track_height + unit_width]);
            break;

            case "Sequential":
            outer_radius = d3.max([globals.centre_radius + unit_width,globals.centre_radius + d.seq_track * globals.track_height + unit_width]);
            break;

          }
          return outer_radius;
        })
        .startAngle(function (d) {
          var start_angle = 0;
          if (tl_layout != "Segmented") {
            switch (tl_scale) {

              case "Chronological":
              start_angle = timeline_scale(d.start_date);
              break;

              case "Relative":
              if (tl_layout == "Faceted") {
                start_angle =  timeline_scale(d.start_age);
              }
              break;

              case "Sequential":
              start_angle = timeline_scale(d.seq_index);
              break;
            }
          }
          else if (tl_layout == "Segmented") {
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
              if (moment(time.utcWeek.floor(d.start_date)).isoWeek() == 53) {
                start_angle =  timeline_scale(1);
              }
              else {
                start_angle = timeline_scale(moment(time.utcWeek.floor(d.start_date)).isoWeek());
              }
              break;
              case "decades":
              start_angle =  timeline_scale(moment(time.month.floor(d.start_date)).month() + (time.month.floor(d.start_date).getUTCFullYear() - Math.floor(time.month.floor(d.start_date).getUTCFullYear() / 10) * 10) * 12);
              break;
              case "centuries":
              if (d.start_date.getUTCFullYear() < 0) {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100);
              }
              else {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 100);
              }
              break;
              case "millenia":
              if (d.start_date.getUTCFullYear() < 0) {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000);
              }
              else {
                start_angle = timeline_scale(d.start_date.getUTCFullYear() % 1000);
              }
              break;
              case "epochs":
              start_angle = timeline_scale(d.start_date);
              break;
            }
          }
          return start_angle;
        })
        .endAngle(function (d) {
          var end_angle = 0;
          var unit_arc = Math.PI * 2 / 100;
          if (tl_layout != "Segmented") {
            switch (tl_scale) {

              case "Chronological":
              end_angle = d3.max([timeline_scale(d.end_date),timeline_scale(d.start_date) + unit_arc]);
              break;

              case "Relative":
              if (tl_layout == "Faceted") {
                end_angle = d3.max([timeline_scale(d.end_age),timeline_scale(d.start_age) + unit_arc]);
              }
              break;

              case "Sequential":
              end_angle = timeline_scale(d.seq_index + 1);
              break;
            }
          }
          else if (tl_layout == "Segmented") {
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
              if (moment(time.utcWeek.floor(d.start_date)).isoWeek() == 53) {
                end_angle = timeline_scale(1) + unit_arc;
              }
              else {
                end_angle = timeline_scale(moment(time.utcWeek.floor(d.start_date)).isoWeek()) + unit_arc;
              }
              break;
              case "decades":
              end_angle = timeline_scale(moment(time.month.floor(d.start_date)).month() + (time.month.floor(d.start_date).getUTCFullYear() - Math.floor(time.month.floor(d.start_date).getUTCFullYear() / 10) * 10) * 12) + unit_arc;
              break;
              case "centuries":
              if (d.start_date.getUTCFullYear() < 0) {
                end_angle =  timeline_scale(d.start_date.getUTCFullYear() % 100 + 100) + unit_arc;
              }
              else {
                end_angle =  timeline_scale(d.start_date.getUTCFullYear() % 100) + unit_arc;
              }
              break;
              case "millenia":
              if (d.start_date.getUTCFullYear() < 0) {
                end_angle =  timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000) + unit_arc;
              }
              else {
                end_angle =  timeline_scale(d.start_date.getUTCFullYear() % 1000) + unit_arc;
              }
              break;
              case "epochs":
              end_angle = timeline_scale(d.start_date) + unit_arc;
              break;
            }
          }
          return end_angle;
        })
        )
        .style("opacity", function(d){
          if (tl_layout != "Segmented") {
            if (globals.active_event_list.indexOf(d.event_id) != -1) {
              return 1;
            }
            else {
              if (globals.filter_type == "Hide") {
                return 0;
              }
              else {
                return 0.1;
              }
            }
          }
          else {
            return 0;
          }
        })
        .style("pointer-events", function(d){
          if (tl_layout != "Segmented") {
            if (globals.active_event_list.indexOf(d.event_id) != -1) {
              return "inherit";
            }
            else {
              return "none";
            }
          }
          else {
            return "none";
          }
        })
        .style("display", "inline");
        }
      else {
        timeline_event_g_update.selectAll("path.event_span")
        .style("display", "none");
      }

      /**
      ---------------------------------------------------------------------------------------
      EVENT SPANS for SEGMENTED layouts
      ---------------------------------------------------------------------------------------
      span enter
      ---------------------------------------------------------------------------------------
      **/

      var event_span = timeline_event_g_enter.selectAll(".event_span_component")
      .data(function (d) {
        var event_span_component;
        switch (globals.segment_granularity) {
          case "days":
          event_span_component = time.utcHour.range(time.utcHour.floor(d.start_date),time.utcHour.ceil(d.end_date));
          break;
          case "weeks":
          event_span_component = time.day.range(time.day.floor(d.start_date),time.day.ceil(d.end_date));
          break;
          case "months":
          event_span_component = time.day.range(time.day.floor(d.start_date),time.day.ceil(d.end_date));
          break;
          case "years":
          event_span_component = time.utcWeek.range(time.utcWeek.floor(d.start_date),time.utcWeek.ceil(d.end_date));
          break;
          case "decades":
          event_span_component = time.month.range(time.month.floor(d.start_date),time.month.ceil(d.end_date));
          break;
          case "centuries":
          event_span_component = d3.range(d.start_date.getUTCFullYear(),d.end_date.getUTCFullYear());
          break;
          case "millenia":
          event_span_component = d3.range(d.start_date.getUTCFullYear(),d.end_date.getUTCFullYear()+1,10);
          break;
          case "epochs":
          event_span_component = [d.start_date];
          break;
        }
        return event_span_component;
      })
      .enter();

      event_span.append("rect")
      .attr("class", "event_span_component")
      .style("opacity", 0)
      .style("fill", function (d) {
        if (globals.categories.domain()[0] == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d3.select(this.parentNode).datum().category);
        }
      })
      .attr("height", unit_width)
      .attr("width", unit_width)
      .attr("y", height / 2)
      .attr("x", width / 2);

      event_span.append("path")
      .attr("class", "event_span_component")
      .style("opacity", 0)
      .style("fill", function (d) {
        if (globals.categories.domain()[0] == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d3.select(this.parentNode).datum().category);
        }
      });

      /**
      ---------------------------------------------------------------------------------------
      span updates: rect elements for non-radial timelines
      ---------------------------------------------------------------------------------------
      **/

      timeline_event_g_early_update.selectAll("rect.event_span_component")
      .style("opacity", function(d){
        if (tl_layout != "Segmented" || prev_tl_layout != "Segmented" || (tl_representation == "Radial" && prev_tl_representation == "Radial")) {
          return 0;
        }
        else if (globals.prev_active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) == -1 || globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) == -1) {
          if (globals.filter_type == "Hide") {
            return 0;
          }
          else if (globals.filter_type == "Emphasize") {
            if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) == -1) {
              return 0.1;
            }
            else {
              return 1;
            }
          }
        }
        else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1 && d3.select(this.parentNode).datum().selected) {
          return 1;
        }
        else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          if (tl_scale != prev_tl_scale || tl_layout != prev_tl_layout || tl_representation != prev_tl_representation) {
            return 0.5
          }
          else {
            return 1;
          }
        }
        else {
          return 0.1;
        }
      })
      .style("pointer-events", function(d){
        return "none";
      })
      .style("fill", function (d) {
        if (globals.categories.domain()[0] == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d3.select(this.parentNode).datum().category);
        }
      });

      timeline_event_g_update.selectAll("rect.event_span_component")
      .attr("transform", function (d) {
        var offset_y = 0,
        offset_x = 0;

        if (tl_layout == "Faceted") {
          offset_y = (height / globals.num_facets) * globals.facets.domain().indexOf(d3.select(this.parentNode).datum().facet);
        }
        else if (tl_layout == "Segmented") {
          if (tl_representation == "Linear" && tl_scale == "Chronological") {
            switch (globals.segment_granularity) {
              case "days":
              offset_y = d3.max([0,(time.day.count(time.utcDay.floor(data.min_start_date), d) - 1) * (height / globals.num_segments)]);
              break;
              case "weeks":
              offset_y = d3.max([0,(time.week.count(time.utcWeek.floor(data.min_start_date), d) - 1) * (height / globals.num_segments)]);
              break;
              case "months":
              offset_y = d3.max([0,(time.month.count(time.utcMonth.floor(data.min_start_date), d) - 1) * (height / globals.num_segments)]);
              break;
              case "years":
              offset_y = d3.max([0,(d.getUTCFullYear() - data.min_start_date.getUTCFullYear()) * (height / globals.num_segments)]);
              break;
              case "decades":
              offset_y = d3.max([0,(Math.floor(d.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)) * (height / globals.num_segments)]);
              break;
              case "centuries":
              offset_y = d3.max([0,(Math.floor(d / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)) * (height / globals.num_segments)]);
              break;
              case "millenia":
              offset_y = d3.max([0,(Math.floor(d / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)) * (height / globals.num_segments)]);
              break;
              case "epochs":
              offset_y = 0;
              break;
            }
          }
          else if (tl_representation == "Radial" && tl_scale == "Chronological") {
            var span_segment = 0;
            switch (globals.segment_granularity) {
              case "days":
              span_segment = d3.max([0,time.day.count(time.day.floor(data.min_start_date),d)]);
              break;
              case "weeks":
              span_segment = d3.max([0,time.week.count(time.week.floor(data.min_start_date),d)]);
              break;
              case "months":
              span_segment = d3.max([0,time.month.count(time.month.floor(data.min_start_date),d)]);
              break;
              case "years":
              span_segment = d3.max([0,d.getUTCFullYear() - data.min_start_date.getUTCFullYear()]);
              break;
              case "decades":
              span_segment = d3.max([0,Math.floor(d.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)]);
              break;
              case "centuries":
              span_segment = d3.max([0,Math.floor(d / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)]);
              break;
              case "millenia":
              span_segment = d3.max([0,Math.floor(d / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)]);
              break;
              case "epochs":
              span_segment = 0;
              break;
            }
            var segment_dim_x = width / globals.num_segment_cols;
            var segment_dim_y = height / globals.num_segment_rows;
            offset_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
            offset_y = Math.floor(span_segment / globals.num_segment_cols) * segment_dim_y + segment_dim_y / 2 + globals.track_height;
          }
        }
        return "translate(" + offset_x + "," + offset_y + ")";
      });

      timeline_event_g_update.selectAll("rect.event_span_component")
      .attr("height", function (d) {
        var span_height = unit_width;
        if (tl_layout == "Segmented" && tl_representation == "Calendar" && tl_scale == "Chronological") {
          span_height = 20;
        }
        else if (tl_layout == "Segmented" && tl_representation == "Grid" && tl_scale == "Chronological") {
          span_height = 37.5;
        }
        return span_height;
      })
      .attr("width", function (d) {
        var span_width = unit_width;
        if (tl_layout == "Segmented" && tl_representation == "Linear" && tl_scale == "Chronological") {
          switch (globals.segment_granularity) {
            case "days":
            span_width = d3.max([0,width / 24]);
            break;
            case "weeks":
            span_width = d3.max([0,width / 7]);
            break;
            case "months":
            span_width = d3.max([0, width / 31]);
            break;
            case "years":
            span_width = d3.max([0,width / 52]);
            break;
            case "decades":
            span_width = d3.max([0,width / 120]);
            break;
            case "centuries":
            span_width = d3.max([0,width / 100]);
            break;
            case "millenia":
            span_width = d3.max([0,width / 100]);
            break;
            case "epochs":
            span_width = d3.max([0,unit_width]);
            break;
          }
        }
        else if (tl_layout == "Segmented" && tl_representation == "Radial" && tl_scale == "Chronological" && prev_tl_representation != "Radial") {
          span_width = unit_width;
        }
        else if (tl_layout == "Segmented" && tl_representation == "Grid" && tl_scale == "Chronological") {
          span_width = 50;
        }
        else if (tl_layout == "Segmented" && tl_representation == "Calendar" && tl_scale == "Chronological") {
          span_width = 10;
        }
        return span_width;
      })
      .attr("y", function (d) {
        var y_pos = 0
        if (tl_layout == "Unified") {
          if (tl_representation == "Linear" && tl_scale == "Chronological") {
            y_pos = d3.max([0,height - (globals.track_height * d3.select(this.parentNode).datum().track + globals.track_height)]);
          }
        }
        else if (tl_layout == "Faceted") {
          if (tl_representation == "Linear" && tl_scale == "Chronological") {
            y_pos = d3.max([0,(height / globals.num_facets) - (globals.track_height * d3.select(this.parentNode).datum().track + globals.track_height)]);
          }
        }
        else if (tl_layout == "Segmented") {
          if (tl_representation == "Linear" && tl_scale == "Chronological") {
            y_pos = d3.max([0,(height / globals.num_segments) - (globals.track_height * d3.select(this.parentNode).datum().track + globals.track_height)]);
          }
          else if (tl_representation == "Radial" && tl_scale == "Chronological") {
            var y_cos = 0
            switch (globals.segment_granularity) {
              case "days":
              y_cos = d3.max([0,timeline_scale(moment(d).hour())]);
              break;
              case "weeks":
              y_cos = d3.max([0,timeline_scale(moment(d).day())]);
              break;
              case "months":
              y_cos = d3.max([0,timeline_scale(moment(d).date())]);
              break;
              case "years":
              if (moment(d).week() == 53) {
                y_cos = d3.max([0,timeline_scale(1)]);
              }
              else {
                y_cos = d3.max([0,timeline_scale(moment(d).week())]);
              }
              break;
              case "decades":
              y_cos = d3.max([0,timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12)]);
              break;
              case "centuries":
              y_cos = d3.max([0,timeline_scale(d % 100)]);
              break;
              case "millenia":
              y_cos = d3.max([0,timeline_scale(d % 1000)]);
              break;
              case "epochs":
              y_cos = d3.max([0,timeline_scale(d)]);
              break;
            }
            y_pos = -1 * (globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height + globals.track_height) * Math.cos(y_cos);
          }
          else if (tl_layout == "Segmented" && tl_representation == "Grid" && tl_scale == "Chronological") {
            if (["decades","centuries","millenia"].indexOf(globals.segment_granularity) != -1){

              var grid_year;

              if (globals.isNumber(d)){
                grid_year = d;
              }
              else {
                grid_year = d.getUTCFullYear();
              }

              y_pos = getYGridPosition(grid_year,Math.floor(data.min_start_date.getUTCFullYear() / 100) * 100);
            }
            else if (globals.segment_granularity == "epochs") {
              y_pos = 0;
            }
            else {
              y_pos = 0;
            }
          }
          else if (tl_layout == "Segmented" && tl_representation == "Calendar" && tl_scale == "Chronological") {
            var cell_size = 20,
            year_height = cell_size * 8,
            range_floor = data.min_start_date.getUTCFullYear();
            year_offset = 0;
            if (globals.segment_granularity == "centuries" || globals.segment_granularity == "millenia" || globals.segment_granularity == "epochs") {
              y_pos = 0;
            }
            else {
              year_offset = year_height * (d.getUTCFullYear() - range_floor);
              y_pos = d3.max([0,d.getDay() * cell_size + year_offset]);
            }
          }
        }
        return y_pos;
      })
      .attr("x", function (d) {
        var x_pos = 0;
        if (tl_layout == "Unified" || tl_layout == "Faceted") {
          if (tl_representation == "Linear" && tl_scale == "Chronological") {
            x_pos = d3.max([0,timeline_scale(d3.select(this.parentNode).datum().start_date)]);
          }
        }
        else if (tl_layout == "Segmented") {
          if (tl_representation == "Linear" && tl_scale == "Chronological") {
            switch (globals.segment_granularity) {
              case "days":
              x_pos = d3.max([0,timeline_scale(moment(d).hour())]);
              break;
              case "weeks":
              x_pos = d3.max([0,timeline_scale(moment(d).day())]);
              break;
              case "months":
              x_pos = d3.max([0,timeline_scale(moment(d).date())]);
              break;
              case "years":
              if (moment(d).week() == 53) {
                x_pos = d3.max([0,timeline_scale(1)]);
              }
              else {
                x_pos = d3.max([0,timeline_scale(moment(d).week())]);
              }
              break;
              case "decades":
              x_pos = d3.max([0,timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12)]);
              break;
              case "centuries":
              if (d < 0) {
                x_pos = d3.max([0,timeline_scale(d % 100 + 100)]);
              }
              else {
                x_pos = d3.max([0,timeline_scale(d % 100)]);
              }
              break;
              case "millenia":
              if (d < 0) {
                x_pos = d3.max([0,timeline_scale(d % 1000 + 1000)]);
              }
              else {
                x_pos = d3.max([0,timeline_scale(d % 1000)]);
              }
              break;
              case "epochs":
              x_pos = d3.max([0,timeline_scale(d)]);
              break;
            }
          }
          else if (tl_representation == "Radial" && tl_scale == "Chronological") {
            var x_sin = 0
            switch (globals.segment_granularity) {
              case "days":
              x_sin = d3.max([0,timeline_scale(moment(d).hour())]);
              break;
              case "weeks":
              x_sin = d3.max([0,timeline_scale(moment(d).day())]);
              break;
              case "months":
              x_sin = d3.max([0,timeline_scale(moment(d).date())]);
              break;
              case "years":
              if (moment(d).week() == 53) {
                x_sin = d3.max([0,timeline_scale(1)]);
              }
              else {
                x_sin = d3.max([0,timeline_scale(moment(d).week())]);
              }
              break;
              case "decades":
              x_sin = d3.max([0,timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12)]);
              break;
              case "centuries":
              x_sin = d3.max([0,timeline_scale(d % 100)]);
              break;
              case "millenia":
              x_sin = d3.max([0,timeline_scale(d % 1000)]);
              break;
              case "epochs":
              x_sin = d3.max([0,timeline_scale(d)]);
              break;
            }
            x_pos = (globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height + globals.track_height) * Math.sin(x_sin);
          }
          else if (tl_layout == "Segmented" && tl_representation == "Grid" && tl_scale == "Chronological") {

            var grid_year;

            if (globals.isNumber(d)){
              grid_year = d;
            }
            else {
              grid_year = d.getUTCFullYear();
            }

            if (["decades","centuries","millenia"].indexOf(globals.segment_granularity) != -1){
              x_pos = d3.max([0,getXGridPosition(grid_year)]);
            }
            else if (globals.segment_granularity == "epochs") {
              x_pos = 0;
            }
            else {
              x_pos = d3.max([0,getXGridPosition(grid_year)]);
            }
          }
          else if (tl_layout == "Segmented" && tl_representation == "Calendar" && tl_scale == "Chronological") {
            if (globals.segment_granularity == "centuries" || globals.segment_granularity == "millenia" || globals.segment_granularity == "epochs") {
              x_pos = 0;
            }
            else {
              x_pos = d3.max([0,d3.time.weekOfYear(d) * 20]);
            }
          }
        }
        return x_pos;
      });

      timeline_event_g_delayed_update.selectAll("rect.event_span_component")
      .style("opacity", function(d){
        if (tl_layout == "Segmented" && tl_representation != "Radial" && globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          return 1;
        }
        else {
          if (tl_layout != "Segmented" || globals.filter_type == "Hide" || tl_representation == "Radial") {
            return 0;
          }
          else {
            return 0.1;
          }
        }
      })
      .style("pointer-events", function(d){
        if (tl_layout == "Segmented" && tl_representation != "Radial" && globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          return "inherit";
        }
        else {
          return "none";
        }
      });

      /**
      ---------------------------------------------------------------------------------------
      span updates: path/arc elements for non-radial timelines
      ---------------------------------------------------------------------------------------
      **/

      timeline_event_g_early_update.selectAll("path.event_span_component")
      .style("opacity", function(d){
        if ((tl_layout != "Segmented" || prev_tl_layout != "Segmented") || (tl_representation != "Radial" && prev_tl_representation != "Radial")) {
          return 0;
        }
        else if (globals.prev_active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) == -1 || globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) == -1) {
          if (globals.filter_type == "Hide") {
            return 0;
          }
          else if (globals.filter_type == "Emphasize") {
            if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) == -1) {
              return 0.1;
            }
            else {
              return 1;
            }
          }
        }
        else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1 && d3.select(this.parentNode).datum().selected) {
          return 1;
        }
        else if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          if (tl_scale != prev_tl_scale || tl_layout != prev_tl_layout || tl_representation != prev_tl_representation) {
            return 0.5
          }
          else {
            return 1;
          }
        }
        else {
          return 0.1;
        }
      })
      .style("pointer-events", function(d){
        if (prev_tl_layout != "Segmented" || (tl_representation != "Radial" && prev_tl_representation != "Radial")) {
          return "none";
        }
        else if (globals.prev_active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1 && globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          return "inherit";
        }
        else {
          return "none";
        }
      })
      .style("fill", function (d) {
        if (globals.categories.domain()[0] == undefined) {
          return "#E45641";
        }
        else {
          return globals.categories(d3.select(this.parentNode).datum().category);
        }
      });

      timeline_event_g_update.selectAll("path.event_span_component")
      .attr("transform", function (d) {
        var offset_x = 0,
        offset_y = 0,
        span_segment = 0;
        if (tl_layout == "Segmented" && tl_scale == "Chronological"){
          switch (globals.segment_granularity) {
            case "days":
            span_segment = d3.max([0,time.day.count(time.day.floor(data.min_start_date),d)]);
            break;
            case "weeks":
            span_segment = d3.max([0,time.week.count(time.week.floor(data.min_start_date),d)]);
            break;
            case "months":
            span_segment = d3.max([0,time.month.count(time.month.floor(data.min_start_date),d)]);
            break;
            case "years":
            span_segment = d3.max([0,d.getUTCFullYear() - data.min_start_date.getUTCFullYear()]);
            break;
            case "decades":
            span_segment = d3.max([0,Math.floor(d.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)]);
            break;
            case "centuries":
            span_segment = d3.max([0,Math.floor(d / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)]);
            break;
            case "millenia":
            span_segment = d3.max([0,Math.floor(d / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)]);
            break;
            case "epochs":
            span_segment = 0;
            break;
          }
          var segment_dim_x = width / globals.num_segment_cols;
          var segment_dim_y = height / globals.num_segment_rows;
          offset_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
          offset_y = Math.floor(span_segment / globals.num_segment_cols - 1) * segment_dim_y + segment_dim_y + segment_dim_y / 2 + globals.buffer;
        }
        else if (tl_layout == "Unified"){
          offset_x = width / 2;
          offset_y = height / 2;
        }
        else if (tl_layout == "Faceted"){
          var facet_dim_x = width / globals.num_facet_cols;
          var facet_dim_y = height / globals.num_facet_rows;
          offset_x = globals.facets.domain().indexOf(d3.select(this.parentNode).datum().facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
          offset_y = Math.floor(globals.facets.domain().indexOf(d3.select(this.parentNode).datum().facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2 + globals.buffer;
        }
        return "translate(" + offset_x + "," + offset_y + ")";
      });

      if (tl_representation == "Radial") {

        timeline_event_g_delayed_update.selectAll("path.event_span_component")
        .attr("d", d3.svg.arc()
        .innerRadius(function (d) {
          var inner_radius = globals.centre_radius;
          if (tl_scale == "Relative" || tl_scale == "Chronological"){
            inner_radius = d3.max([globals.centre_radius,globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height]);
          }
          return inner_radius;
        })
        .outerRadius(function (d) {
          var outer_radius = globals.centre_radius + unit_width;
          if (tl_scale == "Relative" || tl_scale == "Chronological"){
            outer_radius = d3.max([globals.centre_radius + unit_width,globals.centre_radius + d3.select(this.parentNode).datum().track * globals.track_height + unit_width]);
          }
          return outer_radius;
        })
        .startAngle(function (d) {
          var start_angle = 0;
          if (tl_layout == "Segmented" && tl_scale == "Chronological"){
            switch (globals.segment_granularity) {
              case "days":
              start_angle = d3.max([0,timeline_scale(moment(d).hour())]);
              break;
              case "weeks":
              start_angle = d3.max([0,timeline_scale(moment(d).day())]);
              break;
              case "months":
              start_angle = d3.max([0,timeline_scale(moment(d).date())]);
              break;
              case "years":
              if (moment(d).isoWeek() == 53) {
                start_angle = d3.max([0,timeline_scale(1)]);
              }
              else {
                start_angle = d3.max([0,timeline_scale(moment(d).isoWeek())]);
              }
              break;
              case "decades":
              start_angle = d3.max([0,timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12)]);
              break;
              case "centuries":
              if (d < 0){
                start_angle = d3.max([0,timeline_scale(d % 100 + 100)]);
              }
              else {
                start_angle = d3.max([0,timeline_scale(d % 100)]);
              }
              break;
              case "millenia":
              if (d < 0){
                start_angle = d3.max([0,timeline_scale(d % 1000 + 1000)]);
              }
              else {
                start_angle = d3.max([0,timeline_scale(d % 1000)]);
              }
              break;
              case "epochs":
              start_angle = d3.max([0,timeline_scale(d.valueOf())]);
              break;
            }
          }
          else if (tl_layout == "Unified" || tl_layout == "Faceted"){
            switch (tl_scale) {

              case "Chronological":
              start_angle = timeline_scale(d3.select(this.parentNode).datum().start_date);
              break;

              case "Relative":
              if (tl_layout == "Faceted") {
                start_angle =  timeline_scale(d3.select(this.parentNode).datum().start_age);
              }
              break;

              case "Sequential":
              start_angle = timeline_scale(d3.select(this.parentNode).datum().seq_index);
              break;
            }
          }
          return start_angle;
        })
        .endAngle(function (d) {
          var end_angle = 0,
          unit_arc = 0;
          if (tl_layout == "Segmented" && tl_scale == "Chronological"){
            switch (globals.segment_granularity) {
              case "days":
              unit_arc = Math.PI * 2 / 24;
              end_angle = d3.max([0,timeline_scale(moment(d).hour()) + unit_arc]);
              break;
              case "weeks":
              unit_arc = Math.PI * 2 / 7;
              end_angle = d3.max([0,timeline_scale(moment(d).day()) + unit_arc]);
              break;
              case "months":
              unit_arc = Math.PI * 2 / 31;
              end_angle = d3.max([0,timeline_scale(moment(d).date()) + unit_arc]);
              break;
              case "years":
              unit_arc = Math.PI * 2 / 52;
              if (moment(d).isoWeek() == 53) {
                end_angle = d3.max([0,timeline_scale(1) + unit_arc]);
              }
              else {
                end_angle = d3.max([0,timeline_scale(moment(d).isoWeek()) + unit_arc]);
              }
              break;
              case "decades":
              unit_arc = Math.PI * 2 / 120;
              end_angle = d3.max([0,timeline_scale(moment(d).month() + (d.getUTCFullYear() - Math.floor(d.getUTCFullYear() / 10) * 10) * 12) + unit_arc]);
              break;
              case "centuries":
              unit_arc = Math.PI * 2 / 100;
              if (d < 0){
                end_angle = d3.max([0,timeline_scale(d % 100 + 100) + unit_arc]);
              }
              else {
                end_angle = d3.max([0,timeline_scale(d % 100) + unit_arc]);
              }
              break;
              case "millenia":
              unit_arc = Math.PI * 2 / 100;
              if (d < 0){
                end_angle = d3.max([0,timeline_scale(d % 1000 + 1000) + unit_arc]);
              }
              else {
                end_angle = d3.max([0,timeline_scale(d % 1000) + unit_arc]);
              }
              break;
              case "epochs":
              unit_arc = Math.PI * 2 / 100;
              end_angle = d3.max([0,timeline_scale(d.valueOf()) + unit_arc]);
              break;
            }
          }
          else if (tl_layout == "Unified" || tl_layout == "Faceted"){
            unit_arc = Math.PI * 2 / 100;
            switch (tl_scale) {

              case "Chronological":
              end_angle = d3.max([timeline_scale(d.end_date),timeline_scale(d3.select(this.parentNode).datum().start_date) + unit_arc]);
              break;

              case "Relative":
              if (tl_layout == "Faceted") {
                end_angle = d3.max([timeline_scale(d.end_age),timeline_scale( d3.select(this.parentNode).datum().start_age) + unit_arc]);
              }
              break;

              case "Sequential":
              end_angle = timeline_scale(d3.select(this.parentNode).datum().seq_index + 1);
              break;
            }
          }
          return end_angle;
        })
        )
        .style("opacity", function(d){
          if (tl_layout == "Segmented" && tl_scale == "Chronological") {
            if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
              return 1;
            }
            else {
              if (globals.filter_type == "Hide") {
                return 0;
              }
              else {
                return 0.1;
              }
            }
          }
          else {
            return 0;
          }
        })
        .style("pointer-events", function(d){
          if (tl_layout == "Segmented" && tl_scale == "Chronological") {
            if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
              return "inherit";
            }
            else {
              return "none";
            }
          }
          else {
            return "none";
          }
        })
        .style("display", "inline");
      }
      else {
        timeline_event_g_update.selectAll("path.event_span_component")
        .style("display", "none");
      }

      /**
      ---------------------------------------------------------------------------------------
      terminal span indicators for segmented layouts
      ---------------------------------------------------------------------------------------
      **/

      //add right-facing triangle path to indicate beginning of span
      timeline_event_g_enter.append("path")
      .attr("class","path_end_indicator")
      .style("opacity", 0)
      .attr("d", d3.svg.symbol()
      .type("triangle-up")
      .size(unit_width * 1.5)
      )
      .style("display", "none");

      timeline_event_g_early_update.select(".path_end_indicator")
      .style("opacity",0)
      .style("pointer-events", "none");

      //update terminal span indicators
      timeline_event_g_update.select(".path_end_indicator")
      .attr("transform", function (d) {
        var x_pos = 0,
        y_pos = 0,
        span_segment = 0,
        rotation = 0,
        rect_x = 0;

        if (tl_layout == "Segmented"){
          if (tl_representation == "Linear") {
            rotation = 90;
            switch (globals.segment_granularity) {
              case "days":
              x_pos = d3.max([0,timeline_scale(moment(d.start_date).hour())]);
              y_pos = d3.max([0,time.day.count(time.utcDay.floor(data.min_start_date), d.start_date) - 1]);
              break;
              case "weeks":
              x_pos = d3.max([0,timeline_scale(moment(d.start_date).day())]);
              y_pos = d3.max([0,time.week.count(time.utcWeek.floor(data.min_start_date), d.start_date) - 1]);
              break;
              case "months":
              x_pos = d3.max([0,timeline_scale(moment(d.start_date).date())]);
              y_pos = d3.max([0,time.month.count(time.utcMonth.floor(data.min_start_date), d.start_date) - 1]);
              break;
              case "years":
              if (moment(d.start_date).week() == 53) {
                x_pos = d3.max([0,timeline_scale(1)]);
              }
              else {
                d3.max([0,x_pos = timeline_scale(moment(d.start_date).week() - 1)]);
              }
              y_pos = d3.max([0,d.start_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()]);
              break;
              case "decades":
              if (moment(d.start_date).month() == 11 && moment(d.start_date).date() == 31) {
                x_pos = d3.max([0,timeline_scale(-1 + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12)]);
              }
              else {
                x_pos = d3.max([0,timeline_scale(moment(d.start_date).month() + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12)]);
              }
              y_pos = d3.max([0, Math.floor(d.start_date.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)]);
              break;
              case "centuries":
              if (d.start_date.getUTCFullYear() < 0) {
                x_pos = d3.max([0,timeline_scale(d.start_date.getUTCFullYear() % 100 + 100)]);
              }
              else {
                x_pos = d3.max([0,timeline_scale(d.start_date.getUTCFullYear() % 100)]);
              }
              y_pos = d3.max([0,Math.floor(d.start_date.getUTCFullYear() / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)]);
              break;
              case "millenia":
              if (d.start_date.getUTCFullYear() < 0) {
                x_pos = d3.max([0,timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000)]);
              }
              else {
                x_pos = d3.max([0,timeline_scale(d.start_date.getUTCFullYear() % 1000)]);
              }
              y_pos = d3.max([0,Math.floor(d.start_date.getUTCFullYear() / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)]);
              break;
              case "epochs":
              x_pos = d3.max([0,timeline_scale(d.start_date)]);
              y_pos = 0;
              break;
            }
            x_pos = x_pos + unit_width * 0.33;
            y_pos = (y_pos + 1) * (height / globals.num_segments) - (globals.track_height * d.track + globals.track_height) + unit_width * 0.5;
          }
          else if (tl_representation == "Radial") {
            var pos;
            switch (globals.segment_granularity) {
              case "days":
              span_segment = d3.max([0,time.day.count(time.day.floor(data.min_start_date),d.start_date)]);
              pos = timeline_scale(moment(d.start_date).hour() + 0.5);
              break;
              case "weeks":
              span_segment = d3.max([0,time.week.count(time.week.floor(data.min_start_date),d.start_date)]);
              pos = timeline_scale(moment(d.start_date).day() + 0.5);
              break;
              case "months":
              span_segment = d3.max([0,time.month.count(time.month.floor(data.min_start_date),d.start_date)]);
              pos = timeline_scale(moment(d.start_date).date() + 0.5);
              break;
              case "years":
              span_segment = d3.max([0,d.start_date.getUTCFullYear() - data.min_start_date.getUTCFullYear()]);
              if (moment(d.start_date).isoWeek() == 53) {
                pos = timeline_scale(1);
              }
              else {
                pos = timeline_scale(moment(d.start_date).isoWeek() - 1);
              }
              break;
              case "decades":
              if (moment(d.start_date).month() == 11 && moment(d.start_date).date() == 31) {
                pos = timeline_scale(-1 + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12 + 0.5);
              }
              else {
                pos = timeline_scale(moment(d.start_date).month() + (d.start_date.getUTCFullYear() - Math.floor(d.start_date.getUTCFullYear() / 10) * 10) * 12 + 0.5);
              }
              span_segment = d3.max([0,Math.floor(d.start_date.getUTCFullYear() / 10) - Math.floor(data.min_start_date.getUTCFullYear() / 10)]);
              break;
              case "centuries":
              if (d.start_date.getUTCFullYear() < 0){
                pos = timeline_scale(d.start_date.getUTCFullYear() % 100 + 100 + 0.5);
              }
              else {
                pos = timeline_scale(d.start_date.getUTCFullYear() % 100 + 0.5);
              }
              span_segment = d3.max([0,Math.floor(d.start_date.getUTCFullYear() / 100) - Math.floor(data.min_start_date.getUTCFullYear() / 100)]);
              break;
              case "millenia":
              if (d.start_date.getUTCFullYear() < 0){
                pos = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 1000 + 0.5);
              }
              else {
                pos = timeline_scale(d.start_date.getUTCFullYear() % 1000 + 0.5);
              }
              span_segment = d3.max([0,Math.floor(d.start_date.getUTCFullYear() / 1000) - Math.floor(data.min_start_date.getUTCFullYear() / 1000)]);
              break;
              case "epochs":
              span_segment = 0;
              pos = timeline_scale(d.start_date.valueOf() + 0.5);
              break;
            }
            var segment_dim_x = width / globals.num_segment_cols;
            var segment_dim_y = height / globals.num_segment_rows;
            var segment_x = span_segment % globals.num_segment_cols * segment_dim_x + segment_dim_x / 2;
            var segment_y = Math.floor(span_segment / globals.num_segment_cols - 1) * segment_dim_y + segment_dim_y + segment_dim_y / 2 + globals.buffer;
            var x_offset = ((globals.centre_radius + d.track * globals.track_height +  0.25 * globals.track_height) * Math.sin(pos));
            var y_offset = -1 * ((globals.centre_radius + d.track * globals.track_height +  0.25 * globals.track_height) * Math.cos(pos));
            x_pos = segment_x + x_offset;
            y_pos = segment_y + y_offset;
            rotation = pos * 360 / (Math.PI * 2) + 90;
          }
          else if (tl_representation == "Grid" && tl_scale == "Chronological" && globals.date_granularity != "epochs"){
            rotation = 90;
            x_pos = d3.max([0,getXGridPosition(d.start_date.getUTCFullYear()) + unit_width * 0.33]);
            y_pos = getYGridPosition(d.start_date.getUTCFullYear(),data.min_start_date.getUTCFullYear()) + unit_width * 0.5;
          }
          else if (tl_representation == "Calendar" && tl_scale == "Chronological"){
            var cell_size = 20,
            year_height = cell_size * 8,
            range_floor = data.min_start_date.getUTCFullYear();
            year_offset = year_height * (d.start_date.getUTCFullYear() - range_floor);
            rotation = 180;
            x_pos = d3.max([0,d3.time.weekOfYear(d.start_date) * 20 + 0.33 * unit_width]);
            y_pos = d3.max([0, d.start_date.getDay() * cell_size + year_offset + unit_width * 0.33]);
          }
        }
        else if (tl_layout == "Unified" && tl_scale == "Chronological"){
          if (tl_representation == "Linear"){
            rotation = 90;
            x_pos = d3.max([0,rect_x = timeline_scale(d.start_date) +  unit_width * 0.33]);
            y_pos = d3.max([0,height - (globals.track_height * d.track + unit_width)]);
          }
          else if (tl_representation == "Radial") {
            rotation = timeline_scale(d.start_date) * 360 / (Math.PI * 2) + 90;
            x_pos = (globals.centre_radius + d.track * globals.track_height) * Math.sin(timeline_scale(d.start_date));
            y_pos = -1 * (globals.centre_radius + d.track * globals.track_height) * Math.cos(timeline_scale(d.start_date));
          }
        }
        else if (tl_layout == "Faceted" && tl_scale == "Chronological"){
          if (tl_representation == "Linear"){
            var facet_offset = (height / globals.num_facets) * globals.facets.domain().indexOf(d.facet);
            rotation = 90;
            x_pos = d3.max([0,rect_x = timeline_scale(d.start_date) + unit_width * 0.33]);
            y_pos = d3.max([0,(height / globals.num_facets) - (globals.track_height * d.track + unit_width) + facet_offset]);
          }
          else if (tl_representation == "Radial") {
            var facet_dim_x = width / globals.num_facet_cols;
            var facet_dim_y = height / globals.num_facet_rows;
            var x_facet_offset = globals.facets.domain().indexOf(d.facet) % globals.num_facet_cols * facet_dim_x + facet_dim_x / 2;
            var y_facet_offset = Math.floor(globals.facets.domain().indexOf(d.facet) / globals.num_facet_cols - 1) * facet_dim_y + facet_dim_y + facet_dim_y / 2;
            rotation = timeline_scale(d.start_date) * 360 / (Math.PI * 2) + 90;
            x_pos = (globals.centre_radius + d.track * globals.track_height) * Math.sin(timeline_scale(d.start_date)) + x_facet_offset;
            y_pos = -1 * (globals.centre_radius + d.track * globals.track_height) * Math.cos(timeline_scale(d.start_date)) + y_facet_offset;
          }
        }
        return "translate(" + x_pos + "," + y_pos + ")rotate(" + rotation + ")"
      });

      timeline_event_g_final_update.select(".path_end_indicator")
      .style("opacity", function(d){
        if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          return 1;
        }
        else {
          return 0;
        }
      })
      .style("pointer-events", function(d){
        if (globals.active_event_list.indexOf(d3.select(this.parentNode).datum().event_id) != -1) {
          return "inherit";
        }
        else {
          return "none";
        }
      })
      .style("display", function (d) {
        if (tl_layout == "Segmented") {
          return "inline";
        }
        else {
          return "none";
        }
      });

      timeline_event_g_final_update.selectAll('path.event_span').each( function(){
        this.parentNode.appendChild(this);
      })

      //set previous timeline configuration
      prev_tl_scale = tl_scale;
      prev_tl_layout = tl_layout;
      prev_tl_representation = tl_representation;

    });
    d3.timer.flush();
  }

  //place an element in correct x position on grid axis
  function getXGridPosition (year) {

    var cell_size = 50;

    if (year < 0 && year % 10 != 0) {
      return (year % 10 + 10) * cell_size; //negative decade year correction adds 10
    }
    else {
      return year % 10 * cell_size;
    }

  };

  //place an element in correct y position on grid axis
  function getYGridPosition (year, min) {

    var cell_size = 50,
    century_height = cell_size * unit_width,
    y_offset = 0;

    var decade_of_century = 0,
    century_offset = Math.floor(year / 100) - Math.floor(min / 100);

    if (year < 0) {
      century_offset++; // handle BC dates
      if (year % 100 == 0) {
        decade_of_century = 0;
        century_offset--;
        y_offset = -unit_width;
      }
      else {
        decade_of_century = Math.floor(year % 100 / 10) - 1;
      }
    }
    else {
      decade_of_century = Math.floor(year % 100 / 10);
    }

    return decade_of_century * 1.25 * cell_size + century_offset * (century_height + cell_size) + y_offset;
  };

  function dragStarted () {
    if (tl_representation == "Curve" && active_line == undefined) {
      active_line = selectWithParent(".timeline").append("path")
      .datum([])
      .attr("id","active_line")
      .attr("class", "line");
    }
  };

  function dragged () {
    if (tl_representation == "Curve" && active_line != undefined && !globals.dirty_curve) {
      active_line.datum()
      .push(d3.mouse(this));

      active_line.attr("d", render_path);
    }
  };

  function dragEnd () {

    globals.dirty_curve = true;
    selectWithParent('.timeline_frame').style("cursor","auto");

    if (tl_representation == "Curve" && fresh_canvas) {
      selectWithParent("#active_line")
      .transition()
      .duration(duration)
      .remove();

      selectAllWithParent("rect.event_span")
      .transition()
      .duration(duration)
      .attr("transform", function (d) {
        return translateAlong(d,d.item_index,active_line.node());
      });
      fresh_canvas = false;

      // create actual visible time curve:

      var timeCurveFunction = d3.svg.line()
      .x(function(d) {
        return d.__data__.translated_x
        +unit_width/2;
      })
      .y(function(d) {
        return d.__data__.translated_y
        +unit_width/2;
      })
      .interpolate("cardinal");

      selectWithParent('#timecurve')
      .attr("d", timeCurveFunction(
        selectAllWithParent('.event_span')[0].filter(function (d,i){
          return i % 2 == 1;
        }))
      )
      .style('visibility', 'visible');
    }

  };

  function translateAlong (d,index,path) {
    var l = path.getTotalLength();
    var p = path.getPointAtLength(index * l / globals.max_item_index);
    d.curve_x = p.x;
    d.curve_y = p.y;
    d.translated_x = p.x;
    d.translated_y = p.y;
    return "translate(" + p.x + "," + p.y + ")";
  };

  function transitionLog (transition) {
    console.log(transition.delay() + "ms: transition with " + transition.size() + " elements lasting " + transition.duration() + "ms.");
  };

  function eventLabel (item) {

    var label = "";

    if (globals.date_granularity == "epochs") {
      var format = function(d) {
        return globals.formatAbbreviation(d);
      };
      var today = new Date().getUTCFullYear();
      label += format(today - item.start_date.valueOf()) + " years ago";
    }
    else if (globals.date_granularity == "years") {
      if (moment(item.start_date).format('YYYY') == moment(item.end_date).format('YYYY')) {
        label += item.start_date.getUTCFullYear();
      }
      else {
        label += item.start_date.getUTCFullYear() + " - " + item.end_date.getUTCFullYear();
      }
    }
    else {
      if (moment(item.start_date).format('MMM D') == moment(item.end_date).format('MMM D')) {
        label += moment(item.start_date).format('MMMM Do, YYYY');
      }
      else {
        if (moment(item.start_date).dayOfYear() <= 2 && moment(item.end_date).dayOfYear() >= 365) {
          if (item.start_date.getUTCFullYear() != item.end_date.getUTCFullYear()) {
            label += item.start_date.getUTCFullYear() + " - " + item.end_date.getUTCFullYear();
          }
          else {
            label += item.start_date.getUTCFullYear();
          }
        }
        else {
          label += moment(item.start_date).format('MMMM Do, YYYY') + " - " + moment(item.end_date).format('MMMM Do, YYYY');
        }
      }
    }

    if (globals.segment_granularity == "days") {
      label += " " + moment(item.start_date).format('HH:mm') + " - " + moment(item.end_date).format('HH:mm');
    }

    label += ": " + item.content_text;

    return label;

  };

  configurableTL.reproduceCurve = function () {

    globals.dirty_curve = true;
    fresh_canvas = false;

    selectWithParent('#timecurve')
    .style('visibility', 'hidden');

    active_line = selectWithParent(".timeline").append("path")
    .attr("id","active_line")
    .attr("class", "line")
    .style("visibility","hidden")
    .attr("d", render_path);

    selectWithParent("#active_line")
    .transition()
    .duration(duration)
    .remove();

    selectAllWithParent("rect.event_span")
    .transition()
    .duration(duration)
    .attr("transform", function (d) {
      return translateAlong(d,d.item_index,active_line.node());
    });

    // create actual visible time curve:

    var timeCurveFunction = d3.svg.line()
    .x(function(d) {
      return d.__data__.translated_x
      +unit_width/2;
    })
    .y(function(d) {
      return d.__data__.translated_y
      +unit_width/2;
    })
    .interpolate("cardinal");

    selectWithParent('#timecurve')
    .attr("d", timeCurveFunction(
      selectAllWithParent('.event_span')[0].filter(function (d,i){
        return i % 2 == 1;
      }))
    )
    .style('visibility', 'hidden');
  };

  configurableTL.resetCurve = function () {

    globals.dirty_curve = false;

    if (tl_representation == "Curve")
    {
      //remove event annotations during a reset
      selectAllWithParent(".event_annotation")
      .remove();

      selectAllWithParent("rect.event_span")
      .transition()
      .duration(duration)
      .attr("transform", function(d) {
        d.curve_y = 0;
        return "translate(" + d.curve_x + "," + d.curve_y +")"
      });
      active_line = undefined;
      fresh_canvas = true;

      selectWithParent('.timeline_frame').style("cursor","crosshair");

      selectWithParent('#timecurve')
      .style('visibility', 'hidden')
    }
  }

  //getter / setter for path
  configurableTL.render_path = function (x) {
    if (!arguments.length) {
      return render_path;
    }
    render_path = x;
    return configurableTL;
  };

  //getter / setter for timeline scale
  configurableTL.tl_scale = function (x) {
    if (!arguments.length) {
      return tl_scale;
    }
    tl_scale = x;
    return configurableTL;
  };

  //getter / setter for timeline layout
  configurableTL.tl_layout = function (x) {
    if (!arguments.length) {
      return tl_layout;
    }
    tl_layout = x;
    return configurableTL;
  };

  //getter / setter for timeline representation
  configurableTL.tl_representation = function (x) {
    if (!arguments.length) {
      return tl_representation;
    }
    tl_representation = x;
    return configurableTL;
  };

  //getter / setter for previous timeline scale
  configurableTL.prev_tl_scale = function (x) {
    if (!arguments.length) {
      return prev_tl_scale;
    }
    prev_tl_scale = x;
    return configurableTL;
  };

  //getter / setter for previous timeline layout
  configurableTL.prev_tl_layout = function (x) {
    if (!arguments.length) {
      return prev_tl_layout;
    }
    prev_tl_layout = x;
    return configurableTL;
  };

  //getter / setter for previous timeline representation
  configurableTL.prev_tl_representation = function (x) {
    if (!arguments.length) {
      return prev_tl_representation;
    }
    prev_tl_representation = x;
    return configurableTL;
  };

  //getter / setter for previous timeline scale
  configurableTL.prev_tl_scale = function (x) {
    if (!arguments.length) {
      return prev_tl_scale;
    }
    prev_tl_scale = x;
    return configurableTL;
  };

  //getter / setter for transition duration
  configurableTL.duration = function (x) {
    if (!arguments.length) {
      return duration;
    }
    duration = x;
    return configurableTL;
  };

  //getter / setter for timeline height
  configurableTL.height = function (x) {
    if (!arguments.length) {
      return height;
    }
    height = x - globals.padding.top - globals.padding.bottom;
    return configurableTL;
  };

  //getter / setter for timeline width
  configurableTL.width = function (x) {
    if (!arguments.length) {
      return width;
    }
    width = x - globals.padding.left - globals.padding.right;
    return configurableTL;
  };

  //getter / setter for timeline scale
  configurableTL.timeline_scale = function (x) {
    if (!arguments.length) {
      return timeline_scale;
    }
    timeline_scale = x;
    return configurableTL;
  };

  //getter / setter for interim_duration_scale scale
  configurableTL.interim_duration_scale = function (x) {
    if (!arguments.length) {
      return interim_duration_scale;
    }
    interim_duration_scale = x;
    return configurableTL;
  };

  //getter / setter for timeline scale
  configurableTL.timeline_scale_segments = function (x) {
    if (!arguments.length) {
      return timeline_scale_segments;
    }
    timeline_scale_segments = x;
    return configurableTL;
  };

  //getter / setter for radial axis quantiles
  configurableTL.radial_axis_quantiles = function (x) {
    if (!arguments.length) {
      return radial_axis_quantiles;
    }
    radial_axis_quantiles = x;
    return configurableTL;
  };

  return configurableTL;
}

module.exports = d3.configurableTL;