"use strict";

var d3 = require("d3");
var moment = require("moment");

/**

calendarAxis: //a reusable calendar axis

**/

d3.calendarAxis = function () {

  var cell_size = 20,
  year_height = cell_size * 8, //7 days of week + buffer
  year_width = cell_size * 54, //53 weeks of the year + buffer
  duration = 1000;

  function calendarAxis (selection) {

    selection.each(function (data) {

      var g = d3.select(this);

      //grid container items for each year
      var year_grid = g.selectAll(".year_grid")
      .data(data);

      var min_year = data[0];

      var year_number = -1;

      var year_grid_enter = year_grid.enter()
      .append("g")
      .attr("class","year_grid");

      var year_grid_exit = year_grid.exit()
      .transition()
      .duration(duration)
      .remove();

      var year_grid_update = year_grid.transition()
      .duration(duration);

      year_grid_enter.append("text")
      .attr("class","segment_title")
      .style("text-anchor", "middle")
      .text(function (d) { return d; })
      .attr("transform", function (d) {
        var year_offset = d - min_year;
        return "translate(-5," + (cell_size * 3.5 + year_offset * year_height) + ")rotate(-90)";
      });

      var day_cell = year_grid.selectAll(".day_cell")
      .data(function (d) {
        return d3.time.days(new Date(d, 0, 1), new Date(d + 1, 0, 1));
      });

      day_cell.enter()
      .append("rect")
      .attr("class", "day_cell")
      .attr("width", cell_size)
      .attr("height", cell_size)
      .attr("x", function (d) {
        return d3.time.weekOfYear(d) * cell_size;
      })
      .attr("y", function (d) {
        var year_offset = d.getUTCFullYear() - min_year;
        return d.getDay() * cell_size + year_offset * year_height;
      })
      .append("title")
      .text(function (d) {
        return moment(d).format('dddd, MMMM Do, YYYY');
      });

      var day_cell_label = year_grid.selectAll(".day_cell_label")
      .data(function (d) {
        return d3.time.days(new Date(d, 0, 1), new Date(d + 1, 0, 1));
      });

      day_cell_label.enter()
      .append("text")
      .attr("class", "day_cell_label")
      .attr("x", function (d) {
        return d3.time.weekOfYear(d) * cell_size + 0.5 * cell_size;
      })
      .attr("y", function (d) {
        var year_offset = d.getUTCFullYear() - min_year;
        return d.getDay() * cell_size + cell_size + year_offset * year_height;
      })
      .attr("dy","-0.5em")
      .text(function (d) {
        return moment(d).format('DD');
      });

      //draw the month paths
      var month_path = year_grid.selectAll(".month")
      .data(function (d) {
        return d3.time.months(new Date(d, 0, 1), new Date(d + 1, 0, 1));
      });

      month_path.enter()
      .append("path")
      .attr("class", "month")
      .attr("d", monthPath)
      .attr("transform", function (d) {
        var year_offset = d.getUTCFullYear() - min_year;
        return "translate(0," + (year_offset * year_height) + ")";
      });

      //draw the month paths
      var weekday_label = year_grid.selectAll(".weekday_label")
      .data(d3.range(0,7));

      weekday_label.enter()
      .append("text")
      .attr("class","weekday_label")
      .attr("x", year_width)
      .attr("dy","-0.5em")
      .attr("dx","-1.3em")
      .attr("y", function (d) {
        var year_offset = d3.select(this.parentNode)[0][0].__data__ - min_year;
        return (d + 1) * cell_size + year_offset * year_height;
      })
      .text(function (d) {
        return moment().day(d).format("ddd");
      });

      year_grid_update.select(".segment_title")
      .text(function (d) { return d; })
      .attr("transform", function (d) {
        var year_offset = d - min_year;
        return "translate(-5," + (cell_size * 3.5 + year_offset * year_height) + ")rotate(-90)";
      });

      year_grid_exit.select(".segment_title")
      .text("");

      year_grid_update.selectAll(".day_cell")
      .attr("width", cell_size)
      .attr("height", cell_size)
      .attr("x", function (d) {
        return d3.time.weekOfYear(d) * cell_size;
      })
      .attr("y", function (d) {
        var year_offset = d.getUTCFullYear() - min_year;
        return d.getDay() * cell_size + year_offset * year_height;
      });

      year_grid_exit.selectAll(".day_cell")
      .attr("width", 0)
      .attr("height", 0)
      .attr("x", 0)
      .attr("y", 0);

      year_grid_update.selectAll(".day_cell_label")
      .attr("x", function (d) {
        return d3.time.weekOfYear(d) * cell_size + 0.5 * cell_size;
      })
      .attr("y", function (d) {
        var year_offset = d.getUTCFullYear() - min_year;
        return d.getDay() * cell_size + cell_size + year_offset * year_height;
      })
      .attr("dy","-0.5em")
      .text(function (d) {
        return moment(d).format('DD');
      });

      year_grid_exit.selectAll(".day_cell_label")
      .attr("x", 0)
      .attr("y", 0)
      .text("");

      year_grid_update.selectAll(".month")
      .attr("d", monthPath)
      .attr("transform", function (d) {
        var year_offset = d.getUTCFullYear() - min_year;
        return "translate(0," + (year_offset * year_height) + ")";
      });

      year_grid_exit.selectAll(".month")
      .attr("y", 0)
      .attr("d", monthPath);

      year_grid_update.selectAll(".weekday_label")
      .attr("x", year_width)
      .attr("y", function (d) {
        var year_offset = d3.select(this.parentNode)[0][0].__data__ - min_year;
        return (d + 1) * cell_size + year_offset * year_height;
      })
      .attr("dy","-0.5em")
      .attr("dx","-1.3em")
      .text(function (d) {
        return moment().day(d).format("ddd");
      });

      year_grid_exit.selectAll(".weekday_label")
      .attr("x", 0)
      .attr("y", 0)
      .text("");

    });
    d3.timer.flush();

  }

  function monthPath(t0) {
    var t1 = new Date(t0.getFullYear(), t0.getMonth() + 1, 0),
    d0 = t0.getDay(), w0 = d3.time.weekOfYear(t0),
    d1 = t1.getDay(), w1 = d3.time.weekOfYear(t1);
    return "M" + (w0 + 1) * cell_size + "," + d0 * cell_size
    + "H" + w0 * cell_size + "V" + 7 * cell_size
    + "H" + w1 * cell_size + "V" + (d1 + 1) * cell_size
    + "H" + (w1 + 1) * cell_size + "V" + 0
    + "H" + (w0 + 1) * cell_size + "Z";
  };

  calendarAxis.duration = function(x) {
    if (!arguments.length) {
      return duration;
    }
    duration = x;
    return calendarAxis;
  };

  return calendarAxis;

};

module.exports = d3.calendarAxis;