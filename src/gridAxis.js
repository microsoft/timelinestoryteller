"use strict";

var d3 = require("d3");

/**

gridAxis: //a reusable grid axis

**/

d3.gridAxis = function (unit_width) {
  var cell_size = 50,
    century_height = cell_size * unit_width,
    duration = 1000,
    min_year = 1900,
    max_year = 2000;

  function gridAxis(selection) {
    selection.each(function (data) {
      var g = d3.select(this);

      // grid container items for each year
      var grid = g.selectAll(".grid")
        .data(data);

      var grid_enter = grid.enter()
        .append("g")
        .attr("class", "grid");

      grid_enter.append("rect")
        .attr("class", "year_cell")
        .attr("width", cell_size)
        .attr("height", cell_size)
        .attr("x", function (d) {
          return getXGridPosition(d);
        })
        .attr("y", 0);

      grid_enter.append("text")
        .attr("class", "year_label")
        .attr("x", function (d) {
          return getXGridPosition(d);
        })
        .attr("y", 0)
        .attr("dy", "-0.3em")
        .attr("dx", "0.3em")
        .text("");

      var grid_exit = grid.exit()
        .transition()
        .duration(duration)
        .remove();

      grid_exit.select(".year_cell")
        .attr("height", 0)
        .attr("y", 0);

      grid_exit.select(".year_label")
        .attr("y", 0)
        .text("");

      var grid_update = grid.transition()
        .duration(duration);

      grid_update.select(".year_cell")
        .attr("x", function (d) {
          return getXGridPosition(d);
        })
        .attr("y", function (d) {
          return getYGridPosition(d, min_year);
        });

      grid_update.select(".year_label")
        .attr("x", function (d) {
          return getXGridPosition(d);
        })
        .attr("y", function (d) {
          return getYGridPosition(d, min_year) + cell_size;
        })
        .text(function (d) {
          return d;
        });
    });
    d3.timer.flush();
  }

  // place an element in correct x position on grid axis
  function getXGridPosition(year) {
    if (year < 0 && year % 10 !== 0) {
      return (year % 10 + 10) * cell_size; // negative decade year correction adds 10
    }
    return year % 10 * cell_size;
  }

  // place an element in correct y position on grid axis
  function getYGridPosition(year, min) {
    var decade_of_century = 0,
      century_offset = Math.floor(year / 100) - Math.floor(min / 100),
      y_offset = 0;

    century_height = cell_size * unit_width;

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

  gridAxis.min_year = function (x) {
    if (!arguments.length) {
      return min_year;
    }
    min_year = x;
    return gridAxis;
  };

  gridAxis.max_year = function (x) {
    if (!arguments.length) {
      return max_year;
    }
    max_year = x;
    return gridAxis;
  };

  gridAxis.duration = function (x) {
    if (!arguments.length) {
      return duration;
    }
    duration = x;
    return gridAxis;
  };

  return gridAxis;
};

module.exports = d3.gridAxis;
